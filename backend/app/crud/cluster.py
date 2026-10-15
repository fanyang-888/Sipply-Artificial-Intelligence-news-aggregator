"""CRUD helpers for clusters."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.article import Article
from app.models.cluster import Cluster

# Homepage ranking decay per day of age; app.services.personalization reuses it
# to recompute the same base score, so keep a single source.
RANKING_DECAY_RATE = 0.15


def create_cluster(
    db: Session,
    *,
    cluster_type: str,
    status: str,
    representative_title: str,
    cluster_score: float | None,
    article_count: int,
    source_count: int,
    first_seen_at: datetime | None,
    last_seen_at: datetime | None,
    tags: list[Any] | None = None,
    meta: dict[str, Any] | None = None,
) -> Cluster:
    """Insert a new Cluster row and return it. Does not commit."""
    cluster = Cluster(
        id=uuid.uuid4(),
        type=cluster_type,
        status=status,
        representative_title=representative_title,
        cluster_score=cluster_score,
        article_count=article_count,
        source_count=source_count,
        first_seen_at=first_seen_at,
        last_seen_at=last_seen_at,
        tags=tags or [],
        meta=meta or {},
    )
    db.add(cluster)
    db.flush()  # populate cluster.id without full commit
    return cluster


def assign_articles_to_cluster(
    db: Session,
    cluster_id: uuid.UUID,
    articles: list[Article],
) -> None:
    """Set cluster_id on each article. Does not commit."""
    for article in articles:
        article.cluster_id = cluster_id


def get_cluster_by_id(db: Session, cluster_id: uuid.UUID) -> Cluster | None:
    return db.get(Cluster, cluster_id)


def delete_cluster(db: Session, cluster_id: uuid.UUID) -> None:
    """Delete a cluster row by id. Does not commit."""
    cluster = db.get(Cluster, cluster_id)
    if cluster:
        db.delete(cluster)


def get_top_clusters(
    db: Session,
    limit: int = 10,
    window_days: int = 14,
    decay_rate: float = RANKING_DECAY_RATE,
) -> list[Cluster]:
    """The homepage / digest email stories, best first (translated, last ``window_days`` days).

    Ranking: (cluster_score + radar attention) × exp(-decay_rate × age_days), with
    caps on papers and newsletter issues; see app.services.home_ranking.
    """
    from app.services.home_ranking import home_ranking

    return [c for c, _ in home_ranking(db, limit=limit, window_days=window_days, decay_rate=decay_rate)]
