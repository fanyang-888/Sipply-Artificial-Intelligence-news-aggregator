"""Trend Radar signal sources: parsing and fetching, against mocked HTTP (no network)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from app.signals.base import is_asked_question, is_question, plain_text, strip_hn_prefix
from app.signals.config import GNewsConfig, HNConfig, YouTubeConfig, load_radar_config
from app.signals.gnews import date_chunks, fetch_gnews, range_query
from app.signals.hn import fetch_hn, parse_hn_hit
from app.signals.youtube import fetch_youtube

NOW = datetime(2026, 10, 12, 12, 0, tzinfo=timezone.utc)


def run(coro):
    return asyncio.run(coro)


def mock_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def hn_hit(object_id: str, title: str, *, tags=("story",), url="https://example.com/a", points=10, comments=4):
    return {
        "objectID": object_id,
        "title": title,
        "url": url,
        "author": "pg",
        "points": points,
        "num_comments": comments,
        "created_at_i": int((NOW - timedelta(days=1)).timestamp()),
        "story_text": None,
        "_tags": list(tags),
    }


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Ask HN: Which vector DB do you use", True),
        ("Ask HN – recommendations for eval tooling", True),
        ("How do you evaluate RAG pipelines?", True),
        ("Why isn't anyone talking about this", True),
        ("Show HN: Is this the fastest tokenizer?", True),
        ("Claude Haiku 5.5", False),
        ("Whatever happened to GPT-4", False),
        # Algolia tags all HN text posts ask_hn; these aren't questions
        ("Tell HN: HN has lost the joy for me", False),
        ("40 years of writing code. I didn't see the end coming", False),
    ],
)
def test_is_question(title, expected):
    assert is_question(title) is expected


@pytest.mark.parametrize(
    ("title", "kind", "expected"),
    [
        ("Ask HN: Which vector DB do you use", "hn_ask", True),
        ("Why isn't the industry freaking out about DeepSeek 4.1 Flash?", "hn_story", True),
        ("Is anyone else seeing Claude refuse this?", "bsky_post", True),
        # Question openers without a question mark are mostly how-tos and asides
        ("How to Make a Roblox Game With Claude AI Step by Step", "hn_story", False),
        ("can't believe OpenAI had someone on staff recording everyone", "bsky_post", False),
        # Video and news titles phrased as questions are hooks, not questions people asked
        ("Is this the Start of AGI? | Gemini 4 Argon review!", "yt_video", False),
        ("Google restricts free Gemini: what changes on October 9?", "gnews_item", False),
    ],
)
def test_is_asked_question(title, kind, expected):
    assert is_asked_question(title, kind) is expected


def test_strip_hn_prefix():
    assert strip_hn_prefix("Ask HN: How do you eval RAG?") == "How do you eval RAG?"
    assert strip_hn_prefix("Show HN – My agent") == "My agent"
    assert strip_hn_prefix("Asking HN nothing") == "Asking HN nothing"


def test_plain_text_strips_html_and_entities():
    assert plain_text("<p>Hello&#x27;s <i>world</i></p>") == "Hello's world"
    assert plain_text("") is None


def test_bundled_config_loads():
    cfg = load_radar_config()
    assert cfg.window_days == 14
    assert cfg.hn.queries and cfg.gnews.queries and cfg.youtube.queries
    # 4 runs a day must stay well inside YouTube's 10,000-unit daily quota
    assert cfg.youtube.max_units_per_run * 4 < 10_000


# ---------------------------------------------------------------------------
# Hacker News
# ---------------------------------------------------------------------------

def test_parse_hn_story_and_ask():
    story = parse_hn_hit(hn_hit("1", "Claude Haiku 5.5"), "Claude")
    assert story.source_kind == "hn_story"
    assert story.url == "https://example.com/a"
    assert story.discussion_url == "https://news.ycombinator.com/item?id=1"
    assert (story.points, story.num_comments, story.query) == (10, 4, "Claude")

    ask = parse_hn_hit(hn_hit("2", "Ask HN: Best eval tools?", tags=("story", "ask_hn"), url=None))
    assert ask.source_kind == "hn_ask"
    assert ask.url == ask.discussion_url  # self-posts link to their thread
    assert ask.is_question


def test_parse_hn_skips_incomplete_hits():
    assert parse_hn_hit({"objectID": "3", "title": ""}) is None
    assert parse_hn_hit({"title": "x", "created_at_i": 1}) is None


def test_fetch_hn_filters_paginates_and_dedups():
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        q = {k: v[0] for k, v in parse_qs(urlsplit(str(request.url)).query).items()}
        seen.append(q)
        if q["tags"] == "ask_hn":
            return httpx.Response(200, json={"hits": [hn_hit("9", "Ask HN: How?", tags=("ask_hn",))], "nbPages": 1})
        page = int(q["page"])
        hits = [hn_hit(f"{q['query']}-{page}", f"{q['query']} news {page}"), hn_hit("shared", "Both queries")]
        return httpx.Response(200, json={"hits": hits, "nbPages": 2})

    cfg = HNConfig(queries=["LLM", "Claude"], max_pages=5)
    since = NOW - timedelta(days=14)
    result = run(fetch_hn(mock_client(handler), cfg, since=since, pause_sec=0))

    assert result.status == "ok"
    # 2 queries × (2 story pages + 1 ask page)
    assert result.requests == 6
    ids = sorted(i.external_id for i in result.items)
    assert ids == ["9", "Claude-0", "Claude-1", "LLM-0", "LLM-1", "shared"]
    first = seen[0]
    assert first["typoTolerance"] == "false"
    assert first["numericFilters"] == f"created_at_i>{int(since.timestamp())},points>=3"
    assert any(q["numericFilters"].endswith("points>=1") for q in seen if q["tags"] == "ask_hn")


def test_fetch_hn_reports_failure():
    def handler(request):
        return httpx.Response(500)

    result = run(fetch_hn(mock_client(handler), HNConfig(queries=["LLM"]), since=NOW, pause_sec=0))
    assert result.status == "failed"
    assert result.items == []


def test_fetch_hn_disabled_makes_no_requests():
    def handler(request):
        raise AssertionError("no request expected")

    result = run(fetch_hn(mock_client(handler), HNConfig(enabled=False, queries=["x"]), since=NOW))
    assert result.status == "skipped"


# ---------------------------------------------------------------------------
# Google News
# ---------------------------------------------------------------------------

def rss(*items: tuple[str, str, str, str]) -> bytes:
    body = "".join(
        f"<item><title>{title}</title><link>{link}</link><guid>{link}</guid>"
        f"<pubDate>{pub}</pubDate><source url=\"https://outlet.example\">{outlet}</source></item>"
        for title, link, pub, outlet in items
    )
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>{body}</channel></rss>'.encode()


def test_fetch_gnews_parses_and_filters_by_date():
    seen: list[str] = []

    def handler(request):
        seen.append(parse_qs(urlsplit(str(request.url)).query)["q"][0])
        return httpx.Response(
            200,
            content=rss(
                ("Anthropic files for IPO - The Paper", "https://news.google.com/a", "Sat, 10 Oct 2026 10:00:00 GMT", "The Paper"),
                ("Old story - Wire", "https://news.google.com/b", "Mon, 01 Sep 2026 10:00:00 GMT", "Wire"),
            ),
        )

    since = NOW - timedelta(days=2, hours=3)  # Oct 10 09:00 → one 3-day chunk
    result = run(fetch_gnews(mock_client(handler), GNewsConfig(queries=["Anthropic"]), since=since, now=NOW, pause_sec=0))

    assert seen == ["Anthropic after:2026-10-09 before:2026-10-13"]
    assert result.status == "ok"
    assert len(result.items) == 1
    item = result.items[0]
    assert item.title == "Anthropic files for IPO"  # publisher suffix removed
    assert item.outlet == "The Paper"
    assert item.source_kind == "gnews_item"
    assert len(item.external_id) == 40  # sha1 of Google's long guid


def test_gnews_date_chunks_cover_the_window_evenly():
    chunks = date_chunks(NOW - timedelta(days=14), NOW)
    assert chunks[0][0].isoformat() == "2026-09-28"
    assert chunks[-1][1].isoformat() == "2026-10-12"
    assert all((last - first).days <= 2 for first, last in chunks)  # ≤ 3 days each
    assert all((b[0] - a[1]).days == 1 for a, b in zip(chunks, chunks[1:]))  # no gaps
    assert len(date_chunks(NOW - timedelta(days=2), NOW)) == 1  # steady-state run: one request per query
    first, last = chunks[0]
    assert range_query("AI agent", first, last) == "AI agent after:2026-09-27 before:2026-10-01"


# ---------------------------------------------------------------------------
# YouTube
# ---------------------------------------------------------------------------

def yt_handler(calls: list[httpx.Request]):
    def handler(request):
        calls.append(request)
        if request.url.path.endswith("/search"):
            return httpx.Response(200, json={"items": [{"id": {"videoId": "v1"}}, {"id": {"videoId": "v2"}}]})
        return httpx.Response(
            200,
            json={
                "items": [
                    {
                        "id": vid,
                        "snippet": {
                            "title": "Claude &amp; agents",
                            "publishedAt": "2026-10-11T08:00:00Z",
                            "channelTitle": "AI Explained",
                            "description": "desc",
                        },
                        "statistics": {"viewCount": "1200", "likeCount": "80", "commentCount": "9"},
                    }
                    for vid in ("v1", "v2")
                ]
            },
        )

    return handler


def test_youtube_skipped_without_key():
    def handler(request):
        raise AssertionError("no request expected")

    result = run(fetch_youtube(mock_client(handler), YouTubeConfig(queries=["x"]), since=NOW, api_key=None))
    assert result.status == "skipped"
    assert "YOUTUBE_API_KEY" in result.note


def test_youtube_fetches_stats_and_keeps_key_out_of_urls():
    calls: list[httpx.Request] = []
    cfg = YouTubeConfig(queries=["AI agent"], max_units_per_run=600)
    result = run(fetch_youtube(mock_client(yt_handler(calls)), cfg, since=NOW - timedelta(days=3), api_key="SECRET"))

    assert result.status == "ok"
    assert [c.url.path.rsplit("/", 1)[-1] for c in calls] == ["search", "videos"]
    assert all(c.headers["x-goog-api-key"] == "SECRET" for c in calls)
    assert all("SECRET" not in str(c.url) for c in calls)
    v = result.items[0]
    assert (v.title, v.view_count, v.like_count, v.num_comments) == ("Claude & agents", 1200, 80, 9)
    assert v.url == "https://www.youtube.com/watch?v=v1"


def test_youtube_stops_at_the_per_run_unit_cap():
    calls: list[httpx.Request] = []
    # One search (100) + one stats call (1) fits in 150; a second search would not
    cfg = YouTubeConfig(queries=["a", "b", "c"], max_units_per_run=150)
    result = run(fetch_youtube(mock_client(yt_handler(calls)), cfg, since=NOW, api_key="k"))

    assert len([c for c in calls if c.url.path.endswith("/search")]) == 1
    assert result.status == "ok"
    assert "quota cap" in result.note


def test_youtube_quota_error_stops_without_retry():
    calls: list[httpx.Request] = []

    def handler(request):
        calls.append(request)
        return httpx.Response(403, json={"error": {"errors": [{"reason": "quotaExceeded"}]}})

    cfg = YouTubeConfig(queries=["a", "b"], max_units_per_run=1000)
    result = run(fetch_youtube(mock_client(handler), cfg, since=NOW, api_key="k"))

    assert len(calls) == 1
    assert result.status == "failed"
    assert "quotaExceeded" in result.note
