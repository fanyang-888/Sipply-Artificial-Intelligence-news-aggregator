"""GET /api/radar through the real FastAPI app (needs TEST_DATABASE_URL)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db import get_db
from app.main import app
from app.models.signal import Signal, SignalTopic
from app.signals.base import SignalItem
from app.signals.store import upsert_signals
from app.signals.topics import build_topics


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setattr("app.api.routes.radar.cache_get", lambda key: None)
    monkeypatch.setattr("app.api.routes.radar.cache_set", lambda key, value: None)
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _item(external_id, title, *, kind="hn_story", hours=12, points=10, comments=5):
    return SignalItem(
        source_kind=kind,
        external_id=external_id,
        url=f"https://example.test/{external_id}",
        discussion_url=f"https://news.ycombinator.com/item?id={external_id}" if kind.startswith("hn") else None,
        title=title,
        published_at=datetime.now(timezone.utc) - timedelta(hours=hours),
        points=points,
        num_comments=comments,
    )


@pytest.fixture
def radar_data(db):
    db.execute(delete(SignalTopic))
    db.execute(delete(Signal))
    upsert_signals(
        db,
        [
            _item("a1", "OpenAI fires three safety researchers", points=300, comments=120),
            _item("a2", "OpenAI fires safety researchers over leak", hours=30),
            _item("a3", "Why did OpenAI fire its safety researchers?", kind="hn_ask", hours=20),
            _item("n1", "OpenAI fires three safety researchers, report says", kind="gnews_item", points=None, comments=None),
            _item("b1", "Gemini 4 Argon launches", hours=200),
            _item("b2", "Gemini 4 Argon is here", hours=210),
            _item("q1", "How do you evaluate coding agents?", kind="hn_ask", points=2, comments=1),
        ],
    )
    build_topics(db, relevance_fn=lambda title: 50.0)


def test_radar_shape_and_order(client, radar_data):
    body = client.get("/api/radar").json()

    assert body["windowDays"] == 14
    assert body["generatedAt"]
    sources = {s["key"]: s for s in body["sources"]}
    assert sources["hn"]["signalCount"] == 6 and sources["news"]["signalCount"] == 1
    assert sources["youtube"]["active"] is False and sources["youtube"]["signalCount"] == 0

    topics = body["topics"]
    assert [t["score"] for t in topics] == sorted((t["score"] for t in topics), reverse=True)
    top = topics[0]
    assert top["label"] == "OpenAI fires three safety researchers"
    assert top["signalCount"] == 4
    assert top["sourceCounts"] == {"hn": 3, "news": 1}
    assert len(top["dailyCounts"]) == 14
    assert set(top["components"]) == {"volume", "engagement", "velocity", "recency", "relevance"}
    assert top["signals"][0]["title"] == "OpenAI fires three safety researchers"  # by engagement
    assert top["labelZh"] is None and top["signals"][0]["titleZh"] is None  # not translated yet
    assert top["signals"][0]["discussionUrl"].startswith("https://news.ycombinator.com/item?id=")
    assert [q["title"] for q in top["questions"]] == ["Why did OpenAI fire its safety researchers?"]

    # Every question-shaped signal in the window, topic or not
    assert {q["title"] for q in body["questions"]} == {
        "Why did OpenAI fire its safety researchers?",
        "How do you evaluate coding agents?",
    }


def test_radar_questions_are_ones_people_asked(client, db):
    db.execute(delete(SignalTopic))
    db.execute(delete(Signal))
    upsert_signals(
        db,
        [
            _item("q1", "How do you evaluate coding agents?", kind="hn_ask", points=2, comments=1),
            _item("q2", "Ask HN: Which eval harness do you use", kind="hn_ask", points=5, comments=3),
            # Flagged as question-shaped at ingest, but a how-to, a video hook and a headline
            _item("x1", "How to Make a Roblox Game With Claude AI Step by Step", points=40),
            _item("x2", "Is this the Start of AGI? | Gemini 4 Argon review!", kind="yt_video", points=None, comments=900),
            _item("x3", "Google restricts free Gemini: what changes on October 9?", kind="gnews_item", points=None, comments=None),
        ],
    )
    build_topics(db, relevance_fn=lambda title: 50.0)
    body = client.get("/api/radar").json()
    assert {q["title"] for q in body["questions"]} == {
        "How do you evaluate coding agents?",
        "Ask HN: Which eval harness do you use",
    }


def test_radar_leaves_out_topics_that_are_not_news(client, db, radar_data):
    from sqlalchemy import select

    openai = next(t for t in db.execute(select(SignalTopic)).scalars() if t.label.startswith("OpenAI"))
    openai.newsworthy = False
    db.flush()

    body = client.get("/api/radar", params={"limit": 1}).json()
    # The next topic takes its place, and the questions asked in it go too
    assert [t["label"] for t in body["topics"]] == ["Gemini 4 Argon launches"]
    assert [q["title"] for q in body["questions"]] == ["How do you evaluate coding agents?"]
    # Signal counts per source still count everything that was collected
    assert {s["key"]: s["signalCount"] for s in body["sources"]}["hn"] == 6


def test_a_topic_that_is_not_news_is_no_gap(client, db, radar_data):
    from sqlalchemy import select

    from app.auth import get_current_user

    top = db.execute(select(SignalTopic).order_by(SignalTopic.score.desc())).scalars().first()
    top.described_at, top.newsworthy = datetime.now(timezone.utc), False
    db.flush()
    app.dependency_overrides[get_current_user] = lambda: "editor"
    gaps = client.get("/api/admin/radar/gaps").json()
    assert gaps["checked"] == 0 and gaps["topics"] == []


def test_radar_limit_is_validated(client):
    assert client.get("/api/radar", params={"limit": 0}).status_code == 422
    assert client.get("/api/radar", params={"limit": 61}).status_code == 422


def test_radar_empty_before_first_run(client, db):
    db.execute(delete(SignalTopic))
    db.execute(delete(Signal))
    body = client.get("/api/radar").json()
    assert body["topics"] == [] and body["questions"] == []
    assert body["generatedAt"] is None


def test_radar_rings_momentum_and_descriptions(client, radar_data, db, make_cluster):
    from sqlalchemy import select

    body = client.get("/api/radar").json()
    by_label = {t["label"]: t for t in body["topics"]}
    openai, gemini = by_label["OpenAI fires three safety researchers"], by_label["Gemini 4 Argon launches"]
    # 4 posts on HN + news → picking up; 2 posts a week ago → weak and cooling
    # all four posts within the last 30 hours: new, not rising
    assert (openai["ring"], openai["momentum"], openai["isNew"]) == (2, "new", True)
    assert (gemini["ring"], gemini["momentum"], gemini["isNew"]) == (3, "cooling", False)
    # Not described yet
    assert openai["summaryEn"] is None and openai["coverage"] is None
    # Evidence trail: one entry per day of the window, ending at today's numbers
    assert len(openai["trailSignals"]) == len(openai["trailRings"]) == 14
    assert (openai["trailSignals"][-1], openai["trailRings"][-1]) == (4, 2)
    assert openai["trailSignals"][-3] == 0  # none of its posts is older than 30 hours

    story = make_cluster(title="Fired OpenAI safety researchers dispute misconduct claims", title_zh="被解雇的 OpenAI 安全研究员否认不当行为")
    topics = {t.label: t for t in db.execute(select(SignalTopic)).scalars()}
    t = topics["OpenAI fires three safety researchers"]
    t.summary_en, t.summary_zh = "OpenAI fired three safety researchers.", "OpenAI 解雇了三名安全研究员。"
    t.covered_cluster_id, t.described_at = story.id, datetime.now(timezone.utc)
    g = topics["Gemini 4 Argon launches"]
    g.described_at = datetime.now(timezone.utc)  # described, but a weak signal: no coverage shown
    db.flush()

    body = client.get("/api/radar").json()
    by_label = {t["label"]: t for t in body["topics"]}
    openai = by_label["OpenAI fires three safety researchers"]
    assert openai["summaryZh"] == "OpenAI 解雇了三名安全研究员。"
    assert openai["coverage"] == {
        "status": "covered",
        "clusterId": str(story.id),
        "slug": f"fired-openai-safety-researchers-dispute-misconduct-claims-{story.id.hex[:8]}",
        "title": "Fired OpenAI safety researchers dispute misconduct claims",
        "titleZh": "被解雇的 OpenAI 安全研究员否认不当行为",
    }
    assert by_label["Gemini 4 Argon launches"]["coverage"] is None

    t.covered_cluster_id = None  # checked, no Sipply story: the public radar doesn't say so
    db.flush()
    openai = next(x for x in client.get("/api/radar").json()["topics"] if x["label"] == t.label)
    assert openai["coverage"] is None


def test_radar_returns_chinese_titles(client, radar_data, db):
    from sqlalchemy import select

    lead = db.execute(select(Signal).where(Signal.external_id == "a1")).scalar_one()
    lead.title_zh = "OpenAI 解雇三名安全研究员"
    db.flush()

    top = client.get("/api/radar").json()["topics"][0]
    assert top["label"] == "OpenAI fires three safety researchers"
    assert top["labelZh"] == "OpenAI 解雇三名安全研究员"
    assert top["signals"][0]["titleZh"] == "OpenAI 解雇三名安全研究员"


def test_gaps_and_briefs_are_for_the_editor_only(client, db, radar_data, make_cluster):
    from sqlalchemy import select

    from app.auth import get_current_user

    brief = {
        "headlineEn": "OpenAI fires three safety researchers",
        "headlineZh": "OpenAI 解雇三名安全研究员",
        "angleEn": None,
        "angleZh": None,
        "questions": [{"en": "Why did OpenAI fire them?", "zh": "为什么？"}],
        "facts": [
            {"en": "Three were fired.", "zh": "三人被解雇。", "source": {"title": "t", "url": "https://example.test/a1", "platform": "hn"}},
        ],
        "sources": [{"title": "t", "url": "https://example.test/a1", "platform": "hn"}],
        "model": "gpt-4o-mini",
        "writtenAt": "2026-10-15T14:00:00+00:00",
    }
    top = db.execute(select(SignalTopic).order_by(SignalTopic.score.desc())).scalars().first()
    top.described_at = datetime.now(timezone.utc)
    top.brief = brief
    db.flush()

    # The public radar says nothing about what Sipply hasn't covered
    entry = next(t for t in client.get("/api/radar").json()["topics"] if t["id"] == str(top.id))
    assert entry["coverage"] is None and "brief" not in entry

    # The editor sees the gap and its brief, behind the admin login
    assert client.get("/api/admin/radar/gaps").status_code == 401
    app.dependency_overrides[get_current_user] = lambda: "editor"
    gaps = client.get("/api/admin/radar/gaps").json()
    assert gaps["checked"] == 1 and [t["id"] for t in gaps["topics"]] == [str(top.id)]
    assert gaps["topics"][0]["brief"]["headlineEn"] == "OpenAI fires three safety researchers"
    assert gaps["topics"][0]["signals"][0]["title"] == "OpenAI fires three safety researchers"

    # Once Sipply has a story: a positive link on the public radar, no longer a gap
    story = make_cluster(title="OpenAI fires three safety researchers")
    top.covered_cluster_id = story.id
    db.flush()
    entry = next(t for t in client.get("/api/radar").json()["topics"] if t["id"] == str(top.id))
    assert entry["coverage"]["status"] == "covered" and entry["coverage"]["clusterId"] == str(story.id)
    assert client.get("/api/admin/radar/gaps").json()["topics"] == []
