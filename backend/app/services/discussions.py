"""What people said about a story: the community posts behind it.

describe_signal_topics links a mainstream / picking-up Trend Radar topic to the
Sipply story about the same event (SignalTopic.covered_cluster_id). That
topic's posts on discussion platforms (Hacker News, Lobsters, Bluesky, DEV,
Threads) are the conversation about the story; news re-reports and videos are
left out (they are more coverage, not discussion).
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.signal import Signal, SignalTopic
from app.signals.base import ASKING_FAMILIES, kinds_for_family, strip_hn_prefix
from app.signals.topics import engagement_of

DISCUSSIONS_PER_STORY = 5


def story_discussions(db: Session, cluster_id: uuid.UUID, limit: int = DISCUSSIONS_PER_STORY) -> list[Signal]:
    """The most-engaged discussion posts of the radar topics this story covers (one per title)."""
    kinds = [k for family in sorted(ASKING_FAMILIES) for k in kinds_for_family(family)]
    signals = db.execute(
        select(Signal).where(
            Signal.topic_id.in_(select(SignalTopic.id).where(SignalTopic.covered_cluster_id == cluster_id)),
            Signal.source_kind.in_(kinds),
        )
    ).scalars().all()
    picked: list[Signal] = []
    titles: set[str] = set()
    for s in sorted(signals, key=lambda s: (engagement_of(s), s.published_at), reverse=True):
        title = strip_hn_prefix(s.title).lower()
        if title in titles:
            continue
        titles.add(title)
        picked.append(s)
        if len(picked) == limit:
            break
    return picked
