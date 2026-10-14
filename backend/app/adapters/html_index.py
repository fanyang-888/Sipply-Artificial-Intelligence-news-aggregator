"""HTML index link extraction (BeautifulSoup — avoid regex on markup)."""

from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

_SLUG_RE = re.compile(r"^[a-z0-9-]+$", re.I)


# Link texts that are buttons, not titles ("Learn more" on DeepMind cards)
_GENERIC_LINK_TEXT = frozenset({"learn more", "read more", "read the blog", "see more", "explore"})
_CARD_DATE_FORMATS = ("%b %d, %Y", "%B %d, %Y")


def _parse_card_date(text: str) -> time.struct_time | None:
    """'Oct 8, 2026' / 'October 8, 2026' → UTC struct_time (feedparser-style published_parsed)."""
    cleaned = " ".join(text.split())
    for fmt in _CARD_DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt).replace(tzinfo=timezone.utc).timetuple()
        except ValueError:
            continue
    return None


def _anthropic_card(a: Any) -> dict[str, Any]:
    """Title / date / summary from one newsroom card link.

    Cards put date, category and title in separate elements; the link's flat
    text glues them together ("Oct 8, 2026Announcements2026 Usage Policy update").
    """
    time_el = a.find("time")
    published = _parse_card_date(time_el.get_text(" ", strip=True)) if time_el else None
    heading = a.find(["h1", "h2", "h3", "h4"])
    title_el = heading or a.find(
        lambda tag: tag.name in ("span", "div", "p")
        and any("title" in c.lower() for c in (tag.get("class") or []))
    )
    title = title_el.get_text(" ", strip=True) if title_el else ""
    summary_el = a.find("p")
    summary = summary_el.get_text(" ", strip=True) if summary_el and summary_el is not title_el else ""
    return {"title": title, "published_parsed": published, "summary": summary}


def extract_anthropic_news_candidates(html: str, base_url: str = "https://www.anthropic.com") -> list[dict[str, Any]]:
    """Collect article links from Anthropic newsroom HTML (SSR) with title, date and summary."""
    soup = BeautifulSoup(html, "html.parser")
    base = base_url.rstrip("/")
    cards: dict[str, dict[str, Any]] = {}
    for a in soup.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        if not href or href.startswith("#"):
            continue
        full = urljoin(base + "/", href)
        parsed = urlparse(full)
        host = (parsed.netloc or "").lower().split(":", 1)[0]
        if host not in ("www.anthropic.com", "anthropic.com"):
            continue
        path = (parsed.path or "").rstrip("/")
        segments = [p for p in path.split("/") if p]
        if len(segments) >= 2 and segments[0] == "news":
            slug = segments[1]
            canon_path = f"news/{slug}"
        elif len(segments) == 1 and a.find("time"):
            # Model launches sit at the top level (/claude-haiku-5-5) in the featured
            # grid. Only dated cards count, so nav links (/claude-corps, /careers) stay out.
            slug = segments[0]
            canon_path = slug
        else:
            continue
        if not slug or not _SLUG_RE.match(slug):
            continue
        canon = f"https://www.anthropic.com/{canon_path}"
        card = _anthropic_card(a)
        prev = cards.get(canon)
        # The same article can appear as a featured card and a list row: merge the best fields
        if prev is None:
            cards[canon] = card
        else:
            prev["title"] = prev["title"] or card["title"]
            prev["published_parsed"] = prev["published_parsed"] or card["published_parsed"]
            prev["summary"] = prev["summary"] or card["summary"]

    entries: list[dict[str, Any]] = []
    for url in sorted(cards):
        card = cards[url]
        title = card["title"].strip()
        if not title or title.lower() in _GENERIC_LINK_TEXT:
            slug = url.rsplit("/", maxsplit=1)[-1]
            title = slug.replace("-", " ").strip().title() or url
        entries.append(
            {
                "title": title,
                "link": url,
                "published": None,
                "published_parsed": card["published_parsed"],
                "author": None,
                "summary": card["summary"],
                "tags": [],
                "feed_title": None,
                "_parser": "html_index_bs4",
            }
        )
    return entries


def _build_html_index_entries(urls: dict[str, str]) -> list[dict[str, Any]]:
    """Shared helper: turn a {canon_url: title} dict into normalized entry dicts."""
    entries: list[dict[str, Any]] = []
    for url in sorted(urls):
        title = urls[url].strip()
        if not title:
            slug = url.rstrip("/").rsplit("/", maxsplit=1)[-1]
            title = slug.replace("-", " ").strip().title() or url
        entries.append(
            {
                "title": title,
                "link": url,
                "published": None,
                "published_parsed": None,
                "author": None,
                "summary": "",
                "tags": [],
                "feed_title": None,
                "_parser": "html_index_bs4",
            }
        )
    return entries


def extract_deepmind_candidates(html: str, base_url: str = "https://deepmind.google") -> list[dict[str, Any]]:
    """Collect article links from Google DeepMind blog index HTML.

    Keeps links matching ``/blog/{slug}/``.
    """
    soup = BeautifulSoup(html, "html.parser")
    base = base_url.rstrip("/")
    urls: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        if not href or href.startswith("#"):
            continue
        full = urljoin(base + "/", href)
        parsed = urlparse(full)
        host = (parsed.netloc or "").lower().split(":", 1)[0]
        if host not in ("deepmind.google",):
            continue
        path = (parsed.path or "").rstrip("/")
        segments = [p for p in path.split("/") if p]
        # Expect: /blog/{slug}
        if len(segments) < 2 or segments[0] != "blog":
            continue
        slug = segments[1]
        if not slug or not _SLUG_RE.match(slug):
            continue
        canon = f"https://deepmind.google/blog/{slug}/"
        text = a.get_text(strip=True)
        if text.lower() in _GENERIC_LINK_TEXT:
            text = ""
        if canon not in urls or (text and len(text) > len(urls[canon])):
            urls[canon] = text or ""
    return _build_html_index_entries(urls)


def extract_meta_ai_candidates(html: str, base_url: str = "https://ai.meta.com") -> list[dict[str, Any]]:
    """Collect article links from Meta AI blog index HTML.

    Keeps links matching ``/blog/{slug}/``.
    """
    soup = BeautifulSoup(html, "html.parser")
    base = base_url.rstrip("/")
    urls: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        if not href or href.startswith("#"):
            continue
        full = urljoin(base + "/", href)
        parsed = urlparse(full)
        host = (parsed.netloc or "").lower().split(":", 1)[0]
        if host not in ("ai.meta.com",):
            continue
        path = (parsed.path or "").rstrip("/")
        segments = [p for p in path.split("/") if p]
        # Expect: /blog/{slug}
        if len(segments) < 2 or segments[0] != "blog":
            continue
        slug = segments[1]
        if not slug or not _SLUG_RE.match(slug):
            continue
        canon = f"https://ai.meta.com/blog/{slug}/"
        text = a.get_text(strip=True)
        if text.lower() in _GENERIC_LINK_TEXT:
            text = ""
        if canon not in urls or (text and len(text) > len(urls[canon])):
            urls[canon] = text or ""
    return _build_html_index_entries(urls)
