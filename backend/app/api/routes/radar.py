"""GET /api/radar — Trend Radar: scored community/search topics."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.schemas import RadarResponse, RadarSignal, RadarSource, RadarTopic, format_dt
from app.cache import cache_get, cache_set
from app.db import get_db
from app.models.signal import Signal, SignalTopic
from app.signals.base import FAMILY_LABELS, credentials_from_settings, source_family
from app.signals.config import radar_config
from app.signals.topics import engagement_of

router = APIRouter(prefix="/api/radar", tags=["radar"])

_CACHE_KEY = "ai_tool:radar:{limit}"
SIGNALS_PER_TOPIC = 5
QUESTIONS_PER_TOPIC = 3
TOP_QUESTIONS = 12


def _signal_out(s: Signal) -> RadarSignal:
    return RadarSignal(
        id=str(s.id),
        title=s.title,
        titleZh=s.title_zh,
        url=s.url,
        discussionUrl=s.discussion_url,
        source=source_family(s.source_kind),
        kind=s.source_kind,
        outlet=s.outlet,
        author=s.author,
        points=s.points,
        numComments=s.num_comments,
        viewCount=s.view_count,
        likeCount=s.like_count,
        publishedAt=format_dt(s.published_at),
        topicId=str(s.topic_id) if s.topic_id else None,
    )


def _by_engagement(signals: list[Signal]) -> list[Signal]:
    return sorted(signals, key=lambda s: (engagement_of(s), s.published_at), reverse=True)


def build_radar(db: Session, *, limit: int, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    window_days = radar_config().window_days
    window_start = now - timedelta(days=window_days)

    topics = list(
        db.execute(
            select(SignalTopic).order_by(SignalTopic.score.desc(), SignalTopic.engagement.desc()).limit(limit)
        ).scalars().all()
    )
    members: dict[Any, list[Signal]] = defaultdict(list)
    if topics:
        rows = db.execute(
            select(Signal).where(Signal.topic_id.in_([t.id for t in topics]))
        ).scalars().all()
        for s in rows:
            members[s.topic_id].append(s)

    topic_out = []
    for t in topics:
        ranked = _by_engagement(members.get(t.id, []))
        topic_out.append(
            RadarTopic(
                id=str(t.id),
                label=t.label,
                # The label is the lead post's title, so its translation is that post's
                labelZh=next((s.title_zh for s in ranked if s.title == t.label and s.title_zh), None),
                topicTag=t.topic_tag,
                keywords=t.keywords or [],
                score=t.score,
                components=t.score_components or {},
                velocity=t.velocity,
                rising=t.rising,
                signalCount=t.signal_count,
                sourceCounts=t.source_counts or {},
                engagement=t.engagement,
                firstSeenAt=format_dt(t.first_seen_at),
                lastSeenAt=format_dt(t.last_seen_at),
                dailyCounts=t.daily_counts or [],
                signals=[_signal_out(s) for s in ranked[:SIGNALS_PER_TOPIC]],
                questions=[_signal_out(s) for s in ranked if s.is_question][:QUESTIONS_PER_TOPIC],
            )
        )

    engagement_sql = (
        func.coalesce(Signal.points, 0) + func.coalesce(Signal.num_comments, 0) + func.coalesce(Signal.like_count, 0)
    )
    questions = db.execute(
        select(Signal)
        .where(Signal.is_question.is_(True), Signal.published_at >= window_start)
        .order_by(engagement_sql.desc(), Signal.published_at.desc())
        .limit(TOP_QUESTIONS)
    ).scalars().all()

    per_kind = db.execute(
        select(Signal.source_kind, func.count(), func.max(Signal.fetched_at))
        .where(Signal.published_at >= window_start)
        .group_by(Signal.source_kind)
    ).all()
    counts: dict[str, int] = defaultdict(int)
    fetched: dict[str, datetime] = {}
    for kind, n, last in per_kind:
        fam = source_family(kind)
        counts[fam] += n
        if last is not None and (fam not in fetched or last > fetched[fam]):
            fetched[fam] = last
    creds = credentials_from_settings()
    sources = [
        RadarSource(
            key=fam,
            label=label,
            active=creds.family_active(fam),
            signalCount=counts.get(fam, 0),
            lastFetchedAt=format_dt(fetched.get(fam)),
        )
        for fam, label in FAMILY_LABELS.items()
    ]

    generated = db.execute(select(func.max(SignalTopic.created_at))).scalar_one_or_none()
    return RadarResponse(
        generatedAt=format_dt(generated),
        windowDays=window_days,
        sources=sources,
        topics=topic_out,
        questions=[_signal_out(s) for s in questions],
    ).model_dump(mode="json")


@router.get("", response_model=RadarResponse)
def get_radar(
    limit: int = Query(default=30, ge=1, le=60, description="Number of topics"),
    db: Session = Depends(get_db),
):
    """Top Trend Radar topics with score breakdown, 14-day counts and sample posts.

    Cached until the next pipeline run clears the ``ai_tool:*`` keys.
    """
    key = _CACHE_KEY.format(limit=limit)
    data = cache_get(key)
    if data is None:
        data = build_radar(db, limit=limit)
        cache_set(key, data)
    return JSONResponse(content=data)
