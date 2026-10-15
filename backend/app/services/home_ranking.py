"""Homepage ranking: which stories lead the daily digest (site and email).

cluster_score measures how good a story's write-up is (source credibility,
relevance, richness); it barely varies (most stories score 55–65) and says
nothing about how big the news is. Ranked on it alone, the digest led with a
climate-model blog post and three arXiv papers while the week's biggest
stories (Gemini 4 Argon, the OpenAI arrest) sat lower.

So the rank adds what the Trend Radar measures, attention:

    rank = (cluster_score + ATTENTION_WEIGHT × radar topic score) × exp(-decay × age_days)

where the radar topic is one whose posts this story covers (SignalTopic.
covered_cluster_id; only mainstream and picking-up topics are matched), and
then keeps the list varied: at most KIND_CAPS papers and newsletter issues,
and the featured (first) story is a news story whenever there is one.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.crud.cluster import RANKING_DECAY_RATE
from app.models.cluster import Cluster
from app.models.signal import SignalTopic
from app.models.source import Source

# A radar topic score of 100 adds 25 points: enough to lift a story the
# community is talking about over a quiet one, not to bury every other story.
ATTENTION_WEIGHT = 0.25
# Source types (app/source_catalog/trusted_sources.yaml) that aren't news
RESEARCH_TYPES = frozenset({"research"})
NEWSLETTER_TYPES = frozenset({"newsletter"})
KIND_CAPS: dict[str, int] = {"research": 2, "newsletter": 1}
WINDOW_DAYS = 14


@dataclass(frozen=True)
class Candidate:
    id: str
    score: float  # cluster_score
    age_days: float
    attention: float  # radar topic score 0–100, 0 when no topic covers it
    kind: str  # "news" | "research" | "newsletter"


def rank_value(c: Candidate, decay_rate: float = RANKING_DECAY_RATE) -> float:
    return (c.score + ATTENTION_WEIGHT * c.attention) * math.exp(-decay_rate * max(c.age_days, 0.0))


def rank_home(candidates: list[Candidate], limit: int, decay_rate: float = RANKING_DECAY_RATE) -> list[tuple[str, float]]:
    """(id, rank value) for the digest, best first, with the kind caps and a news story first."""
    # Ties: the newer story first
    ordered = sorted(candidates, key=lambda c: (rank_value(c, decay_rate), -c.age_days), reverse=True)
    picked: list[Candidate] = []
    per_kind: dict[str, int] = {}
    for c in ordered:
        cap = KIND_CAPS.get(c.kind)
        if cap is not None and per_kind.get(c.kind, 0) >= cap:
            continue
        picked.append(c)
        per_kind[c.kind] = per_kind.get(c.kind, 0) + 1
        if len(picked) == limit:
            break
    # Too few stories to fill the list under the caps: take the skipped ones after all
    if len(picked) < limit:
        picked += [c for c in ordered if c not in picked][: limit - len(picked)]
    lead = next((i for i, c in enumerate(picked) if c.kind == "news"), 0)
    picked.insert(0, picked.pop(lead))
    return [(c.id, round(rank_value(c, decay_rate), 4)) for c in picked]


def story_kind(source_types: set[str]) -> str:
    """"news" if any source reports news (or the sources are unknown), else research / newsletter."""
    if not source_types or source_types - RESEARCH_TYPES - NEWSLETTER_TYPES:
        return "news"
    return "research" if source_types & RESEARCH_TYPES else "newsletter"


def home_ranking(
    db: Session,
    limit: int = 10,
    window_days: int = WINDOW_DAYS,
    decay_rate: float = RANKING_DECAY_RATE,
    now: datetime | None = None,
) -> list[tuple[Cluster, float]]:
    """Translated stories seen in the last ``window_days``, ranked for the homepage."""
    now = now or datetime.now(timezone.utc)
    clusters = db.execute(
        select(Cluster)
        .options(selectinload(Cluster.articles))
        .where(
            Cluster.representative_title_zh.isnot(None),
            Cluster.last_seen_at >= now - timedelta(days=window_days),
        )
    ).scalars().all()
    if not clusters:
        return []
    attention: dict[uuid.UUID, float] = dict(
        db.execute(
            select(SignalTopic.covered_cluster_id, func.max(SignalTopic.score))
            .where(SignalTopic.covered_cluster_id.isnot(None))
            .group_by(SignalTopic.covered_cluster_id)
        ).all()
    )
    source_type: dict[uuid.UUID, str] = dict(db.execute(select(Source.id, Source.type)).all())

    def age_days(c: Cluster) -> float:
        seen = c.last_seen_at
        if seen is None:
            return 0.0
        if seen.tzinfo is None:
            seen = seen.replace(tzinfo=timezone.utc)
        return (now - seen).total_seconds() / 86400

    candidates = [
        Candidate(
            id=str(c.id),
            score=c.cluster_score or 0.0,
            age_days=age_days(c),
            attention=attention.get(c.id, 0.0),
            kind=story_kind({source_type[a.source_id] for a in c.articles if a.source_id in source_type}),
        )
        for c in clusters
    ]
    by_id = {str(c.id): c for c in clusters}
    return [(by_id[cid], value) for cid, value in rank_home(candidates, limit, decay_rate)]
