"""Cluster routes: GET /api/clusters, GET /api/clusters/index, GET /api/clusters/{id}."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.mappers import cluster_to_response
from app.api.schemas import ClusterResponse, format_dt
from app.cache import cache_get, cache_set
from app.db import get_db
from app.models.cluster import Cluster
from app.services.discussions import story_discussions
from app.services.related import related_cluster_ids

router = APIRouter(prefix="/api/clusters", tags=["clusters"])


def _cache_key(limit: int, offset: int) -> str:
    return f"ai_tool:clusters:{limit}:{offset}"


def _load_cluster(db: Session, cluster_id: uuid.UUID) -> Cluster:
    cluster = db.execute(
        select(Cluster)
        .options(selectinload(Cluster.articles))
        .where(Cluster.id == cluster_id)
    ).scalar_one_or_none()
    if cluster is None:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return cluster


@router.get("", response_model=list[ClusterResponse])
def list_clusters(
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    # ── cache hit ──────────────────────────────────────────────────────────
    cached = cache_get(_cache_key(limit, offset))
    if cached is not None:
        return JSONResponse(content=cached)

    # ── cache miss: compute ─────────────────────────────────────────────────
    clusters = db.execute(
        select(Cluster)
        .options(selectinload(Cluster.articles))
        .where(Cluster.representative_title_zh.isnot(None))
        .order_by(Cluster.cluster_score.desc().nullslast(), Cluster.last_seen_at.desc().nullslast())
        .offset(offset)
        .limit(limit)
    ).scalars().all()

    results = [cluster_to_response(c) for c in clusters]

    # ── store in cache ──────────────────────────────────────────────────────
    cache_set(
        _cache_key(limit, offset),
        [r.model_dump(mode="json") for r in results],
    )

    return results


class ClusterIndexEntry(BaseModel):
    id: str
    lastSeenAt: str | None


_INDEX_CACHE_KEY = "ai_tool:clusters:index"


# Declared before /{cluster_id} so "index" isn't parsed as an id
@router.get("/index", response_model=list[ClusterIndexEntry])
def cluster_index(db: Session = Depends(get_db)):
    """Every public story's id and last update, newest first — one light query for the sitemap."""
    cached = cache_get(_INDEX_CACHE_KEY)
    if cached is not None:
        return JSONResponse(content=cached)
    rows = db.execute(
        select(Cluster.id, Cluster.last_seen_at)
        .where(Cluster.representative_title_zh.isnot(None))
        .order_by(Cluster.last_seen_at.desc().nullslast())
    ).all()
    data = [{"id": str(cid), "lastSeenAt": format_dt(seen)} for cid, seen in rows]
    cache_set(_INDEX_CACHE_KEY, data)
    return JSONResponse(content=data)


@router.get("/{cluster_id}", response_model=ClusterResponse)
def get_cluster(cluster_id: str, db: Session = Depends(get_db)) -> ClusterResponse:
    try:
        cid = uuid.UUID(cluster_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid cluster id")

    cluster = _load_cluster(db, cid)

    from app.api.routes.radar import _signal_out

    return cluster_to_response(
        cluster,
        # Stories about the same thing (similar text, same company, same tag), not just the same type
        related_cluster_ids=related_cluster_ids(db, cluster),
        # What people said about it on HN, Bluesky and other communities (via the Trend Radar)
        discussions=[_signal_out(s) for s in story_discussions(db, cluster.id)],
    )
