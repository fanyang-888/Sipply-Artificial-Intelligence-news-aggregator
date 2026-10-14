"""News source fixes: Anthropic/DeepMind index parsing, feed-body sources, date repair."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.adapters.html_index import extract_anthropic_news_candidates, extract_deepmind_candidates
from app.services.article_ingest import (
    PersistArticleOutcome,
    persist_fetched_article,
    repair_missing_published_at,
)

ANTHROPIC_HTML = """
<a href="/news/cyber-verification-program">
  <h2>Expanding the Cyber Verification Program</h2>
  <div><div><span>Announcements</span><time>Oct 6, 2026</time></div>
  <p>We're launching a new, expanded version of our Cyber Verification Program.</p></div>
</a>
<a href="/news/2026-usage-policy-update">
  <div><time>Oct 8, 2026</time><span class="subject">Announcements</span></div>
  <span class="PublicationList__title">2026 Usage Policy update</span>
</a>
<a href="/news/cyber-verification-program">
  <div><time>Oct 6, 2026</time><span class="subject">Announcements</span></div>
  <span class="PublicationList__title">Expanding the Cyber Verification Program</span>
</a>
<a href="/careers">Careers</a>
"""


def test_anthropic_cards_split_date_category_and_title():
    entries = {e["link"]: e for e in extract_anthropic_news_candidates(ANTHROPIC_HTML)}
    assert set(entries) == {
        "https://www.anthropic.com/news/2026-usage-policy-update",
        "https://www.anthropic.com/news/cyber-verification-program",
    }
    policy = entries["https://www.anthropic.com/news/2026-usage-policy-update"]
    # Before: "Oct 8, 2026Announcements2026 Usage Policy update" with no date
    assert policy["title"] == "2026 Usage Policy update"
    assert time.strftime("%Y-%m-%d", policy["published_parsed"]) == "2026-10-08"
    cyber = entries["https://www.anthropic.com/news/cyber-verification-program"]
    assert cyber["title"] == "Expanding the Cyber Verification Program"
    assert cyber["summary"].startswith("We're launching")  # from the featured card


def test_anthropic_model_launches_outside_news_path():
    # Real featured-grid markup from anthropic.com/news (2026-10-14): model launches
    # link to /claude-haiku-5-5, not /news/…; nav links have no date
    html = """
    <a class="FeaturedGrid__sideLink" href="/claude-haiku-5-5">
      <div class="FeaturedGrid__meta"><span class="caption bold">Announcements</span>
      <time class="FeaturedGrid__date caption bold">Oct 7, 2026</time></div>
      <h4 class="headline-6 FeaturedGrid__title">Introducing Claude Haiku 5.5</h4>
      <p class="body-3 serif FeaturedGrid__body">Our fastest, cheapest, and most capable small model yet.</p>
    </a>
    <a href="/claude-corps">Claude Corps</a>
    <a href="/claude-haiku-5-5/">Haiku 5.5</a>
    <a href="https://www.anthropic.com/features/ebola-response"><time>Oct 3, 2026</time><h4>The Situation Report</h4></a>
    """
    entries = {e["link"]: e for e in extract_anthropic_news_candidates(html)}
    assert set(entries) == {"https://www.anthropic.com/claude-haiku-5-5"}
    haiku = entries["https://www.anthropic.com/claude-haiku-5-5"]
    assert haiku["title"] == "Introducing Claude Haiku 5.5"
    assert time.strftime("%Y-%m-%d", haiku["published_parsed"]) == "2026-10-07"
    assert haiku["summary"].startswith("Our fastest")


def test_deepmind_html_fallback_ignores_learn_more_link_text():
    html = """
    <a href="/blog/gemini-robotics-2/">Learn more</a>
    <a href="/blog/alphaearth/">AlphaEarth maps our planet</a>
    """
    titles = {e["link"]: e["title"] for e in extract_deepmind_candidates(html)}
    assert titles["https://deepmind.google/blog/gemini-robotics-2/"] == "Gemini Robotics 2"  # from the slug
    assert titles["https://deepmind.google/blog/alphaearth/"] == "AlphaEarth maps our planet"


def _deepmind_adapter(feed_url="https://deepmind.google/blog/rss.xml"):
    from app.adapters.deepmind import DeepMindBlogAdapter
    from app.source_catalog.loader import load_trusted_sources

    cfg = next(c for c in load_trusted_sources() if c.slug == "deepmind-blog")
    return DeepMindBlogAdapter(cfg.model_copy(update={"feed_url": feed_url}))


def test_deepmind_reads_the_rss_feed_first(monkeypatch):
    calls = {"html": 0}

    async def fake_feed(url, client, etag=None):
        entries = [{
            "title": "Gemini 4 Argon: our next era of frontier intelligence",
            "link": "https://deepmind.google/blog/gemini-4-argon/",
            "published_parsed": time.strptime("2026-09-30", "%Y-%m-%d"),
            "summary": "", "tags": [], "feed_title": "Google DeepMind",
        }]
        return entries, "etag-1"

    async def fake_get(client, url, **kw):
        calls["html"] += 1
        raise AssertionError("HTML index must not be fetched when the feed works")

    monkeypatch.setattr("app.adapters.deepmind.fetch_feed_entries", fake_feed)
    monkeypatch.setattr("app.adapters.deepmind.get_with_retry", fake_get)
    candidates = asyncio.run(_deepmind_adapter().fetch_index())
    assert [c["title"] for c in candidates] == ["Gemini 4 Argon: our next era of frontier intelligence"]
    assert candidates[0]["published_at"].startswith("2026-09-30")


def test_deepmind_not_modified_feed_does_not_fall_back(monkeypatch):
    async def not_modified(url, client, etag=None):
        return [], None  # 304

    async def fake_get(client, url, **kw):
        raise AssertionError("304 means nothing new, not a broken feed")

    monkeypatch.setattr("app.adapters.deepmind.fetch_feed_entries", not_modified)
    monkeypatch.setattr("app.adapters.deepmind.get_with_retry", fake_get)
    assert asyncio.run(_deepmind_adapter().fetch_index()) == []


def test_deepmind_falls_back_to_html_when_the_feed_fails(monkeypatch):
    async def broken(url, client, etag=None):
        raise ValueError("invalid feed")

    async def fake_get(client, url, **kw):
        return SimpleNamespace(text='<a href="/blog/alphaearth/">AlphaEarth maps our planet</a>')

    monkeypatch.setattr("app.adapters.deepmind.fetch_feed_entries", broken)
    monkeypatch.setattr("app.adapters.deepmind.get_with_retry", fake_get)
    candidates = asyncio.run(_deepmind_adapter().fetch_index())
    assert [c["title"] for c in candidates] == ["AlphaEarth maps our planet"]


def test_bundled_catalog_source_fixes():
    from app.source_catalog.loader import _DEFAULT_FILE, load_trusted_sources
    import yaml

    active = {c.slug: c for c in load_trusted_sources()}
    assert active["openai-news"].body_from_feed is True
    assert str(active["deepmind-blog"].feed_url) == "https://deepmind.google/blog/rss.xml"
    assert str(active["theverge-ai"].feed_url) == "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"
    rows = {r["slug"]: r for r in yaml.safe_load(_DEFAULT_FILE.read_text())["sources"]}
    for slug in ("ai-news", "venturebeat-ai", "tldr-ai", "meta-ai-blog"):
        assert rows[slug]["is_active"] is False, slug


# ---------------------------------------------------------------------------
# Feed-body sources (OpenAI) and date repair
# ---------------------------------------------------------------------------

def _openai_adapter():
    from app.adapters import get_adapter
    from app.source_catalog.loader import load_trusted_sources

    return get_adapter(next(c for c in load_trusted_sources() if c.slug == "openai-news"))


SUMMARY = "Using GPT-6 Astra in Codex, Asana made its browser agent 76x cheaper and 5x faster in tests."


def test_feed_body_result_uses_the_feed_summary_without_http():
    item = {"url": "https://openai.com/index/asana-browser-agent", "title": "Asana cuts model costs",
            "raw_meta": {"summary": SUMMARY}}
    fr = _openai_adapter().feed_body_result(item)
    assert fr["status"] == "ok"
    assert fr["raw_text"] == SUMMARY
    assert fr["raw_meta"]["full_fetch"]["extraction_method"] == "feed_summary"
    assert _openai_adapter().feed_body_result({"url": "x", "raw_meta": {}})["status"] == "failed"


def _normalized(source_id, *, body, method):
    from app.schemas.normalized_article import NormalizedFetchedArticle

    return NormalizedFetchedArticle(
        source_id=source_id,
        title="Asana cuts model costs 76x with GPT-6.1 Sol",
        url=f"https://openai.com/index/test-{uuid4().hex[:8]}",
        canonical_url=None,
        author_name=None,
        organization_name="OpenAI News",
        published_at=datetime(2026, 10, 9, 7, tzinfo=timezone.utc),
        fetched_at=datetime(2026, 10, 9, 8, tzinfo=timezone.utc),
        raw_text=body,
        cleaned_text=body,
        excerpt=body,
        language="en",
        raw_meta={"full_fetch": {"extraction_method": method}},
    )


def test_persist_accepts_a_short_feed_summary_but_not_a_short_page(db, make_source):
    src = make_source()
    assert persist_fetched_article(db, _normalized(src.id, body=SUMMARY, method="feed_summary")) == PersistArticleOutcome.inserted
    assert persist_fetched_article(db, _normalized(src.id, body=SUMMARY, method="dom_fallback")) == PersistArticleOutcome.rejected


def test_repair_missing_published_at_fills_only_missing_dates():
    undated = SimpleNamespace(published_at=None)
    assert repair_missing_published_at(undated, {"published_at": "2026-10-08T00:00:00+00:00"}) is True
    assert undated.published_at == datetime(2026, 10, 8, tzinfo=timezone.utc)

    dated = SimpleNamespace(published_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert repair_missing_published_at(dated, {"published_at": "2026-10-08T00:00:00+00:00"}) is False
    assert dated.published_at.year == 2026 and dated.published_at.month == 1
    assert repair_missing_published_at(SimpleNamespace(published_at=None), {"published_at": None}) is False
