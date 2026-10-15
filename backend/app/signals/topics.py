"""Build Trend Radar topics: group recent signals, score each group 0–100.

Grouping reuses the story clustering (TF-IDF cosine + union-find, see
app.services.clustering.tfidf_groups) on signal titles. The threshold was
tuned on 777 real HN stories (14 days, 8 AI keywords): at 0.30 the biggest
group chained three unrelated model launches together; 0.40 keeps each event
in one group; 0.45 starts splitting the same event apart. Single-link groups
can still chain different stories through shared words once news headlines
join in ("…over safety concerns"). A chained group is big *and* loose, so a
group above MAX_GROUP_SIZE whose titles sit far from their centroid (cohesion
below MIN_COHESION) is re-grouped on its own at a stricter threshold. On
3,790 real signals this split a 129-title blob of unrelated launches while
keeping a 58-title single story (cohesion 0.62) whole.

Score (0–100) = 0.25·volume + 0.25·engagement + 0.25·velocity
              + 0.10·recency + 0.15·relevance
  volume      — log-scaled signal count, plus a bonus when several source
                families (HN, news, YouTube) carry the topic
  engagement  — log-scaled points + comments + likes
  velocity    — daily rate over the last 3 days vs the days before
  recency     — age of the newest signal
  relevance   — the article relevance model (models/scorer.pkl) on the label

The radar page places each topic in a ring by how much evidence there is
(evidence_ring) and colors it by momentum (topic_momentum).

Topics are rebuilt from scratch on every run, in one transaction. The
description written by describe_signal_topics moves to the new topic that
shares most of an old topic's signals (match_previous), so it survives the
rebuild.
"""

from __future__ import annotations

import logging
import math
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models.signal import Signal, SignalTopic
from app.services.clustering import tfidf_groups
from app.signals.base import source_family, strip_hn_prefix
from app.signals.topic_tags import tag_titles

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.40
DATE_PROXIMITY_DAYS = 5
MAX_GROUP_SIZE = 20
MIN_COHESION = 0.58
REFINE_STEP = 0.10
RECENT_DAYS = 3
# Baseline rate (signals/day) added to both sides of the velocity ratio
VELOCITY_PRIOR_PER_DAY = 0.5
MIN_GROUP_SIZE = 2
# A lone post still counts as a topic when the community piled onto it, but not
# a lone YouTube video: its likes measure a creator's reach, not a discussion
SINGLETON_MIN_ENGAGEMENT = 100
SINGLETON_EXCLUDED_FAMILIES = frozenset({"youtube"})
MAX_TOPICS = 60
RETENTION_DAYS = 60
RISING_MIN_RATIO = 2.0
RISING_MIN_RECENT = 3

WEIGHTS = {"volume": 0.25, "engagement": 0.25, "velocity": 0.25, "recency": 0.10, "relevance": 0.15}

# Rings: 1 = mainstream (act now), 2 = picking up (prepare), 3 = weak signal (watch)
INNER_RING_MIN_SIGNALS = 15
MIDDLE_RING_MIN_SIGNALS = 5
# …or a few signals that already show up on more than one platform
MIDDLE_RING_MIN_CROSS_PLATFORM = 3
# Momentum (topic_momentum): "new" = at most NEW_MAX_EARLIER signals before the
# last RECENT_DAYS days; "rising" = discussed before and now RISING_MIN_RATIO×
# faster with ≥ RISING_MIN_RECENT recent signals; "cooling" = quiet for
# COOLING_AFTER_DAYS or slowed below COOLING_MAX_VELOCITY; else "steady".
# Before "new" existed, every fresh topic with 3 posts read as rising (29 of 40).
NEW_MAX_EARLIER = 1
COOLING_MAX_VELOCITY = 0.8
COOLING_AFTER_DAYS = 3
# Where a topic's label comes from, best first: headline-style titles before posts.
# The most-engaged post used to win outright, so YouTube and Bluesky (with far
# bigger like counts) named topics "Is this the Start of AGI? | Gemini 4 Argon
# review!" and "anotha one *OPENAI HEAD OF COMPUTING…".
LABEL_FAMILY_ORDER = ("hn", "news", "lobsters", "devto", "github", "bluesky", "threads", "youtube")
# Share of signals (Jaccard) a new topic needs with an old one to inherit its description
CARRY_OVER_MIN_OVERLAP = 0.5
DESCRIPTION_FIELDS = (
    "summary_en",
    "summary_zh",
    "question_en",
    "covered_cluster_id",
    "described_signal_count",
    "described_at",
)

