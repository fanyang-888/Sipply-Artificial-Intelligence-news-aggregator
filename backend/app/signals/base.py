"""Shared shapes for Trend Radar signal sources."""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

# source_kind → source family shown on the radar (and used in source_counts)
SOURCE_FAMILIES: dict[str, str] = {
    "hn_story": "hn",
    "hn_ask": "hn",
    "gnews_item": "news",
    "yt_video": "youtube",
    "gh_repo": "github",
    "devto_post": "devto",
    "lobsters_story": "lobsters",
    "bsky_post": "bluesky",
    "threads_post": "threads",
}
FAMILY_LABELS: dict[str, str] = {
    "hn": "Hacker News",
    "news": "Google News",
    "youtube": "YouTube",
    "github": "GitHub",
    "devto": "DEV",
    "lobsters": "Lobsters",
    "bluesky": "Bluesky",
    "threads": "Threads",
}


@dataclass(frozen=True)
class SignalCredentials:
    """Keys for the sources that need one; each source is skipped while its key is missing."""

    youtube_api_key: str | None = None
    bluesky_handle: str | None = None
    bluesky_app_password: str | None = None
    threads_access_token: str | None = None

    def family_active(self, family: str) -> bool:
        if family == "youtube":
            return bool(self.youtube_api_key)
        if family == "bluesky":
            return bool(self.bluesky_handle and self.bluesky_app_password)
        if family == "threads":
            return bool(self.threads_access_token)
        return True

    def active_families(self) -> list[str]:
        return [f for f in FAMILY_LABELS if self.family_active(f)]


def credentials_from_settings() -> SignalCredentials:
    from app.config import settings

    def secret(v):
        return v.get_secret_value() if v is not None else None

    return SignalCredentials(
        youtube_api_key=secret(settings.youtube_api_key),
        bluesky_handle=settings.bluesky_handle,
        bluesky_app_password=secret(settings.bluesky_app_password),
        threads_access_token=secret(settings.threads_access_token),
    )


def source_family(source_kind: str) -> str:
    return SOURCE_FAMILIES.get(source_kind, source_kind)


def kinds_for_family(family: str) -> list[str]:
    return [k for k, f in SOURCE_FAMILIES.items() if f == family]


@dataclass
class SignalItem:
    """One normalized signal, ready to upsert into ``signals``."""

    source_kind: str
    external_id: str
    url: str
    title: str
    published_at: datetime
    query: str | None = None
    discussion_url: str | None = None
    text: str | None = None
    author: str | None = None
    outlet: str | None = None
    points: int | None = None
    num_comments: int | None = None
    view_count: int | None = None
    like_count: int | None = None
    raw: dict[str, Any] | None = None

    @property
    def is_question(self) -> bool:
        return is_question(self.title)


@dataclass
class SourceResult:
    """What one source produced in one run."""

    family: str
    status: str  # "ok" | "skipped" | "failed" | "partial"
    items: list[SignalItem] = field(default_factory=list)
    requests: int = 0
    note: str | None = None


_HN_PREFIX = re.compile(r"^\s*(ask|show|tell|launch)\s+hn\s*[:\-–]\s*", re.IGNORECASE)
_ASK_HN = re.compile(r"^\s*ask\s+hn\b", re.IGNORECASE)
_QUESTION_START = re.compile(
    r"^(how|what|why|when|where|which|who|whom|is|are|am|can|could|should|would|"
    r"does|do|did|will|has|have|anyone|any)\b",
    re.IGNORECASE,
)
_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")


def strip_hn_prefix(title: str) -> str:
    """'Ask HN: How do you eval RAG?' → 'How do you eval RAG?'"""
    return _HN_PREFIX.sub("", title).strip()


def is_question(title: str) -> bool:
    """Question-shaped signals are what people are asking — future target prompts.

    Algolia tags every HN text post ``ask_hn`` ("Tell HN", plain essays), so
    the tag alone isn't enough: the title must say "Ask HN" or read as a question.
    """
    if _ASK_HN.match(title):
        return True
    t = strip_hn_prefix(title)
    return t.endswith("?") or bool(_QUESTION_START.match(t))


def plain_text(value: str | None, limit: int = 2000) -> str | None:
    """HTML fragment → collapsed plain text (HN story_text, video descriptions)."""
    if not value:
        return None
    text = _SPACE.sub(" ", html.unescape(_TAG.sub(" ", value))).strip()
    return text[:limit] or None


def parse_iso(value: Any) -> datetime | None:
    """ISO-8601 string ('Z' or offset) → aware datetime; None when missing or malformed."""
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def to_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None
