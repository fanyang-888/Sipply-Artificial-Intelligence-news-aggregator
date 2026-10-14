"""Ask an AI assistant with web search the questions behind Trend Radar topics,
and record what it cites: the last step of the GEO loop (signal → topic →
question → content → citation).

Once a day (the ANSWER_CHECK_HOUR_UTC cron run, see scripts/run_pipeline.py),
the MAX_CHECKS highest-scoring inner/middle-ring topics that have a question
(written by describe_signal_topics) are asked through the OpenAI Responses API
with the web_search tool. Each check stores the answer, the inline citations
(url_citation annotations), every source the search consulted, and whether a
sipply.dev page was among them.

Price (developers.openai.com/api/docs/pricing, 2026-10): $10 per 1,000 search
calls, plus search content billed as a fixed 8,000-input-token block per call
for gpt-4.1-mini ($0.40 / 1M input, $1.60 / 1M output) — about $0.014 a
question, ~$0.14 a day at MAX_CHECKS.

This is the API's search, not the ChatGPT app: a proxy for what assistants
cite, comparable over time because the model and settings stay fixed.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.answer_check import AnswerCheck
from app.models.signal import SignalTopic
from app.signals.topics import evidence_ring

logger = logging.getLogger(__name__)

MODEL = "gpt-4.1-mini"
MAX_CHECKS = 10
RETENTION_DAYS = 90
ANSWER_MAX_CHARS = 4000
SIPPLY_DOMAIN = "sipply.dev"
# USD
_PRICE_SEARCH_CALL = 0.010
_SEARCH_CONTENT_TOKENS = 8_000
_PRICE_INPUT = 0.40 / 1_000_000
_PRICE_OUTPUT = 1.60 / 1_000_000


def _get(obj: Any, name: str, default: Any = None) -> Any:
    """Field from an SDK object or a plain dict."""
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def domain_of(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def is_sipply(url: str) -> bool:
    domain = domain_of(url)
    return domain == SIPPLY_DOMAIN or domain.endswith("." + SIPPLY_DOMAIN)


def parse_response(response: Any) -> dict[str, Any]:
    """Answer text, inline citations (in order, deduped), consulted sources, search calls, token usage."""
    texts: list[str] = []
    citations: list[dict[str, str]] = []
    sources: list[str] = []
    searches = 0
    for item in _get(response, "output", None) or []:
        kind = _get(item, "type")
        if kind == "web_search_call":
            action = _get(item, "action")
            if _get(action, "type") == "search":
                searches += 1
            for source in _get(action, "sources", None) or []:
                url = _get(source, "url")
                if isinstance(url, str) and url not in sources:
                    sources.append(url)
        elif kind == "message":
            for content in _get(item, "content", None) or []:
                if _get(content, "type") != "output_text":
                    continue
                texts.append(_get(content, "text", "") or "")
                for ann in _get(content, "annotations", None) or []:
                    url = _get(ann, "url")
                    if _get(ann, "type") == "url_citation" and isinstance(url, str):
                        if all(c["url"] != url for c in citations):
                            citations.append({"url": url, "title": _get(ann, "title", "") or "", "domain": domain_of(url)})
    usage = _get(response, "usage")
    return {
        "answer": "\n".join(t for t in texts if t).strip(),
        "citations": citations,
        "sources": sources,
        "searches": searches,
        "input_tokens": _get(usage, "input_tokens", 0) or 0,
        "output_tokens": _get(usage, "output_tokens", 0) or 0,
    }


def estimate_cost(parsed: dict[str, Any]) -> float:
    calls = max(1, parsed["searches"])
    return round(
        calls * (_PRICE_SEARCH_CALL + _SEARCH_CONTENT_TOKENS * _PRICE_INPUT)
        + parsed["input_tokens"] * _PRICE_INPUT
        + parsed["output_tokens"] * _PRICE_OUTPUT,
        5,
    )


def ask(client: Any, question: str) -> dict[str, Any]:
    response = client.responses.create(
        model=MODEL,
        tools=[{"type": "web_search", "search_context_size": "medium"}],
        tool_choice="required",
        include=["web_search_call.action.sources"],
        input=question,
    )
    return parse_response(response)


def topics_to_check(db: Session, *, limit: int = MAX_CHECKS) -> list[SignalTopic]:
    """Inner- and middle-ring topics with a question, best first."""
    topics = db.execute(
        select(SignalTopic)
        .where(SignalTopic.question_en.is_not(None))
        .order_by(SignalTopic.score.desc(), SignalTopic.engagement.desc())
    ).scalars().all()
    return [t for t in topics if evidence_ring(t.signal_count, len(t.source_counts or {})) <= 2][:limit]


def run_checks(db: Session, client: Any, *, now: datetime, limit: int = MAX_CHECKS) -> dict[str, Any]:
    topics = topics_to_check(db, limit=limit)
    checked = cited = failed = 0
    cost = 0.0
    for i, topic in enumerate(topics):
        try:
            parsed = ask(client, topic.question_en)
        except Exception as exc:
            # Bad key, quota, outage: the next question would fail the same way
            logger.warning(
                "check_ai_answers stopped (%s: %s); %d questions left",
                type(exc).__name__, str(exc)[:200], len(topics) - i,
            )
            failed = len(topics) - i
            break
        check_cost = estimate_cost(parsed)
        cost += check_cost
        sipply_cited = any(is_sipply(c["url"]) for c in parsed["citations"])
        db.add(
            AnswerCheck(
                checked_at=now,
                question=topic.question_en,
                topic_label=topic.label,
                covered_cluster_id=topic.covered_cluster_id,
                model=MODEL,
                answer=parsed["answer"][:ANSWER_MAX_CHARS] or None,
                citations=parsed["citations"],
                sources=parsed["sources"],
                sipply_cited=sipply_cited,
                sipply_in_sources=sipply_cited or any(is_sipply(u) for u in parsed["sources"]),
                cost_usd=check_cost,
            )
        )
        db.commit()
        checked += 1
        cited += sipply_cited
    pruned = db.execute(
        delete(AnswerCheck).where(AnswerCheck.checked_at < now - timedelta(days=RETENTION_DAYS))
    ).rowcount or 0
    db.commit()
    summary = {
        "questions": len(topics),
        "checked": checked,
        "sipply_cited": cited,
        "failed": failed,
        "pruned": pruned,
        "cost_usd": round(cost, 4),
    }
    logger.info("check_ai_answers %s", summary)
    return summary
