"""Search / archive route: GET /api/search."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.mappers import cluster_to_archive_row
from app.api.schemas import SearchResponse
from app.db import get_db
from app.models.cluster import Cluster

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=SearchResponse)
def search(
    q: str = Query(default="", description="Search keyword"),
    topic_tags: str = Query(default="", description="Comma-separated topic_tag values, e.g. 'Model Release,Research'"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    sort_by: str = Query(default="score", description="score | date"),
    db: Session = Depends(get_db),
) -> SearchResponse:
    """Keyword search across story clusters."""

    # Only surface translated clusters (same rule as the main listing).
    # Eager-load articles so the mapper can list source names without N+1 queries.
    base_cluster_q = (
        select(Cluster)
        .options(selectinload(Cluster.articles))
        .where(Cluster.representative_title_zh.isnot(None))
    )

    if q:
        kw = f"%{q}%"
        base_cluster_q = base_cluster_q.where(
            or_(
                Cluster.representative_title.ilike(kw),
                Cluster.headline.ilike(kw),
                Cluster.summary.ilike(kw),
            )
        )
    tag_list = [t.strip() for t in topic_tags.split(",") if t.strip()]
    if tag_list:
        base_cluster_q = base_cluster_q.where(Cluster.topic_tag.in_(tag_list))

    # Count total matching rows (before pagination)
    count_q = select(func.count()).select_from(base_cluster_q.subquery())
    total = db.execute(count_q).scalar_one()

    # Sort
    if sort_by == "date":
        base_cluster_q = base_cluster_q.order_by(Cluster.last_seen_at.desc().nullslast())
    else:
        base_cluster_q = base_cluster_q.order_by(Cluster.cluster_score.desc().nullslast())

    clusters = db.execute(base_cluster_q.offset(offset).limit(limit)).scalars().all()
    cluster_rows = [cluster_to_archive_row(c) for c in clusters]

    return SearchResponse(
        query=q,
        clusters=cluster_rows,
        total=total,
    )
