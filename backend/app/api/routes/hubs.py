"""Evergreen pages built from the stories Sipply already has:

- GET /api/topics, /api/topics/{slug}: one page per company / model family
  (app/services/entities.py), its stories and the radar topics on it now;
- GET /api/weeks, /api/weeks/{week}: a recap per ISO week ("2026-W42");
- GET /api/days, /api/days/{date}: the stories that appeared on one UTC day ("2026-10-18");
- GET /api/feed: the newest stories with their dates, for the RSS feed and the news sitemap.

They give AI assistants and search engines stable pages to cite for "what's
new with Anthropic", "AI news this week" or "AI news today". Cached until the
next pipeline run.
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
from app.models.source import Source
from app.models.signal import SignalTopic
from app.services.entities import BY_SLUG, ENTITIES, entities_in
from app.signals.topics import evidence_ring
from app.services.headlines import story_slug, story_title, story_title_zh

topics_router = APIRouter(prefix="/api/topics", tags=["topics"])
weeks_router = APIRouter(prefix="/api/weeks", tags=["weeks"])
days_router = APIRouter(prefix="/api/days", tags=["days"])
feed_router = APIRouter(prefix="/api/feed", tags=["feed"])

RECENT_DAYS = 30
TOPIC_STORIES = 40
WEEK_STORIES = 20
WEEK_HEADLINES = 3
# Source types (app/source_catalog/trusted_sources.yaml) that report news, as opposed to research / newsletter
NEWS_SOURCE_TYPES = ("company_news", "tech_press")
WEEKS_LISTED = 26
DAYS_LISTED = 60
FEED_ITEMS = 50
DAY_HEADLINES = 3
_WEEK_RE = re.compile(r"^(\d{4})-W(\d{2})$")
_DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


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


class WeekHeadline(BaseModel):
    id: str
    slug: str
    title: str
    titleZh: str | None


class WeekSummary(BaseModel):
    week: str
    start: str  # Monday, YYYY-MM-DD (UTC)
    end: str  # Sunday
    storyCount: int
    # New stories per day, Monday first (by the day a story first appeared)
    dailyCounts: list[int]
    # The week's highest-scoring stories, so the list says what happened that week
    headlines: list[WeekHeadline]


class WeekCount(BaseModel):
    key: str
    name: str
    count: int


class WeekDetail(WeekSummary):
    stories: list[ArchiveClusterRow]
    categories: list[WeekCount]
    topics: list[WeekCount]


class DaySummary(BaseModel):
    date: str  # YYYY-MM-DD (UTC)
    storyCount: int
    # The day's best stories, news first (the same rule as the week's headlines)
    headlines: list[WeekHeadline]


class DayDetail(DaySummary):
    stories: list[ArchiveClusterRow]
    topics: list[WeekCount]


class FeedItem(BaseModel):
    id: str
    slug: str
    title: str
    titleZh: str | None
    summary: str | None
    whyItMatters: str | None
    topicTag: str | None
    sourceNames: list[str]
    publishedAt: str | None  # when the story first appeared on Sipply
    updatedAt: str | None


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


def _headline(c: Cluster) -> WeekHeadline:
    return WeekHeadline(id=str(c.id), slug=story_slug(c), title=story_title(c), titleZh=story_title_zh(c))


def day_key(key: str) -> date | None:
    """The date of a "YYYY-MM-DD" key, or None if it isn't one."""
    if not _DAY_RE.match(key):
        return None
    try:
        return date.fromisoformat(key)
    except ValueError:
        return None


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
        for t in db.execute(
            select(SignalTopic).where(SignalTopic.newsworthy.is_not(False)).order_by(SignalTopic.score.desc())
        ).scalars()
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

def week_headlines(stories: list[Any], news_source_ids: set[Any], n: int = WEEK_HEADLINES) -> list[Any]:
    """The week's best stories carried by a news source (company newsroom, tech press), best score first;
    papers and newsletter issues only fill the remaining slots.

    By score alone the list is the same every week: the Import AI issue and two
    arXiv papers, which score high but say little about what happened.
    """
    def is_news(c: Any) -> bool:
        return any(a.source_id in news_source_ids for a in c.articles)

    return sorted(stories, key=lambda c: (is_news(c), c.cluster_score or 0), reverse=True)[:n]


def _news_source_ids(db: Session) -> set[Any]:
    return set(db.execute(select(Source.id).where(Source.type.in_(NEWS_SOURCE_TYPES))).scalars().all())


def _by_week(db: Session) -> dict[str, list[Cluster]]:
    """Stories grouped by the ISO week they first appeared in."""
    weeks: dict[str, list[Cluster]] = defaultdict(list)
    for c in _stories(db):
        first = _aware(c.first_seen_at) or _aware(c.last_seen_at)
        if first:
            weeks[week_key(first.date())].append(c)
    return weeks


