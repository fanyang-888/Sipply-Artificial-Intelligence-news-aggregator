"""Admin routes: pipeline trigger + stats + source health.

POST /api/admin/trigger-pipeline  — Requires JWT Bearer token
GET  /api/admin/stats             — Aggregate counts (open, no auth)
GET  /api/admin/sources           — Source list with article counts (open, no auth)
GET  /api/admin/articles          — Recent articles with filter/score info (open, no auth)
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models.article import Article
from app.models.cluster import Cluster
from app.models.event import Event
from app.models.pipeline_run import PipelineRun
from app.models.source import Source

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Pipeline trigger
# ---------------------------------------------------------------------------

class TriggerResponse(BaseModel):
    status: str
    message: str


async def _run_pipeline_bg(triggered_by: str) -> None:
    from scripts import run_pipeline
    logger.info("admin trigger: pipeline starting triggered_by=%s", triggered_by)
    exit_code = await asyncio.to_thread(run_pipeline.main, triggered_by=triggered_by)
    logger.info("admin trigger: pipeline finished exit_code=%s", exit_code)


@router.post("/trigger-pipeline", response_model=TriggerResponse)
async def trigger_pipeline(
    background_tasks: BackgroundTasks,
    _user: str = Depends(get_current_user),
) -> TriggerResponse:
    background_tasks.add_task(_run_pipeline_bg, triggered_by="api")
    return TriggerResponse(
        status="accepted",
        message="Pipeline started in background. Poll GET /api/pipeline-runs for progress.",
    )


# ---------------------------------------------------------------------------
# Stats dashboard
# ---------------------------------------------------------------------------

class PipelineRunSummary(BaseModel):
    id: str
    status: str
    started_at: str
    total_elapsed_sec: float | None


class StatsResponse(BaseModel):
    total_articles: int
    articles_last_24h: int
    total_clusters: int
    clusters_last_7d: int
    total_sources: int
    active_sources: int
    last_pipeline_run: PipelineRunSummary | None


@router.get("/stats", response_model=StatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> StatsResponse:
    now = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)
    cutoff_7d = now - timedelta(days=7)

    total_articles = db.scalar(select(func.count()).select_from(Article)) or 0
    articles_last_24h = (
        db.scalar(
            select(func.count()).select_from(Article).where(Article.fetched_at >= cutoff_24h)
        )
        or 0
    )
    total_clusters = (
        db.scalar(
            select(func.count()).select_from(Cluster).where(
                Cluster.representative_title_zh.isnot(None)
            )
        )
        or 0
    )
    clusters_last_7d = (
        db.scalar(
            select(func.count()).select_from(Cluster).where(
                Cluster.representative_title_zh.isnot(None),
                Cluster.last_seen_at >= cutoff_7d,
            )
        )
        or 0
    )
    total_sources = db.scalar(select(func.count()).select_from(Source)) or 0
    active_sources = (
        db.scalar(select(func.count()).select_from(Source).where(Source.is_active.is_(True)))
        or 0
    )

    last_run = db.execute(
        select(PipelineRun).order_by(PipelineRun.started_at.desc()).limit(1)
    ).scalar_one_or_none()

    last_run_summary: PipelineRunSummary | None = None
    if last_run:
        sa = last_run.started_at
        if sa and sa.tzinfo is None:
            sa = sa.replace(tzinfo=timezone.utc)
        last_run_summary = PipelineRunSummary(
            id=str(last_run.id),
            status=last_run.status,
            started_at=sa.isoformat() if sa else "",
            total_elapsed_sec=last_run.total_elapsed_sec,
        )

    return StatsResponse(
        total_articles=total_articles,
        articles_last_24h=articles_last_24h,
        total_clusters=total_clusters,
        clusters_last_7d=clusters_last_7d,
        total_sources=total_sources,
        active_sources=active_sources,
        last_pipeline_run=last_run_summary,
    )


# ---------------------------------------------------------------------------
# Sources health
# ---------------------------------------------------------------------------

class SourceRow(BaseModel):
    id: str
    slug: str | None
    name: str
    type: str
    is_active: bool
    fetch_frequency_minutes: int
    last_polled_at: str | None
    etag: str | None
    article_count: int
    articles_last_7d: int


@router.get("/radar/gaps")
def radar_gaps(db: Session = Depends(get_db), _user: str = Depends(get_current_user)):
    """Trend Radar topics Sipply has no story on yet, with their content briefs (see app.signals.briefs)."""
    from app.api.routes.radar import build_gaps

    return build_gaps(db)


@router.get("/sources", response_model=list[SourceRow])
def list_sources(
    db: Session = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> list[SourceRow]:
    cutoff_7d = datetime.now(timezone.utc) - timedelta(days=7)
    sources = db.execute(select(Source).order_by(Source.name)).scalars().all()
    rows: list[SourceRow] = []
    for src in sources:
        total = db.scalar(
            select(func.count()).select_from(Article).where(Article.source_id == src.id)
        ) or 0
        last_7d = db.scalar(
            select(func.count()).select_from(Article).where(
                Article.source_id == src.id,
                Article.fetched_at >= cutoff_7d,
            )
        ) or 0
        lp = src.last_polled_at
        if lp and lp.tzinfo is None:
            lp = lp.replace(tzinfo=timezone.utc)
        rows.append(
            SourceRow(
                id=str(src.id),
                slug=src.slug,
                name=src.name,
                type=src.type,
                is_active=src.is_active,
                fetch_frequency_minutes=src.fetch_frequency_minutes,
                last_polled_at=lp.isoformat() if lp else None,
                etag=src.etag,
                article_count=total,
                articles_last_7d=last_7d,
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Event stats (click tracking)
# ---------------------------------------------------------------------------

class EventStats(BaseModel):
    type: str
    top_entities: list[dict]   # [{entity_id, count}] sorted descending
    daily_totals: list[dict]   # [{date, count}] last 7 days


@router.get("/events", response_model=list[EventStats])
def get_event_stats(
    _user: str = Depends(get_current_user),
) -> list[EventStats]:
    """Return click-tracking stats from Redis counters."""
    from datetime import date, timedelta
    results: list[EventStats] = []
    try:
        from app.cache import _get_client
        client = _get_client()
        if client is None:
            return []
        event_types = ["cluster_viewed"]
        today = date.today()
        for etype in event_types:
            # Top entities by lifetime count
            raw = client.hgetall(f"events:{etype}") or {}
            top = sorted(
                [{"entity_id": k, "count": int(v)} for k, v in raw.items()],
                key=lambda x: x["count"],
                reverse=True,
            )[:20]
            # Daily totals for last 7 days
            daily: list[dict] = []
            for i in range(7):
                d = (today - timedelta(days=i)).isoformat()
                count = int(client.get(f"events:daily:{d}:{etype}") or 0)
                daily.append({"date": d, "count": count})
            results.append(EventStats(type=etype, top_entities=top, daily_totals=daily))
    except Exception as exc:
        logger.warning("get_event_stats error: %s", exc)
    return results


# ---------------------------------------------------------------------------
# Product metrics — North Star (Weekly Engaged Readers) + retention
# ---------------------------------------------------------------------------

_READ_TYPES = ("cluster_viewed",)


class DailyActive(BaseModel):
    date: str
    devices: int


class ProductMetrics(BaseModel):
    weekly_engaged_readers: int   # NSM: distinct devices with a read event, last 7d
    returning_readers: int        # devices that read on >= 2 distinct days, last 7d
    total_read_events_7d: int
    daily_active: list[DailyActive]  # distinct reading devices per day, last 7d


@router.get("/metrics", response_model=ProductMetrics)
def get_product_metrics(
    db: Session = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> ProductMetrics:
    """North Star + retention metrics, computed from the durable events table."""
    since = datetime.now(timezone.utc) - timedelta(days=7)
    day = func.date(Event.created_at)

    def _read_filter(stmt):
        return (
            stmt.where(Event.type.in_(_READ_TYPES))
            .where(Event.created_at >= since)
            .where(Event.device_id.isnot(None))
        )

    # NSM: distinct devices with >= 1 read event in the last 7 days
    wer = db.execute(
        _read_filter(select(func.count(func.distinct(Event.device_id))))
    ).scalar_one()

    # Total read events in the last 7 days (includes null-device legacy rows)
    total_read = db.execute(
        select(func.count())
        .select_from(Event)
        .where(Event.type.in_(_READ_TYPES))
        .where(Event.created_at >= since)
    ).scalar_one()

    # Returning readers: devices active on >= 2 distinct days
    per_device_days = (
        _read_filter(select(Event.device_id, func.count(func.distinct(day)).label("days")))
        .group_by(Event.device_id)
        .subquery()
    )
    returning = db.execute(
        select(func.count())
        .select_from(per_device_days)
        .where(per_device_days.c.days >= 2)
    ).scalar_one()

    # Daily active reading devices, last 7 days
    rows = db.execute(
        _read_filter(select(day.label("d"), func.count(func.distinct(Event.device_id))))
        .group_by(day)
        .order_by(day)
    ).all()
    daily = [DailyActive(date=str(r[0]), devices=int(r[1])) for r in rows]

    return ProductMetrics(
        weekly_engaged_readers=int(wer or 0),
        returning_readers=int(returning or 0),
        total_read_events_7d=int(total_read or 0),
        daily_active=daily,
    )


# ---------------------------------------------------------------------------
# Articles browser
# ---------------------------------------------------------------------------

class ArticleRow(BaseModel):
    id: str
    title: str
    url: str
    source_name: str | None
    published_at: str | None
    fetched_at: str | None
    signal_score: float | None
    is_filtered_out: bool | None
    filter_reason: str | None
    cluster_id: str | None
    word_count: int | None


@router.get("/articles", response_model=list[ArticleRow])
def list_articles(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    source_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> list[ArticleRow]:
    import uuid
    from sqlalchemy.orm import selectinload

    stmt = (
        select(Article)
        .options(selectinload(Article.source))
        .order_by(Article.fetched_at.desc().nullslast())
    )
    if source_id:
        try:
            stmt = stmt.where(Article.source_id == uuid.UUID(source_id))
        except ValueError:
            pass
    stmt = stmt.offset(offset).limit(limit)

    articles = db.execute(stmt).scalars().all()
    rows: list[ArticleRow] = []
    for a in articles:
        fa = a.fetched_at
        if fa and fa.tzinfo is None:
            fa = fa.replace(tzinfo=timezone.utc)
        pa = a.published_at
        if pa and pa.tzinfo is None:
            pa = pa.replace(tzinfo=timezone.utc)
        rows.append(
            ArticleRow(
                id=str(a.id),
                title=a.title or "",
                url=a.url,
                source_name=a.source.name if a.source else None,
                published_at=pa.isoformat() if pa else None,
                fetched_at=fa.isoformat() if fa else None,
                signal_score=a.signal_score,
                is_filtered_out=a.is_filtered_out,
                filter_reason=a.filter_reason,
                cluster_id=str(a.cluster_id) if a.cluster_id else None,
                word_count=a.word_count,
            )
        )
    return rows
