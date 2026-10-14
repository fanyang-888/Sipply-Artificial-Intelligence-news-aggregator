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
    monkeypatch.setattr(H, "cache_set", lambda key, value: None)
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


def test_weeks_list_and_recap(client, stories):
    weeks = client.get("/api/weeks").json()
    keys = [w["week"] for w in weeks]
    assert keys == sorted(keys, reverse=True)
    this_week = H.week_key((NOW - timedelta(days=2)).date())
    assert this_week in keys

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
