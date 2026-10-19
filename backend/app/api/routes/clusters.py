"""Cluster routes: GET /api/clusters, GET /api/clusters/index, GET /api/clusters/{id}."""

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import String, cast, select
from sqlalchemy.orm import Session, selectinload

from app.api.mappers import cluster_to_response
from app.api.schemas import ClusterResponse, format_dt
from app.cache import cache_get, cache_set
from app.db import get_db
from app.models.cluster import Cluster
from app.models.story_redirect import StoryRedirect
from app.services.discussions import story_discussions
from app.services.headlines import story_slug
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
        # Merged into another story (app/services/story_merge.py): answer with that one
        redirect = db.get(StoryRedirect, cluster_id)
        cluster = _with_articles(db, redirect.cluster_id) if redirect else None
    if cluster is None:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return cluster


def _with_articles(db: Session, cluster_id: uuid.UUID) -> Cluster | None:
    return db.execute(
        select(Cluster).options(selectinload(Cluster.articles)).where(Cluster.id == cluster_id)
    ).scalar_one_or_none()


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
    slug: str
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
        select(Cluster.id, Cluster.last_seen_at, Cluster.slug, Cluster.headline, Cluster.representative_title)
        .where(Cluster.representative_title_zh.isnot(None))
        .order_by(Cluster.last_seen_at.desc().nullslast())
    ).all()
    data = [{"id": str(r.id), "slug": story_slug(r), "lastSeenAt": format_dt(r.last_seen_at)} for r in rows]
    cache_set(_INDEX_CACHE_KEY, data)
    return JSONResponse(content=data)


_SLUG_ID = re.compile(r"-([0-9a-f]{8,12})$")


def _by_slug(db: Session, slug: str) -> Cluster | None:
    """The story with this slug; failing that, the one whose id starts with the slug's
    trailing hex (old or mistyped words), preferring an exact slug among several; failing
    that, the story a merged one became (by its old slug, then its old id)."""
    exact = db.execute(select(Cluster).options(selectinload(Cluster.articles)).where(Cluster.slug == slug)).scalar_one_or_none()
    if exact is not None:
        return exact
    merged = db.execute(select(StoryRedirect.cluster_id).where(StoryRedirect.old_slug == slug)).scalar_one_or_none()
    if merged is not None:
        return _with_articles(db, merged)
    m = _SLUG_ID.search(slug)
    if not m:
        return None
    hexid = m.group(1)
    prefix = hexid[:8] + (f"-{hexid[8:]}" if len(hexid) > 8 else "")
    found = db.execute(
        select(Cluster).options(selectinload(Cluster.articles)).where(cast(Cluster.id, String).like(f"{prefix}%")).order_by(Cluster.first_seen_at)
    ).scalars().all()
    if found:
        return next((c for c in found if story_slug(c) == slug), found[0])
    merged = db.execute(
        select(StoryRedirect.cluster_id).where(cast(StoryRedirect.old_id, String).like(f"{prefix}%")).limit(1)
    ).scalar_one_or_none()
    return _with_articles(db, merged) if merged is not None else None


# A story only changes on a pipeline run, which clears the ai_tool:* keys
_STORY_CACHE_KEY = "ai_tool:story:{id}"
_STORY_CACHE_TTL = 3600


def _story_response(db: Session, cluster: Cluster) -> JSONResponse:
    from app.api.routes.radar import _signal_out

    key = _STORY_CACHE_KEY.format(id=cluster.id)
    data = cache_get(key)
    if data is None:
        data = cluster_to_response(
            cluster,
            # Stories about the same thing (similar text, same company, same tag), not just the same
            # type: worked out by the relate_stories stage, or here for a story it hasn't reached yet
            related_cluster_ids=cluster.related_ids if cluster.related_ids is not None else related_cluster_ids(db, cluster),
            # What people said about it on HN, Bluesky and other communities (via the Trend Radar)
            discussions=[_signal_out(s) for s in story_discussions(db, cluster.id)],
        ).model_dump(mode="json")
        cache_set(key, data, ttl=_STORY_CACHE_TTL)
    return JSONResponse(content=data)


# Declared before /{cluster_id}: a two-segment path, never an id
@router.get("/by-slug/{slug}", response_model=ClusterResponse)
def get_cluster_by_slug(slug: str, db: Session = Depends(get_db)) -> JSONResponse:
    """A story by its URL key. The response's ``slug`` is the canonical one: when it differs
    from the request, the caller redirects there."""
    cluster = _by_slug(db, slug.lower())
    if cluster is None:
        raise HTTPException(status_code=404, detail="Story not found")
    return _story_response(db, cluster)


@router.get("/{cluster_id}", response_model=ClusterResponse)
def get_cluster(cluster_id: str, db: Session = Depends(get_db)) -> JSONResponse:
    try:
        cid = uuid.UUID(cluster_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid cluster id")

    return _story_response(db, _load_cluster(db, cid))
