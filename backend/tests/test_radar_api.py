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


def test_radar_limit_is_validated(client):
    assert client.get("/api/radar", params={"limit": 0}).status_code == 422
    assert client.get("/api/radar", params={"limit": 61}).status_code == 422


def test_radar_empty_before_first_run(client, db):
    db.execute(delete(SignalTopic))
    db.execute(delete(Signal))
    body = client.get("/api/radar").json()
    assert body["topics"] == [] and body["questions"] == []
    assert body["generatedAt"] is None


def test_radar_returns_chinese_titles(client, radar_data, db):
    from sqlalchemy import select

    lead = db.execute(select(Signal).where(Signal.external_id == "a1")).scalar_one()
    lead.title_zh = "OpenAI 解雇三名安全研究员"
    db.flush()

    top = client.get("/api/radar").json()["topics"][0]
    assert top["label"] == "OpenAI fires three safety researchers"
    assert top["labelZh"] == "OpenAI 解雇三名安全研究员"
    assert top["signals"][0]["titleZh"] == "OpenAI 解雇三名安全研究员"
