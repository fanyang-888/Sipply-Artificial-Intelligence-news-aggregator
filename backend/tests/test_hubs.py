"""Topic pages (companies / model families) and weekly recaps."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from app.api.routes import hubs as H
from app.services.entities import entities_in


@pytest.mark.parametrize(
    ("title", "slugs"),
    [
        ("Meta launches Muse Wonder to rival OpenAI and Anthropic", ["openai", "anthropic", "meta"]),
        ("Prompt-Space Meta-Learning Does Not Transfer Across Users", []),  # not Meta
        ("Introducing Claude Opus 5.5 on AWS Bedrock", ["anthropic", "amazon"]),
        ("OpenAI launches GPT-6.1 Sol", ["openai"]),
        ("Robots pick apples in an apple orchard", []),  # not Apple
        ("Apple discloses deal to hire team from Huxe", ["apple"]),
        ("Google releases Gemini 4 Argon", ["google"]),
        ("New open models on HuggingFace and Hugging Face Hub", ["hugging-face"]),
        ("xAI ships Grok 5", ["xai"]),
        ("Max-Pooling and FLAXAI variants", []),  # no word boundary, no xAI
    ],
)
def test_entities_in_titles(title, slugs):
    assert [e.slug for e in entities_in(title)] == slugs


def test_week_headlines_prefer_stories_from_news_sources():
    from types import SimpleNamespace as S

    def story(title, score, source):
        return S(title=title, cluster_score=score, articles=[S(source_id=source)])

    stories = [
        story("Import AI 476", 66, "newsletter"),
        story("A paper", 65, "arxiv"),
        story("Gemini 4 Argon", 60, "deepmind-blog"),
        story("OpenAI engineer arrested", 55, "techcrunch"),
        story("Another paper", 59, "arxiv"),
    ]
    news = {"deepmind-blog", "techcrunch"}
    assert [c.title for c in H.week_headlines(stories, news)] == ["Gemini 4 Argon", "OpenAI engineer arrested", "Import AI 476"]
    # No news stories at all: plain score order
    assert [c.title for c in H.week_headlines(stories, set())] == ["Import AI 476", "A paper", "Gemini 4 Argon"]


def test_iso_weeks():
    assert H.week_key(date(2026, 10, 14)) == "2026-W42"
    assert H.week_bounds("2026-W42") == (date(2026, 10, 12), date(2026, 10, 18))
    assert H.week_key(date(2026, 12, 31)) == "2026-W53"  # ISO year edge
    assert H.week_key(date(2027, 1, 1)) == "2026-W53"
    for bad in ("2026-W60", "2026-42", "W42", "2026-W4"):
        assert H.week_bounds(bad) is None


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

NOW = datetime.now(timezone.utc)


@pytest.fixture
def client(db, monkeypatch):
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    monkeypatch.setattr(H, "cache_get", lambda key: None)
    monkeypatch.setattr(H, "cache_set", lambda key, value, **kw: None)
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def stories(db, make_cluster):
    from sqlalchemy import delete

    from app.models.cluster import Cluster
    from app.models.signal import Signal, SignalTopic

    db.execute(delete(Signal))
    db.execute(delete(SignalTopic))
    db.query(Cluster).delete()

    def story(title, days_ago, score=50.0, tag="Product Launch", translated=True):
        seen = NOW - timedelta(days=days_ago)
        kw = {"title_zh": f"{title}（中文）"} if translated else {"title_zh": None}
        return make_cluster(title=title, score=score, last_seen_at=seen, first_seen_at=seen, topic_tag=tag, **kw)

    made = {
        "haiku": story("Anthropic releases Claude Haiku 5.5", 2, score=90, tag="Model Release"),
        "policy": story("Anthropic changes its usage policy", 5, score=60, tag="Safety"),
        "old": story("Claude 3 launch recap", 60, score=40, tag="Model Release"),
        "gemini": story("Google releases Gemini 4 Argon", 3, score=80, tag="Model Release"),
        "paper": story("Prompt-Space Meta-Learning Does Not Transfer", 1, score=30, tag="Research"),
        "draft": story("Anthropic draft without translation", 1, translated=False),
    }
    db.add(SignalTopic(label="Claude Haiku 5.5 benchmarks", signal_count=20, source_counts={"hn": 5, "news": 15}, score=70, rising=True))
    db.add(SignalTopic(label="Gemini 4 Argon", signal_count=3, source_counts={"hn": 3}, score=50))
    db.add(SignalTopic(label="That one friend who asks Claude everything", signal_count=12, source_counts={"youtube": 8, "threads": 4}, score=80, newsworthy=False))
    db.flush()
    return made


def test_topics_list_counts_recent_and_total(client, stories):
    rows = {r["slug"]: r for r in client.get("/api/topics").json()}
    assert set(rows) == {"anthropic", "google"}  # untranslated stories and Meta-Learning don't count
    assert (rows["anthropic"]["storyCount"], rows["anthropic"]["totalStories"]) == (2, 3)  # 60 days ago is not "recent"
    assert rows["anthropic"]["name"] == "Anthropic"
    assert list(rows) == ["anthropic", "google"]  # busiest first


def test_topic_page_lists_stories_newest_first_and_radar(client, stories):
    body = client.get("/api/topics/anthropic").json()
    assert [s["title"] for s in body["stories"]] == [
        "Anthropic releases Claude Haiku 5.5",
        "Anthropic changes its usage policy",
        "Claude 3 launch recap",
    ]
    assert body["stories"][0]["title_zh"] == "Anthropic releases Claude Haiku 5.5（中文）"
    assert [(r["label"], r["ring"], r["rising"]) for r in body["radar"]] == [("Claude Haiku 5.5 benchmarks", 1, True)]
    assert client.get("/api/topics/not-a-company").status_code == 404


def test_stories_seen_at_the_same_moment_list_the_best_first(client, stories, make_cluster):
    # A run updates many stories at once: 2,198 of 3,749 shared a timestamp with another story
    seen = stories["haiku"].last_seen_at  # score 90
    for score in (31, 77, 12, 95, 64, 23, 45):
        make_cluster(title=f"Anthropic note {score}", score=score, last_seen_at=seen, first_seen_at=seen)
    titles = [s["title"] for s in client.get("/api/topics/anthropic").json()["stories"]]
    assert titles[:8] == ["Anthropic note 95", "Anthropic releases Claude Haiku 5.5"] + [
        f"Anthropic note {n}" for n in (77, 64, 45, 31, 23, 12)
    ]


def test_weeks_list_and_recap(client, stories):
    weeks = client.get("/api/weeks").json()
    keys = [w["week"] for w in weeks]
    assert keys == sorted(keys, reverse=True)
    this_week = H.week_key((NOW - timedelta(days=2)).date())
    assert this_week in keys
    listed = next(w for w in weeks if w["week"] == this_week)
    # Per-day counts add up to the week; headlines say what happened, best first
    assert len(listed["dailyCounts"]) == 7 and sum(listed["dailyCounts"]) == listed["storyCount"]
    assert listed["headlines"][0]["title"] == "Anthropic releases Claude Haiku 5.5"
    assert listed["headlines"][0]["titleZh"] == "Anthropic releases Claude Haiku 5.5（中文）"
    assert len(listed["headlines"]) <= H.WEEK_HEADLINES

    recap = client.get(f"/api/weeks/{this_week}").json()
    assert recap["stories"][0]["title"] == "Anthropic releases Claude Haiku 5.5"  # best score first
    assert recap["storyCount"] == len(recap["stories"])
    assert {c["key"] for c in recap["categories"]} <= {"Model Release", "Safety", "Research"}
    monday, sunday = H.week_bounds(this_week)
    assert (recap["start"], recap["end"]) == (monday.isoformat(), sunday.isoformat())

    assert client.get("/api/weeks/2026-W99").status_code == 422
    assert client.get("/api/weeks/2001-W01").status_code == 404


def test_story_detail_links_its_topic_pages(client, stories):
    story = stories["haiku"]
    body = client.get(f"/api/clusters/{story.id}").json()
    assert body["topics"] == [{"slug": "anthropic", "name": "Anthropic"}]


def test_days_list_newest_first(client, stories):
    days = client.get("/api/days").json()
    keys = [d["date"] for d in days]
    assert keys == sorted(keys, reverse=True)
    yesterday = (NOW - timedelta(days=1)).date().isoformat()
    assert keys[0] == yesterday
    assert days[0]["storyCount"] == 1  # the untranslated draft doesn't count
    assert days[0]["headlines"][0]["title"] == "Prompt-Space Meta-Learning Does Not Transfer"
    assert days[0]["headlines"][0]["titleZh"] == "Prompt-Space Meta-Learning Does Not Transfer（中文）"


def test_day_page_lists_that_days_stories(client, stories):
    day = (NOW - timedelta(days=2)).date().isoformat()
    body = client.get(f"/api/days/{day}").json()
    assert body["date"] == day
    assert [s["title"] for s in body["stories"]] == ["Anthropic releases Claude Haiku 5.5"]
    assert body["storyCount"] == 1
    assert body["topics"] == [{"key": "anthropic", "name": "Anthropic", "count": 1}]
    assert client.get("/api/days/2026-13-01").status_code == 422
    assert client.get("/api/days/18-10-2026").status_code == 422
    assert client.get("/api/days/2001-01-01").status_code == 404


def test_feed_lists_the_newest_stories_with_their_dates(client, stories):
    items = client.get("/api/feed", params={"limit": 3}).json()
    assert [i["title"] for i in items] == [
        "Prompt-Space Meta-Learning Does Not Transfer",
        "Anthropic releases Claude Haiku 5.5",
        "Google releases Gemini 4 Argon",
    ]  # by first appearance, newest first; the untranslated draft is left out
    first = items[0]
    assert first["id"] == str(stories["paper"].id)
    assert first["publishedAt"].startswith((NOW - timedelta(days=1)).date().isoformat())
    assert {"summary", "whyItMatters", "topicTag", "sourceNames", "updatedAt", "titleZh"} <= set(first)
    assert client.get("/api/feed", params={"limit": 500}).status_code == 422


# ---------------------------------------------------------------------------
# Memory: every hub page reads the whole archive
# ---------------------------------------------------------------------------

HUB_PATHS = ["/api/topics", "/api/topics/anthropic", "/api/weeks", "/api/days", "/api/feed"]


def test_hub_pages_do_not_read_the_articles_text(client, stories, make_article, db):
    """With each article's full text, reading the archive took about 15 KB a story, and bursts of
    pages built at once took the API's memory to 1.3-1.9 GB on Railway (Oct 25 and Nov 4, 2026)."""
    import tracemalloc

    for c in stories.values():
        make_article(cluster_id=c.id, organization_name="Anthropic", raw_text="r" * 1_000_000, cleaned_text="c" * 1_000_000)
    db.expunge_all()  # read from the database, not the session's copies
    this_week = H.week_key((NOW - timedelta(days=2)).date())
    day = (NOW - timedelta(days=2)).date().isoformat()
    for path in [*HUB_PATHS, f"/api/weeks/{this_week}", f"/api/days/{day}"]:
        tracemalloc.start()
        try:
            assert client.get(path).status_code == 200, path
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        assert peak < 3_000_000, (path, peak)  # five stories carry 10 MB of article text


