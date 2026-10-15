"""Evergreen pages built from the stories Sipply already has:

- GET /api/topics, /api/topics/{slug}: one page per company / model family
  (app/services/entities.py), its stories and the radar topics on it now;
- GET /api/weeks, /api/weeks/{week}: a recap per ISO week ("2026-W42").

They give AI assistants and search engines stable pages to cite for "what's
new with Anthropic" or "AI news this week". Cached until the next pipeline run.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.mappers import cluster_to_archive_row
from app.api.schemas import ArchiveClusterRow, format_dt
from app.cache import cache_get, cache_set
from app.db import get_db
from app.models.cluster import Cluster
from app.models.signal import SignalTopic
from app.services.entities import BY_SLUG, ENTITIES, entities_in
from app.signals.topics import evidence_ring

topics_router = APIRouter(prefix="/api/topics", tags=["topics"])
weeks_router = APIRouter(prefix="/api/weeks", tags=["weeks"])

RECENT_DAYS = 30
TOPIC_STORIES = 40
WEEK_STORIES = 20
WEEKS_LISTED = 26
_WEEK_RE = re.compile(r"^(\d{4})-W(\d{2})$")


class TopicSummary(BaseModel):
    slug: str
    name: str
    storyCount: int  # last RECENT_DAYS days
    totalStories: int
    latestAt: str | None


class TopicRadarItem(BaseModel):
    id: str
    label: str
    ring: int
    signalCount: int
    rising: bool


class TopicDetail(TopicSummary):
    stories: list[ArchiveClusterRow]
    radar: list[TopicRadarItem]


class WeekSummary(BaseModel):
    week: str
    start: str  # Monday, YYYY-MM-DD (UTC)
    end: str  # Sunday
    storyCount: int


class WeekCount(BaseModel):
    key: str
    name: str
    count: int


class WeekDetail(WeekSummary):
    stories: list[ArchiveClusterRow]
    categories: list[WeekCount]
    topics: list[WeekCount]


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def week_key(d: date) -> str:
    year, week, _ = d.isocalendar()
    return f"{year}-W{week:02d}"


def week_bounds(key: str) -> tuple[date, date] | None:
    """(Monday, Sunday) of an ISO week key, or None if it isn't one."""
    m = _WEEK_RE.match(key)
    if not m:
        return None
    try:
        monday = date.fromisocalendar(int(m.group(1)), int(m.group(2)), 1)
    except ValueError:
        return None
    return monday, monday + timedelta(days=6)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _stories(db: Session) -> list[Cluster]:
    """Translated stories (the same rule as the main listing), newest first."""
    return list(
        db.execute(
            select(Cluster)
            .options(selectinload(Cluster.articles))
            .where(Cluster.representative_title_zh.isnot(None))
            .order_by(Cluster.last_seen_at.desc().nullslast())
        ).scalars().all()
    )


def _cached(key: str, build) -> Any:
    data = cache_get(key)
    if data is None:
        data = build()
        cache_set(key, data)
    return data


# ---------------------------------------------------------------------------
# Topics
# ---------------------------------------------------------------------------

def build_topics(db: Session, *, now: datetime) -> list[dict[str, Any]]:
    since = now - timedelta(days=RECENT_DAYS)
    total: Counter[str] = Counter()
    recent: Counter[str] = Counter()
    latest: dict[str, datetime] = {}
    for c in _stories(db):
        seen = _aware(c.last_seen_at)
        for e in entities_in(c.representative_title):
            total[e.slug] += 1
            if seen and seen >= since:
                recent[e.slug] += 1
            if seen and (e.slug not in latest or seen > latest[e.slug]):
                latest[e.slug] = seen
    rows = [
        TopicSummary(
            slug=e.slug,
            name=e.name,
            storyCount=recent[e.slug],
            totalStories=total[e.slug],
            latestAt=format_dt(latest.get(e.slug)),
        )
        for e in ENTITIES
        if total[e.slug]
    ]
    rows.sort(key=lambda r: (-r.storyCount, -r.totalStories, r.name))
    return [r.model_dump(mode="json") for r in rows]


