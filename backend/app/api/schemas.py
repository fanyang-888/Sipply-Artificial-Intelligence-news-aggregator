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


class TopicRef(BaseModel):
    slug: str
    name: str


class ClusterResponse(BaseModel):
    id: str
    # Permanent URL key: /story/<slug>
    slug: str = ""
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
    # Company / model-family pages this story belongs to (see app/services/entities.py)
    topics: list[TopicRef] = []
    # Community posts about this story (detail endpoint only; app/services/discussions.py)
    discussions: list[RadarSignal] = []


class DigestResponse(BaseModel):
    date: str
    featured: ClusterResponse | None
    topClusters: list[ClusterResponse]
    # True when topClusters were re-ordered for this reader (history and/or role)
    personalized: bool = False
    # Story id → homepage rank value (app.services.home_ranking); personalization re-ranks on it
    rankScores: dict[str, float] = {}


# ---------------------------------------------------------------------------
# Search / archive schemas
# ---------------------------------------------------------------------------

class ArchiveClusterRow(BaseModel):
    id: str
    slug: str | None = None
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
    source: str  # family: "hn" | "news" | "youtube" | "github" | "devto" | "lobsters" | "bluesky" | "threads"
    kind: str  # "hn_story" | "hn_ask" | "gnews_item" | "yt_video"
    outlet: str | None = None
    author: str | None = None
    points: int | None = None
    numComments: int | None = None
    viewCount: int | None = None
    likeCount: int | None = None
    publishedAt: str | None
    topicId: str | None = None


class RadarCoverage(BaseModel):
    # Always "covered" on the public radar: topics Sipply has no story on are listed
    # for the editor only (GET /api/admin/radar/gaps), never on the public page
    status: str
    clusterId: str | None = None
    slug: str | None = None
    title: str | None = None
    titleZh: str | None = None


class RadarCitation(BaseModel):
    url: str
    title: str
    domain: str


class RadarAnswerCheck(BaseModel):
    # Public: what the assistant cited. Whether it cited Sipply is for the editor only
    # (GET /api/admin/radar/answers), never on the public radar
    checkedAt: str | None
    model: str
    # Cited inline in the answer, in order (first few)
    citations: list[RadarCitation]
    sourceCount: int


class RadarBriefSource(BaseModel):
    title: str
    url: str
    platform: str  # source family: "hn", "news", "bluesky", …


class RadarBriefText(BaseModel):
    en: str
    zh: str


class RadarBriefFact(RadarBriefText):
    source: RadarBriefSource


class RadarBrief(BaseModel):
    """What an editor needs to cover a topic Sipply hasn't (app.signals.briefs)."""

    headlineEn: str
    headlineZh: str
    angleEn: str | None = None
    angleZh: str | None = None
    questions: list[RadarBriefText]
    # Each fact comes from one of the topic's posts
    facts: list[RadarBriefFact]
    sources: list[RadarBriefSource]
    model: str
    writtenAt: str | None = None


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
    # Signals so far and ring then, at the end of each day of the window (oldest first, 0 = none yet)
    trailSignals: list[int] = []
    trailRings: list[int] = []
    # 1 = mainstream, 2 = picking up, 3 = weak signal (see topics.evidence_ring)
    ring: int
    momentum: str  # "new" | "rising" | "steady" | "cooling"
    isNew: bool
    summaryEn: str | None = None
    summaryZh: str | None = None
    # Only for rings 1–2 once describe_signal_topics has checked the topic
    coverage: RadarCoverage | None = None
    # What a reader would ask an AI assistant about it, and the latest check of that question
    question: str | None = None
    answerCheck: RadarAnswerCheck | None = None
    signals: list[RadarSignal]
    questions: list[RadarSignal]


class RadarGapTopic(BaseModel):
    id: str
    label: str
    labelZh: str | None = None
    ring: int
    signalCount: int
    score: float
    summaryEn: str | None = None
    summaryZh: str | None = None
    question: str | None = None
    # None until brief_signal_topics has written one (next pipeline run)
    brief: RadarBrief | None = None
    signals: list[RadarSignal]


class RadarGapsResponse(BaseModel):
    """Admin: mainstream / picking-up topics Sipply has no story on, with their content briefs."""

    generatedAt: str | None
    # Inner-ring topics whose coverage has been checked, gaps included
    checked: int
    topics: list[RadarGapTopic]


class RadarSource(BaseModel):
    key: str
    label: str
    active: bool
    signalCount: int
    lastFetchedAt: str | None


class RadarDomainShare(BaseModel):
    domain: str
    citations: int
    # Share of checks whose answer cited this domain at least once
    share: float


class RadarRecentCheck(BaseModel):
    checkedAt: str | None
    question: str
    topicLabel: str | None
    citations: list[RadarCitation]


class RadarAnswersResponse(BaseModel):
    """Public: which sites AI assistants cite for the radar questions."""

    days: int
    model: str | None
    checks: int
    questions: int
    topDomains: list[RadarDomainShare]
    recent: list[RadarRecentCheck]


class SipplyRecentCheck(RadarRecentCheck):
    sipplyCited: bool
    sipplyInSources: bool
    sipplyHasStory: bool


class SipplyAnswersResponse(RadarAnswersResponse):
    """Admin: the same, plus how often the assistant cited (or read) Sipply."""

    sipplyCited: int
    sipplyInSources: int
    # Checks on topics Sipply had a story on (only those can cite it)
    sipplyCovered: int
    sipplyCitedWhenCovered: int
    recent: list[SipplyRecentCheck]


class RadarResponse(BaseModel):
    generatedAt: str | None
    windowDays: int
    sources: list[RadarSource]
    topics: list[RadarTopic]
    # Question-shaped signals across all sources: what people are asking
    questions: list[RadarSignal]


# ClusterResponse refers to RadarSignal, defined further down
ClusterResponse.model_rebuild()
