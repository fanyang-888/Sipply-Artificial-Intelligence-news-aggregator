"""Pydantic response schemas that match the frontend TypeScript types.

The frontend expects LocalizedString = { en: string; zh?: string }.
Cluster fields are translated to Chinese by the pipeline
(translate_clusters.py) and returned as bilingual LocalizedStr objects. The frontend falls back to `en` when `zh` is absent.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Shared primitives
# ---------------------------------------------------------------------------

class LocalizedStr(BaseModel):
    en: str
    zh: str | None = None


class AudienceBlocks(BaseModel):
    pm: LocalizedStr
    developer: LocalizedStr
    studentJobSeeker: LocalizedStr


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def localized(text: str | None, fallback: str = "") -> LocalizedStr:
    return LocalizedStr(en=(text or fallback) or fallback)


def localized_bilingual(en: str | None, zh: str | None, fallback: str = "") -> LocalizedStr:
    """Build a LocalizedStr with both en and zh populated when available."""
    return LocalizedStr(en=(en or fallback) or fallback, zh=zh or None)


def freshness_label(dt: datetime | None) -> str:
    if dt is None:
        return "Recently"
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt
    total_minutes = diff.total_seconds() / 60
    if total_minutes < 2:
        return "Just now"
    if total_minutes < 60:
        return f"Updated {int(total_minutes)}m ago"
    hours = total_minutes / 60
    if hours < 24:
        return f"Updated {int(hours)}h ago"
    days = hours / 24
    return f"Updated {int(days)}d ago"


def format_dt(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Cluster schemas
# ---------------------------------------------------------------------------

class ArticleInCluster(BaseModel):
    id: str
    title: str
    url: str
    sourceName: str | None
    publishedAt: str | None
    excerpt: str | None


class ClusterResponse(BaseModel):
    id: str
    clusterType: str
    title: LocalizedStr
    theme: str
    themes: list[str]
    tags: list[str]
    topicTag: str | None = None
    storyStatus: str
    clusterScore: float | None
    freshnessLabel: str
    firstSeenAt: str | None
    lastSeenAt: str | None
    summary: LocalizedStr
    takeaways: list[LocalizedStr]
    whyItMatters: LocalizedStr
    audience: AudienceBlocks
    articleIds: list[str]
    articles: list[ArticleInCluster] = []
    relatedClusterIds: list[str]
    articleCount: int
    sourceCount: int


class DigestResponse(BaseModel):
    date: str
    featured: ClusterResponse | None
    topClusters: list[ClusterResponse]
    # True when topClusters were re-ordered for this reader (history and/or role)
    personalized: bool = False


# ---------------------------------------------------------------------------
# Search / archive schemas
# ---------------------------------------------------------------------------

class ArchiveClusterRow(BaseModel):
    id: str
    type: str = "cluster"
    title: str
    title_zh: str | None = None
    summary: str | None
    summary_zh: str | None = None
    tags: list[str]
    theme: str
    topicTag: str | None = None
    storyStatus: str
    clusterScore: float | None
    lastSeenAt: str | None
    sourceCount: int
    sourceNames: list[str] = []


class SearchResponse(BaseModel):
    query: str
    clusters: list[ArchiveClusterRow]
    total: int


# ---------------------------------------------------------------------------
# Trend Radar schemas
# ---------------------------------------------------------------------------

class RadarSignal(BaseModel):
    id: str
    title: str
    titleZh: str | None = None
    url: str
    discussionUrl: str | None = None
    source: str  # "hn" | "news" | "youtube"
    kind: str  # "hn_story" | "hn_ask" | "gnews_item" | "yt_video"
    outlet: str | None = None
    author: str | None = None
    points: int | None = None
    numComments: int | None = None
    viewCount: int | None = None
    likeCount: int | None = None
    publishedAt: str | None
    topicId: str | None = None


class RadarTopic(BaseModel):
    id: str
    label: str
    labelZh: str | None = None
    topicTag: str
    keywords: list[str]
    score: float
    components: dict[str, float]
    velocity: float
    rising: bool
    signalCount: int
    sourceCounts: dict[str, int]
    engagement: int
    firstSeenAt: str | None
    lastSeenAt: str | None
    # Signals per day across the radar window, oldest first
    dailyCounts: list[int]
    signals: list[RadarSignal]
    questions: list[RadarSignal]


class RadarSource(BaseModel):
    key: str
    label: str
    active: bool
    signalCount: int
    lastFetchedAt: str | None


class RadarResponse(BaseModel):
    generatedAt: str | None
    windowDays: int
    sources: list[RadarSource]
    topics: list[RadarTopic]
    # Question-shaped signals across all sources: what people are asking
    questions: list[RadarSignal]
