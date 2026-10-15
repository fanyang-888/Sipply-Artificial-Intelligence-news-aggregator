"""Per-reader re-ranking of the homepage story list.

Two signals, blended per topic_tag:

  - reading history: topics of the stories this device opened
    (``cluster_viewed`` events in the last HISTORY_WINDOW_DAYS days)
  - self-declared role: a fixed topic prior that cold-starts readers
    with little or no history

History earns weight with evidence, n / (n + PRIOR_STRENGTH) for n distinct
stories read: one click barely moves anything, and the role prior fades as
real behaviour accumulates.

The global ranking stays the base score. A reader's favourite topic can boost
a story by at most MAX_BOOST, so a clearly bigger story still outranks a
niche match. The featured story is never moved.
"""

from __future__ import annotations

import math
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.crud.cluster import RANKING_DECAY_RATE
from app.models.cluster import Cluster
from app.models.event import Event

HISTORY_WINDOW_DAYS = 30
MAX_HISTORY_STORIES = 200
PRIOR_STRENGTH = 5
MAX_BOOST = 0.5

# Topic affinity (0–1) assumed for each role before we know anything else.
ROLE_TOPIC_PRIOR: dict[str, dict[str, float]] = {
    "pm": {
        "Product Launch": 1.0,
        "Funding": 0.7,
        "Regulation": 0.6,
        "Model Release": 0.5,
        "Safety": 0.4,
    },
    "developer": {
        "Open Source": 1.0,
        "Infrastructure": 1.0,
        "Model Release": 0.8,
        "Benchmark": 0.6,
        "Research": 0.5,
    },
    "studentJobSeeker": {
        "Research": 1.0,
        "Benchmark": 0.7,
        "Model Release": 0.6,
        "Funding": 0.5,
        "Open Source": 0.4,
    },
}


def reading_history(db: Session, device_id: str, now: datetime | None = None) -> Counter[str]:
    """topic_tag → number of distinct stories this device opened recently."""
    now = now or datetime.now(timezone.utc)
    recent = db.execute(
        select(Event.entity_id)
        .where(
            Event.device_id == device_id,
            Event.type == "cluster_viewed",
            Event.created_at >= now - timedelta(days=HISTORY_WINDOW_DAYS),
        )
        .group_by(Event.entity_id)
        .order_by(func.max(Event.created_at).desc())
        .limit(MAX_HISTORY_STORIES)
    ).scalars().all()

    cluster_ids = []
    for raw in recent:
        try:
            cluster_ids.append(uuid.UUID(raw))
        except ValueError:
            continue  # entity_id is client-supplied
    if not cluster_ids:
        return Counter()

    topics = db.execute(
        select(Cluster.topic_tag).where(Cluster.id.in_(cluster_ids))
    ).scalars().all()
    return Counter(t for t in topics if t)


def topic_affinity(history: Counter[str], role: str | None) -> dict[str, float]:
    """Blend history and role prior into a 0–1 affinity per topic."""
    prior = ROLE_TOPIC_PRIOR.get(role or "", {})
    n = sum(history.values())
    if n == 0 and not prior:
        return {}

    history_weight = n / (n + PRIOR_STRENGTH)
    most_read = max(history.values(), default=0)
    from_history = {t: c / most_read for t, c in history.items()} if most_read else {}

    return {
        topic: history_weight * from_history.get(topic, 0.0)
        + (1 - history_weight) * prior.get(topic, 0.0)
        for topic in set(from_history) | set(prior)
    }


def _base_score(cluster: dict[str, Any], now: datetime) -> float:
    """cluster_score × exp(-decay × age_days): the homepage rank without radar attention.

    Only a fallback: digests carry each story's full rank value in ``rankScores``.
    """
    score = cluster.get("clusterScore") or 0.0
    last_seen = cluster.get("lastSeenAt")
    if not last_seen:
        return score
    age_days = max((now - datetime.fromisoformat(last_seen)).total_seconds() / 86400, 0.0)
    return score * math.exp(-RANKING_DECAY_RATE * age_days)


def rerank(
    clusters: list[dict[str, Any]],
    affinity: dict[str, float],
    now: datetime | None = None,
    base_scores: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """Order serialized clusters by base score × (1 + MAX_BOOST × topic affinity).

    ``base_scores`` (story id → homepage rank value) wins over recomputing from clusterScore.
    """
    now = now or datetime.now(timezone.utc)
    base_scores = base_scores or {}

    def base(c: dict[str, Any]) -> float:
        value = base_scores.get(c.get("id") or "")
        return value if value is not None else _base_score(c, now)

    scored = [
        (base(c) * (1 + MAX_BOOST * affinity.get(c.get("topicTag") or "", 0.0)), i, c)
        for i, c in enumerate(clusters)
    ]
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [c for _, _, c in scored]


def personalize_digest(
    db: Session,
    digest: dict[str, Any],
    *,
    device_id: str | None,
    role: str | None,
) -> dict[str, Any]:
    """Return a copy of the serialized digest with topClusters re-ranked for one reader.

    ``personalized`` is true only when the order actually changed.
    """
    history = reading_history(db, device_id) if device_id else Counter()
    affinity = topic_affinity(history, role)
    top = digest.get("topClusters") or []
    if not affinity or len(top) < 2:
        return {**digest, "personalized": False}

    reranked = rerank(top, affinity, base_scores=digest.get("rankScores"))
    changed = [c.get("id") for c in reranked] != [c.get("id") for c in top]
    return {**digest, "topClusters": reranked, "personalized": changed}