def build_topic(db: Session, slug: str, *, now: datetime) -> dict[str, Any] | None:
    entity = BY_SLUG.get(slug)
    if entity is None:
        return None
    since = now - timedelta(days=RECENT_DAYS)
    matched = [c for c in _stories(db) if entity.matches(c.representative_title)]
    radar = [
        TopicRadarItem(
            id=str(t.id),
            label=t.label,
            ring=evidence_ring(t.signal_count, len(t.source_counts or {})),
            signalCount=t.signal_count,
            rising=t.rising,
        )
        for t in db.execute(select(SignalTopic).order_by(SignalTopic.score.desc())).scalars()
        if entity.matches(t.label)
    ]
    return TopicDetail(
        slug=entity.slug,
        name=entity.name,
        storyCount=sum(1 for c in matched if (seen := _aware(c.last_seen_at)) is not None and seen >= since),
        totalStories=len(matched),
        latestAt=format_dt(matched[0].last_seen_at) if matched else None,
        stories=[cluster_to_archive_row(c) for c in matched[:TOPIC_STORIES]],
        radar=radar[:10],
    ).model_dump(mode="json")


@topics_router.get("", response_model=list[TopicSummary])
def list_topics(db: Session = Depends(get_db)):
    """Companies and model families with at least one story, busiest first (last 30 days)."""
    return JSONResponse(content=_cached("ai_tool:topics", lambda: build_topics(db, now=datetime.now(timezone.utc))))


@topics_router.get("/{slug}", response_model=TopicDetail)
def get_topic(slug: str, db: Session = Depends(get_db)):
    """One company / model family: its latest stories and the radar topics about it now."""
    if slug not in BY_SLUG:
        raise HTTPException(status_code=404, detail="Unknown topic")
    data = _cached(f"ai_tool:topics:{slug}", lambda: build_topic(db, slug, now=datetime.now(timezone.utc)))
    return JSONResponse(content=data)


# ---------------------------------------------------------------------------
# Weeks
# ---------------------------------------------------------------------------

def _by_week(db: Session) -> dict[str, list[Cluster]]:
    """Stories grouped by the ISO week they first appeared in."""
    weeks: dict[str, list[Cluster]] = defaultdict(list)
    for c in _stories(db):
        first = _aware(c.first_seen_at) or _aware(c.last_seen_at)
        if first:
            weeks[week_key(first.date())].append(c)
    return weeks


def _summary(key: str, stories: list[Cluster]) -> WeekSummary:
    start, end = week_bounds(key)  # type: ignore[misc]
    return WeekSummary(week=key, start=start.isoformat(), end=end.isoformat(), storyCount=len(stories))


def build_weeks(db: Session, *, limit: int) -> list[dict[str, Any]]:
    weeks = _by_week(db)
    return [_summary(k, weeks[k]).model_dump(mode="json") for k in sorted(weeks, reverse=True)[:limit]]


def build_week(db: Session, key: str) -> dict[str, Any] | None:
    stories = _by_week(db).get(key)
    if not stories:
        return None
    top = sorted(stories, key=lambda c: (c.cluster_score or 0), reverse=True)
    categories = Counter(c.topic_tag or "Other" for c in stories)
    topics: Counter[str] = Counter()
    for c in stories:
        for e in entities_in(c.representative_title):
            topics[e.slug] += 1
    summary = _summary(key, stories)
    return WeekDetail(
        **summary.model_dump(),
        stories=[cluster_to_archive_row(c) for c in top[:WEEK_STORIES]],
        categories=[WeekCount(key=k, name=k, count=n) for k, n in categories.most_common()],
        topics=[WeekCount(key=k, name=BY_SLUG[k].name, count=n) for k, n in topics.most_common()],
    ).model_dump(mode="json")


@weeks_router.get("", response_model=list[WeekSummary])
def list_weeks(limit: int = Query(default=WEEKS_LISTED, ge=1, le=104), db: Session = Depends(get_db)):
    """Weeks that have stories, newest first."""
    return JSONResponse(content=_cached(f"ai_tool:weeks:{limit}", lambda: build_weeks(db, limit=limit)))


@weeks_router.get("/{week}", response_model=WeekDetail)
def get_week(week: str, db: Session = Depends(get_db)):
    """One ISO week ("2026-W42"): its top stories, categories and companies."""
    if week_bounds(week) is None:
        raise HTTPException(status_code=422, detail="Week must look like 2026-W42")
    data = _cached(f"ai_tool:weeks:detail:{week}", lambda: build_week(db, week))
    if data is None:
        raise HTTPException(status_code=404, detail="No stories that week")
    return JSONResponse(content=data)