def _summary(key: str, stories: list[Cluster], news_source_ids: set[Any]) -> WeekSummary:
    start, end = week_bounds(key)  # type: ignore[misc]
    daily = [0] * 7
    for c in stories:
        first = _aware(c.first_seen_at) or _aware(c.last_seen_at)
        if first and 0 <= (offset := (first.date() - start).days) < 7:
            daily[offset] += 1
    return WeekSummary(
        week=key,
        start=start.isoformat(),
        end=end.isoformat(),
        storyCount=len(stories),
        dailyCounts=daily,
        headlines=[
            _headline(c)
            for c in week_headlines(stories, news_source_ids)
        ],
    )


def build_weeks(db: Session, *, limit: int) -> list[dict[str, Any]]:
    weeks = _by_week(db)
    news = _news_source_ids(db)
    return [_summary(k, weeks[k], news).model_dump(mode="json") for k in sorted(weeks, reverse=True)[:limit]]


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
    summary = _summary(key, stories, _news_source_ids(db))
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


# ---------------------------------------------------------------------------
# Days
# ---------------------------------------------------------------------------

def _by_day(db: Session) -> dict[str, list[Cluster]]:
    """Stories grouped by the UTC day they first appeared."""
    days: dict[str, list[Cluster]] = defaultdict(list)
    for c in _stories(db):
        first = _aware(c.first_seen_at) or _aware(c.last_seen_at)
        if first:
            days[first.date().isoformat()].append(c)
    return days




def _day_summary(key: str, stories: list[Cluster], news_source_ids: set[Any]) -> DaySummary:
    return DaySummary(
        date=key,
        storyCount=len(stories),
        headlines=[_headline(c) for c in week_headlines(stories, news_source_ids, DAY_HEADLINES)],
    )


def build_days(db: Session, *, limit: int) -> list[dict[str, Any]]:
    days = _by_day(db)
    news = _news_source_ids(db)
    return [_day_summary(k, days[k], news).model_dump(mode="json") for k in sorted(days, reverse=True)[:limit]]


@days_router.get("", response_model=list[DaySummary])
def list_days(limit: int = Query(default=DAYS_LISTED, ge=1, le=366), db: Session = Depends(get_db)):
    """Days that have stories, newest first."""
    return JSONResponse(content=_cached(f"ai_tool:days:{limit}", lambda: build_days(db, limit=limit)))


def build_day(db: Session, key: str) -> dict[str, Any] | None:
    stories = _by_day(db).get(key)
    if not stories:
        return None
    news = _news_source_ids(db)
    # News first, then score: the page reads as what happened that day, papers after
    ordered = week_headlines(stories, news, len(stories))
    topics: Counter[str] = Counter()
    for c in stories:
        for e in entities_in(c.representative_title):
            topics[e.slug] += 1
    return DayDetail(
        **_day_summary(key, stories, news).model_dump(),
        stories=[cluster_to_archive_row(c) for c in ordered],
        topics=[WeekCount(key=k, name=BY_SLUG[k].name, count=n) for k, n in topics.most_common()],
    ).model_dump(mode="json")


@days_router.get("/{day}", response_model=DayDetail)
def get_day(day: str, db: Session = Depends(get_db)):
    """One UTC day ("2026-10-18"): every story that first appeared that day, news first."""
    if day_key(day) is None:
        raise HTTPException(status_code=422, detail="Day must look like 2026-10-18")
    data = _cached(f"ai_tool:days:detail:{day}", lambda: build_day(db, day))
    if data is None:
        raise HTTPException(status_code=404, detail="No stories that day")
    return JSONResponse(content=data)


# ---------------------------------------------------------------------------
# Feed (RSS and the news sitemap)
# ---------------------------------------------------------------------------

def build_feed(db: Session, *, limit: int) -> list[dict[str, Any]]:
    def first(c: Cluster) -> datetime:
        return _aware(c.first_seen_at) or _aware(c.last_seen_at) or datetime.min.replace(tzinfo=timezone.utc)

    newest = sorted(_stories(db), key=first, reverse=True)[:limit]
    return [
        FeedItem(
            id=str(c.id),
            slug=story_slug(c),
            title=story_title(c),
            titleZh=story_title_zh(c),
            summary=c.summary,
            whyItMatters=c.why_it_matters,
            topicTag=c.topic_tag,
            sourceNames=sorted({a.organization_name for a in (c.articles or []) if a.organization_name}),
            publishedAt=format_dt(first(c)),
            updatedAt=format_dt(c.last_seen_at),
        ).model_dump(mode="json")
        for c in newest
    ]


@feed_router.get("", response_model=list[FeedItem])
def get_feed(limit: int = Query(default=FEED_ITEMS, ge=1, le=200), db: Session = Depends(get_db)):
    """The newest stories by first appearance, with dates and summaries: the RSS feed and news sitemap."""
    return JSONResponse(content=_cached(f"ai_tool:feed:{limit}", lambda: build_feed(db, limit=limit)))