_VECTORIZER: dict[str, Any] = {"stop_words": "english", "sublinear_tf": True}

RelevanceFn = Callable[[str], float]


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def engagement_of(sig: Any) -> int:
    """Points + comments + likes; news items have none of these."""
    return int((sig.points or 0) + (sig.num_comments or 0) + (sig.like_count or 0))


def lone_post_counts(sig: Any) -> bool:
    """Whether a single post is enough for a topic of its own."""
    return (
        source_family(sig.source_kind) not in SINGLETON_EXCLUDED_FAMILIES
        and engagement_of(sig) >= SINGLETON_MIN_ENGAGEMENT
    )


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def daily_counts(dates: list[datetime], now: datetime, window_days: int) -> list[int]:
    """Signals per 24h bucket, oldest first; the last bucket is the 24h before ``now``."""
    counts = [0] * window_days
    for dt in dates:
        age_days = int((now - _aware(dt)).total_seconds() // 86400)
        if 0 <= age_days < window_days:
            counts[window_days - 1 - age_days] += 1
    return counts


def velocity_ratio(counts: list[int], recent_days: int = RECENT_DAYS) -> float:
    """Daily rate in the last ``recent_days`` ÷ daily rate before, smoothed.

    A baseline rate is added to both sides so a single brand-new post reads
    as mild growth (1.7×), not an infinite surge; 1.0 means flat.
    """
    prior_days = len(counts) - recent_days
    if prior_days <= 0:
        return 1.0
    c = VELOCITY_PRIOR_PER_DAY
    recent_rate = sum(counts[-recent_days:]) / recent_days
    prior_rate = sum(counts[:-recent_days]) / prior_days
    return round((recent_rate + c) / (prior_rate + c), 2)


def _log_scale(value: float, full_at: float) -> float:
    """0 at 0, 100 at ``full_at`` and beyond, logarithmic in between."""
    if value <= 0:
        return 0.0
    return min(100.0, 100.0 * math.log1p(value) / math.log1p(full_at))


def recency_score(last_seen: datetime, now: datetime) -> float:
    age_hours = (now - _aware(last_seen)).total_seconds() / 3600
    if age_hours <= 24:
        return 100.0
    if age_hours <= 72:
        return 70.0
    if age_hours <= 24 * 7:
        return 40.0
    return 15.0


def score_components(
    *,
    signal_count: int,
    families: int,
    active_families: int,
    engagement: int,
    velocity: float,
    last_seen: datetime,
    now: datetime,
    relevance: float,
) -> dict[str, float]:
    diversity = (families - 1) / max(1, active_families - 1) * 100.0
    volume = 0.75 * _log_scale(signal_count, 25) + 0.25 * min(100.0, diversity)
    # velocity 1 (flat) → 36, 3 → 71, 6+ → 100
    velocity_score = min(100.0, 100.0 * math.log2(1 + velocity) / math.log2(7))
    return {
        "volume": round(volume, 1),
        "engagement": round(_log_scale(engagement, 3000), 1),
        "velocity": round(velocity_score, 1),
        "recency": recency_score(last_seen, now),
        "relevance": round(max(0.0, min(100.0, relevance)), 1),
    }


def total_score(components: dict[str, float]) -> float:
    return round(sum(WEIGHTS[k] * components[k] for k in WEIGHTS), 1)


def evidence_ring(signal_count: int, platforms: int) -> int:
    """1 = mainstream, 2 = picking up, 3 = weak signal (one platform, a handful of posts)."""
    if signal_count >= INNER_RING_MIN_SIGNALS:
        return 1
    if signal_count >= MIDDLE_RING_MIN_SIGNALS or (
        signal_count >= MIDDLE_RING_MIN_CROSS_PLATFORM and platforms >= 2
    ):
        return 2
    return 3


def evidence_trail(
    members: list[tuple[datetime, str]], *, now: datetime, days: int
) -> tuple[list[int], list[int]]:
    """How a topic's evidence built up: (signals so far, ring then) at the end of each
    of the last ``days`` days, oldest first; the last entry is ``now``. Ring 0 = no
    signal yet. Rebuilt from the members' publish dates, so it needs no history table;
    rings can only move inward over time because signals only accumulate.
    """
    signals: list[int] = []
    rings: list[int] = []
    for back in range(days - 1, -1, -1):
        cutoff = now - timedelta(days=back)
        seen = [family for published, family in members if _aware(published) <= cutoff]
        signals.append(len(seen))
        rings.append(evidence_ring(len(seen), len(set(seen))) if seen else 0)
    return signals, rings


def topic_momentum(*, counts: list[int], velocity: float, last_seen: datetime | None, now: datetime) -> str:
    """"new", "rising", "steady" or "cooling" from daily counts (oldest first, ending at ``now``)."""
    if last_seen is None or (now - _aware(last_seen)) > timedelta(days=COOLING_AFTER_DAYS):
        return "cooling"
    recent = sum(counts[-RECENT_DAYS:])
    earlier = sum(counts[:-RECENT_DAYS])
    if earlier <= NEW_MAX_EARLIER:
        return "new"
    if velocity >= RISING_MIN_RATIO and recent >= RISING_MIN_RECENT:
        return "rising"
    if velocity < COOLING_MAX_VELOCITY:
        return "cooling"
    return "steady"


def match_previous(
    new_groups: list[set[Any]],
    old_groups: dict[Any, set[Any]],
    *,
    min_overlap: float = CARRY_OVER_MIN_OVERLAP,
) -> list[Any | None]:
    """For each new group, the old group key it continues (most shared members), or None.

    Overlap is Jaccard on member ids; best pairs are taken first and each old
    group continues into at most one new group.
    """
    pairs: list[tuple[float, int, Any]] = []
    for i, new in enumerate(new_groups):
        for key, old in old_groups.items():
            union = len(new | old)
            overlap = len(new & old) / union if union else 0.0
            if overlap >= min_overlap:
                pairs.append((overlap, i, key))
    pairs.sort(key=lambda p: -p[0])
    out: list[Any | None] = [None] * len(new_groups)
    used: set[Any] = set()
    for _, i, key in pairs:
        if out[i] is None and key not in used:
            out[i] = key
            used.add(key)
    return out


def top_terms(matrix: Any, indices: list[int], feature_names: list[str], k: int = 4) -> list[str]:
    """Highest summed TF-IDF terms across a group's titles."""
    weights = matrix[indices].sum(axis=0).A1
    order = weights.argsort()[::-1]
    return [feature_names[i] for i in order[:k] if weights[i] > 0]


def cohesion(matrix: Any, indices: list[int]) -> float:
    """Mean cosine similarity of the group's (L2-normalized) rows to their centroid."""
    import numpy as np

    rows = matrix[indices]
    centroid = np.asarray(rows.mean(axis=0)).ravel()
    norm = float(np.linalg.norm(centroid))
    if norm == 0:
        return 0.0
    return float(np.mean(rows @ centroid) / norm)


def refine_groups(
    groups: list[list[int]],
    texts: list[str],
    dates: list[datetime],
    matrix: Any,
    *,
    threshold: float = SIMILARITY_THRESHOLD,
) -> list[list[int]]:
    """Re-group big, loose groups on their own (fresh IDF) at a stricter threshold."""
    out: list[list[int]] = []
    for group in groups:
        next_threshold = threshold + REFINE_STEP
        if (
            len(group) <= MAX_GROUP_SIZE
            or next_threshold >= 0.9
            or cohesion(matrix, group) >= MIN_COHESION
        ):
            out.append(group)
            continue
        sub = tfidf_groups(
            [texts[i] for i in group],
            [dates[i] for i in group],
            threshold=next_threshold,
            date_proximity_days=DATE_PROXIMITY_DAYS,
            vectorizer_kwargs=_VECTORIZER,
        )
        if sub is None:
            out.append(group)
            continue
        out.extend(
            refine_groups(
                [[group[j] for j in s] for s in sub[0]], texts, dates, matrix, threshold=next_threshold
            )
        )
    return out


def default_relevance_fn() -> RelevanceFn:
    """Relevance 0–100 from the article model; a flat 50 when the model is missing."""
    from app.services.ml_scorer import get_ml_scorer

    scorer = get_ml_scorer()
    if scorer is None:
        return lambda title: 50.0

    def _fn(title: str) -> float:
        p = scorer.predict(title, "")
        return (((p["audience_fit"] + p["practical_relevance"]) / 2) - 1) / 4 * 100

    return _fn


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

@dataclass
class TopicDraft:
    label: str
    topic_tag: str
    keywords: list[str]
    signal_ids: list[Any]
    signal_count: int
    source_counts: dict[str, int]
    engagement: int
    components: dict[str, float]
    score: float
    velocity: float
    rising: bool
    daily_counts: list[int]
    first_seen_at: datetime
    last_seen_at: datetime


def draft_topics(
    signals: list[Any],
    *,
    now: datetime,
    window_days: int,
    active_families: int,
    relevance_fn: RelevanceFn,
) -> tuple[list[TopicDraft], int]:
    """Group and score signals (pure, no DB). Returns (top drafts, group count)."""
    if not signals:
        return [], 0
    texts = [strip_hn_prefix(s.title) for s in signals]
    dates = [_aware(s.published_at) for s in signals]
    result = tfidf_groups(
        texts,
        dates,
        threshold=SIMILARITY_THRESHOLD,
        date_proximity_days=DATE_PROXIMITY_DAYS,
        vectorizer_kwargs=_VECTORIZER,
    )
    if result is None:
        return [], 0
    groups, matrix, feature_names = result
    groups = refine_groups(groups, texts, dates, matrix)

    drafts: list[TopicDraft] = []
    for indices in groups:
        members = [signals[i] for i in indices]
        if len(members) < MIN_GROUP_SIZE and not lone_post_counts(members[0]):
            continue
        drafts.append(
            draft_group(
                members,
                keywords=top_terms(matrix, indices, feature_names),
                now=now,
                window_days=window_days,
                active_families=active_families,
                relevance_fn=relevance_fn,
            )
        )
    drafts.sort(key=lambda d: (-d.score, -d.engagement))
    return drafts[:MAX_TOPICS], len(groups)


def label_signal(members: list[Any]) -> Any:
    """The signal whose title names the topic: from the best family present
    (LABEL_FAMILY_ORDER), then the most engaged, then the newest."""

    def rank(s: Any) -> int:
        family = source_family(s.source_kind)
        return LABEL_FAMILY_ORDER.index(family) if family in LABEL_FAMILY_ORDER else len(LABEL_FAMILY_ORDER)

    best = min(rank(s) for s in members)
    return max(
        (s for s in members if rank(s) == best),
        key=lambda s: (engagement_of(s), _aware(s.published_at)),
    )


def draft_group(
    members: list[Any],
    *,
    keywords: list[str],
    now: datetime,
    window_days: int,
    active_families: int,
    relevance_fn: RelevanceFn,
) -> TopicDraft:
    """Score one group of signals (also used to re-score topics merged by app/signals/merge.py)."""
    engagement = sum(engagement_of(s) for s in members)
    dates = [_aware(s.published_at) for s in members]
    counts = daily_counts(dates, now, window_days)
    ratio = velocity_ratio(counts)
    families = Counter(source_family(s.source_kind) for s in members)
    lead = label_signal(members)
    components = score_components(
        signal_count=len(members),
        families=len(families),
        active_families=active_families,
        engagement=engagement,
        velocity=ratio,
        last_seen=max(dates),
        now=now,
        relevance=relevance_fn(lead.title),
    )
    momentum = topic_momentum(counts=counts, velocity=ratio, last_seen=max(dates), now=now)
    return TopicDraft(
        label=lead.title,
        topic_tag=tag_titles([s.title for s in members]),
        keywords=keywords,
        signal_ids=[s.id for s in members],
        signal_count=len(members),
        source_counts=dict(families),
        engagement=engagement,
        components=components,
        score=total_score(components),
        velocity=ratio,
        rising=momentum == "rising",
        daily_counts=counts,
        first_seen_at=min(dates),
        last_seen_at=max(dates),
    )


def build_topics(
    db: Session,
    *,
    now: datetime | None = None,
    window_days: int = 14,
    active_families: int = 2,
    relevance_fn: RelevanceFn | None = None,
) -> dict[str, int]:
    """Replace all signal_topics with a fresh build over the last ``window_days``."""
    now = now or datetime.now(timezone.utc)
    signals = list(
        db.execute(
            select(Signal).where(Signal.published_at >= now - timedelta(days=window_days))
        ).scalars().all()
    )
    drafts, n_groups = draft_topics(
        signals,
        now=now,
        window_days=window_days,
        active_families=active_families,
        relevance_fn=relevance_fn or default_relevance_fn(),
    )
    previous = _previous_descriptions(db)
    continues = match_previous(
        [set(d.signal_ids) for d in drafts], {key: members for key, (members, _) in previous.items()}
    )

    # FK ON DELETE SET NULL clears signals.topic_id for the old topics
    db.execute(delete(SignalTopic))
    for d, prev_key in zip(drafts, continues):
        carried = previous[prev_key][1] if prev_key is not None else {}
        topic = SignalTopic(
            **carried,
            label=d.label,
            topic_tag=d.topic_tag,
            keywords=d.keywords,
            signal_count=d.signal_count,
            source_counts=d.source_counts,
            engagement=d.engagement,
            score=d.score,
            score_components=d.components,
            velocity=d.velocity,
            rising=d.rising,
            daily_counts=d.daily_counts,
            first_seen_at=d.first_seen_at,
            last_seen_at=d.last_seen_at,
        )
        db.add(topic)
        db.flush()
        db.execute(update(Signal).where(Signal.id.in_(d.signal_ids)).values(topic_id=topic.id))
    pruned = db.execute(
        delete(Signal).where(Signal.published_at < now - timedelta(days=RETENTION_DAYS))
    ).rowcount or 0
    db.commit()
    # Old topics were deleted in SQL; drop any stale ORM copies
    db.expire_all()

    summary = {
        "signals": len(signals),
        "groups": n_groups,
        "topics": len(drafts),
        "rising": sum(1 for d in drafts if d.rising),
        "descriptions_kept": sum(1 for k in continues if k is not None),
        "pruned": pruned,
    }
    logger.info("signal topics built %s", summary)
    return summary


def _previous_descriptions(db: Session) -> dict[Any, tuple[set[Any], dict[str, Any]]]:
    """Described topics from the last build: {topic id: (member signal ids, description fields)}."""
    described = db.execute(select(SignalTopic).where(SignalTopic.described_at.is_not(None))).scalars().all()
    if not described:
        return {}
    members: dict[Any, set[Any]] = {t.id: set() for t in described}
    for signal_id, topic_id in db.execute(
        select(Signal.id, Signal.topic_id).where(Signal.topic_id.in_(list(members)))
    ).all():
        members[topic_id].add(signal_id)
    return {
        t.id: (members[t.id], {f: getattr(t, f) for f in DESCRIPTION_FIELDS})
        for t in described
    }
