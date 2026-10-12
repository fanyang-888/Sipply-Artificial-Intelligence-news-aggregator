"""Cluster routes: GET /api/clusters, GET /api/clusters/{id}."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.mappers import cluster_to_response
from app.api.schemas import ClusterResponse
from app.cache import cache_get, cache_set
from app.db import get_db
from app.models.cluster import Cluster

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


@router.get("/{cluster_id}", response_model=ClusterResponse)
def get_cluster(cluster_id: str, db: Session = Depends(get_db)) -> ClusterResponse:
    try:
        cid = uuid.UUID(cluster_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid cluster id")

    cluster = _load_cluster(db, cid)

    # Find up to 4 related clusters with the same type/theme, ranked by score
    related = db.execute(
        select(Cluster.id)
        .where(
            Cluster.type == cluster.type,
            Cluster.id != cluster.id,
            Cluster.representative_title_zh.isnot(None),
        )
        .order_by(Cluster.cluster_score.desc().nullslast(), Cluster.last_seen_at.desc().nullslast())
        .limit(4)
    ).scalars().all()
    related_ids = [str(r) for r in related]

    return cluster_to_response(cluster, related_cluster_ids=related_ids)