def test_hub_pages_still_name_each_storys_sources(client, stories, make_article, make_source, db):
    techcrunch = make_source(type="tech_press")
    make_article(cluster_id=stories["haiku"].id, source=techcrunch, organization_name="TechCrunch")
    make_article(cluster_id=stories["haiku"].id, organization_name="Anthropic")
    db.expunge_all()
    day = (NOW - timedelta(days=2)).date().isoformat()
    assert client.get(f"/api/days/{day}").json()["stories"][0]["sourceNames"] == ["Anthropic", "TechCrunch"]
    feed = {i["title"]: i for i in client.get("/api/feed").json()}
    assert feed["Anthropic releases Claude Haiku 5.5"]["sourceNames"] == ["Anthropic", "TechCrunch"]


def test_requests_that_arrive_together_read_the_archive_once(db, monkeypatch):
    """After a pipeline run Vercel rebuilds dozens of hub pages at once (55 in flight on Nov 4, 16:19):
    they share one read instead of holding one copy each."""
    import threading
    import time

    reads = []

    def slow_read(session):
        reads.append(session)
        time.sleep(0.3)
        return ("story",)

    monkeypatch.setattr(H, "_read_stories", slow_read)
    start = threading.Barrier(8)
    got = []

    def request():
        start.wait()
        got.append(H._stories(db))

    threads = [threading.Thread(target=request) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(reads) == 1 and got == [("story",)] * 8
    # A request after that read reads again: a pipeline run may have changed the stories since
    assert H._stories(db) == ("story",) and len(reads) == 2


def test_a_failed_read_fails_the_requests_waiting_on_it(db, monkeypatch):
    def broken(session):
        raise RuntimeError("database went away")

    monkeypatch.setattr(H, "_read_stories", broken)
    with pytest.raises(RuntimeError):
        H._stories(db)
    monkeypatch.setattr(H, "_read_stories", lambda session: ("story",))
    assert H._stories(db) == ("story",)  # the next request reads again


def test_requests_stop_waiting_on_a_stuck_read(db, monkeypatch):
    """A read can hang (a dead database connection waits for hours). The requests that joined it give up
    after SHARED_READ_WAIT and read on their own, and later ones don't join it; otherwise they would
    fill the API's worker threads and stall every route, /health included."""
    import threading
    import time

    stuck, release = threading.Event(), threading.Event()

    def read(session):
        if not stuck.is_set():
            stuck.set()
            release.wait(5)
            return ("stale",)
        return ("fresh",)

    monkeypatch.setattr(H, "_read_stories", read)
    monkeypatch.setattr(H, "SHARED_READ_WAIT", 0.2)
    first = threading.Thread(target=H._stories, args=(db,))
    first.start()
    try:
        assert stuck.wait(1)
        got = []
        joined = threading.Thread(target=lambda: got.append(H._stories(db)))
        joined.start()
        joined.join(2)
        assert got == [("fresh",)]  # waited for the stuck read, then read on its own
        time.sleep(0.25)
        assert H._stories(db) == ("fresh",)  # too old to join: reads at once
    finally:
        release.set()
        first.join(2)
    assert H._reading is None
