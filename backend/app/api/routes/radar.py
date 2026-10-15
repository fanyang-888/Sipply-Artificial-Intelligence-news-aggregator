"""GET /api/radar — Trend Radar: scored community/search topics."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.schemas import (
    RadarAnswerCheck,
    RadarAnswersResponse,
    RadarCitation,
    RadarCoverage,
    RadarDomainShare,
    RadarRecentCheck,
    RadarResponse,
    RadarSignal,
    RadarSource,
    RadarTopic,
    format_dt,
)
from app.cache import cache_get, cache_set
from app.db import get_db
from app.models.answer_check import AnswerCheck
from app.models.cluster import Cluster
from app.models.signal import Signal, SignalTopic
from app.signals.base import (
    ASKING_FAMILIES,
    FAMILY_LABELS,
    credentials_from_settings,
    is_asked_question,
    kinds_for_family,
    source_family,
)
from app.signals.config import radar_config
from app.signals.topics import engagement_of, evidence_ring, evidence_trail, topic_momentum

router = APIRouter(prefix="/api/radar", tags=["radar"])

_CACHE_KEY = "ai_tool:radar:{limit}"
_ANSWERS_CACHE_KEY = "ai_tool:radar:answers:{days}"
# A topic shows the latest check of its question from this many days back
ANSWER_CHECK_MAX_AGE_DAYS = 7
CITATIONS_SHOWN = 6
TOP_DOMAINS = 10
RECENT_CHECKS = 20
SIGNALS_PER_TOPIC = 5
QUESTIONS_PER_TOPIC = 3
TOP_QUESTIONS = 12
# Question-flagged signals read per page build; the stricter is_asked_question check runs on these
QUESTION_CANDIDATES = 200


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


def _citations(check: AnswerCheck, limit: int) -> list[RadarCitation]:
    return [
        RadarCitation(url=c.get("url", ""), title=c.get("title", ""), domain=c.get("domain", ""))
        for c in (check.citations or [])[:limit]
        if isinstance(c, dict) and c.get("url")
    ]


def _answer_check_out(check: AnswerCheck | None) -> RadarAnswerCheck | None:
    if check is None:
        return None
    return RadarAnswerCheck(
        checkedAt=format_dt(check.checked_at),
        model=check.model,
        sipplyCited=check.sipply_cited,
        sipplyInSources=check.sipply_in_sources,
        citations=_citations(check, CITATIONS_SHOWN),
        sourceCount=len(check.sources or []),
    )


def _coverage(topic: SignalTopic, ring: int, stories: dict[Any, Cluster]) -> RadarCoverage | None:
    if ring > 2 or topic.described_at is None:
        return None
    if topic.covered_cluster_id is None:
        return RadarCoverage(status="gap")
    story = stories.get(topic.covered_cluster_id)
    if story is None:  # deleted since the check; the next run checks again
        return None
    return RadarCoverage(
        status="covered",
        clusterId=str(story.id),
        title=story.representative_title,
        titleZh=story.representative_title_zh,
    )


def build_radar(db: Session, *, limit: int, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    window_days = radar_config().window_days
    window_start = now - timedelta(days=window_days)
    generated = db.execute(select(func.max(SignalTopic.created_at))).scalar_one_or_none()
    # Momentum and "new" are judged at build time, so a page served hours later says the same
    built_at = generated or now

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
    covered_ids = [t.covered_cluster_id for t in topics if t.covered_cluster_id]
    stories = (
        {c.id: c for c in db.execute(select(Cluster).where(Cluster.id.in_(covered_ids))).scalars()}
        if covered_ids
        else {}
    )

    questions = [t.question_en for t in topics if t.question_en]
    latest_check: dict[str, AnswerCheck] = {}
    if questions:
        for check in db.execute(
            select(AnswerCheck)
            .where(
                AnswerCheck.question.in_(questions),
                AnswerCheck.checked_at >= now - timedelta(days=ANSWER_CHECK_MAX_AGE_DAYS),
            )
            .order_by(AnswerCheck.checked_at.desc())
        ).scalars():
            latest_check.setdefault(check.question, check)

    topic_out = []
    for t in topics:
        ranked = _by_engagement(members.get(t.id, []))
        ring = evidence_ring(t.signal_count, len(t.source_counts or {}))
        trail_signals, trail_rings = evidence_trail(
            [(s.published_at, source_family(s.source_kind)) for s in ranked], now=built_at, days=window_days
        )
        momentum = topic_momentum(
            counts=t.daily_counts or [], velocity=t.velocity, last_seen=t.last_seen_at, now=built_at
        )
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
                trailSignals=trail_signals,
                trailRings=trail_rings,
                ring=ring,
                momentum=momentum,
                isNew=momentum == "new",
                summaryEn=t.summary_en,
                summaryZh=t.summary_zh,
                coverage=_coverage(t, ring, stories),
                question=t.question_en,
                answerCheck=_answer_check_out(latest_check.get(t.question_en)) if t.question_en else None,
                signals=[_signal_out(s) for s in ranked[:SIGNALS_PER_TOPIC]],
                questions=[
                    _signal_out(s) for s in ranked if s.is_question and is_asked_question(s.title, s.source_kind)
                ][:QUESTIONS_PER_TOPIC],
            )
        )

    engagement_sql = (
        func.coalesce(Signal.points, 0) + func.coalesce(Signal.num_comments, 0) + func.coalesce(Signal.like_count, 0)
    )
    asking_kinds = [k for fam in sorted(ASKING_FAMILIES) for k in kinds_for_family(fam)]
    candidates = db.execute(
        select(Signal)
        .where(
            Signal.is_question.is_(True),
            Signal.source_kind.in_(asking_kinds),
            Signal.published_at >= window_start,
        )
        .order_by(engagement_sql.desc(), Signal.published_at.desc())
        .limit(QUESTION_CANDIDATES)
    ).scalars().all()
    questions = [s for s in candidates if is_asked_question(s.title, s.source_kind)][:TOP_QUESTIONS]

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


def build_answers(db: Session, *, days: int, now: datetime | None = None) -> dict[str, Any]:
    """What AI assistants cited for the radar questions over the last ``days`` days."""
    now = now or datetime.now(timezone.utc)
    checks = list(
        db.execute(
            select(AnswerCheck)
            .where(AnswerCheck.checked_at >= now - timedelta(days=days))
            .order_by(AnswerCheck.checked_at.desc())
        ).scalars().all()
    )
    citations_per_domain: dict[str, int] = defaultdict(int)
    checks_per_domain: dict[str, int] = defaultdict(int)
    for check in checks:
        domains = [c.get("domain") for c in (check.citations or []) if isinstance(c, dict) and c.get("domain")]
        for d in domains:
            citations_per_domain[d] += 1
        for d in set(domains):
            checks_per_domain[d] += 1
    top = sorted(checks_per_domain, key=lambda d: (-checks_per_domain[d], -citations_per_domain[d], d))[:TOP_DOMAINS]
    covered = [c for c in checks if c.covered_cluster_id]
    return RadarAnswersResponse(
        days=days,
        model=checks[0].model if checks else None,
        checks=len(checks),
        questions=len({c.question for c in checks}),
        sipplyCited=sum(c.sipply_cited for c in checks),
        sipplyInSources=sum(c.sipply_in_sources for c in checks),
        sipplyCovered=len(covered),
        sipplyCitedWhenCovered=sum(c.sipply_cited for c in covered),
        topDomains=[
            RadarDomainShare(domain=d, citations=citations_per_domain[d], share=round(checks_per_domain[d] / len(checks), 3))
            for d in top
        ],
        recent=[
            RadarRecentCheck(
                checkedAt=format_dt(c.checked_at),
                question=c.question,
                topicLabel=c.topic_label,
                sipplyCited=c.sipply_cited,
                sipplyHasStory=c.covered_cluster_id is not None,
                citations=_citations(c, 3),
            )
            for c in checks[:RECENT_CHECKS]
        ],
    ).model_dump(mode="json")


@router.get("/answers", response_model=RadarAnswersResponse)
def get_radar_answers(
    days: int = Query(default=30, ge=1, le=90, description="Look-back window in days"),
    db: Session = Depends(get_db),
):
    """Which sites an AI assistant with web search cited for the radar questions, and how often Sipply was one.

    Cached until the next pipeline run clears the ``ai_tool:*`` keys.
    """
    key = _ANSWERS_CACHE_KEY.format(days=days)
    data = cache_get(key)
    if data is None:
        data = build_answers(db, days=days)
        cache_set(key, data)
    return JSONResponse(content=data)
