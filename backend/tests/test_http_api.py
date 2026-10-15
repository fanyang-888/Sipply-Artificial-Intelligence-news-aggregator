"""HTTP-level checks through the real FastAPI app (needs TEST_DATABASE_URL).

The app's startup hook (migrations + source seeding) only runs when the
TestClient is used as a context manager, so it is deliberately not.
"""

import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_health(client):
    assert client.get("/health").status_code == 200


def test_search_parses_topic_tags_query_param(client, make_cluster):
    make_cluster(title="funding story", topic_tag="Funding")
    make_cluster(title="safety story", topic_tag="Safety")
    make_cluster(title="model story", topic_tag="Model Release")

    body = client.get("/api/search", params={"topic_tags": "Regulation,Safety,Funding"}).json()
    assert body["total"] == 2
    assert {c["topicTag"] for c in body["clusters"]} == {"Funding", "Safety"}


def test_search_rejects_oversized_page(client):
    assert client.get("/api/search", params={"limit": 500}).status_code == 422


def test_digest_featured_is_top_ranked(client, make_cluster, monkeypatch):
    monkeypatch.setattr("app.api.routes.digest.cache_get", lambda key: None)
    monkeypatch.setattr("app.api.routes.digest.cache_set", lambda key, value: None)
    top = make_cluster(title="top", score=95)
    make_cluster(title="second", score=60)
    make_cluster(title="third", score=40)

    body = client.get("/api/digest/today").json()
    assert body["featured"]["id"] == str(top.id)
    assert [c["title"]["en"] for c in body["topClusters"]] == ["second", "third"]


def test_cluster_index_lists_public_stories_newest_first(client, make_cluster, days_ago, monkeypatch):
    monkeypatch.setattr("app.api.routes.clusters.cache_get", lambda key: None)
    monkeypatch.setattr("app.api.routes.clusters.cache_set", lambda key, value: None)
    old = make_cluster(title="old", last_seen_at=days_ago(3))
    new = make_cluster(title="new", last_seen_at=days_ago(0))
    hidden = make_cluster(title="untranslated", title_zh=None)

    body = client.get("/api/clusters/index").json()
    ids = [row["id"] for row in body]
    assert str(hidden.id) not in ids
    assert ids.index(str(new.id)) < ids.index(str(old.id))
    assert set(body[0]) == {"id", "lastSeenAt"}


def test_cluster_index_route_is_not_shadowed_by_id_route(client, monkeypatch):
    monkeypatch.setattr("app.api.routes.clusters.cache_get", lambda key: None)
    monkeypatch.setattr("app.api.routes.clusters.cache_set", lambda key, value: None)
    assert client.get("/api/clusters/index").status_code == 200
    assert client.get("/api/clusters/not-a-uuid").status_code == 422


def test_cluster_related_stories_share_a_subject(client, make_cluster):
    story = make_cluster(title="Anthropic launches Claude Haiku 5.5", summary="Anthropic's new small model.", score=40)
    near = make_cluster(title="Claude Haiku 5.5 benchmarks: faster and cheaper", score=30)
    make_cluster(title="Import AI 476: Creativity and RSI; AI goes to space", score=99)
    body = client.get(f"/api/clusters/{story.id}").json()
    assert body["relatedClusterIds"] == [str(near.id)]


def test_story_lists_community_discussion_from_the_radar(client, db, make_cluster):
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import delete

    from app.models.signal import Signal, SignalTopic
    from app.signals.base import SignalItem
    from app.signals.store import upsert_signals

    db.execute(delete(Signal))
    db.execute(delete(SignalTopic))
    story = make_cluster(title="Google releases Gemini 4 Argon")
    topic = SignalTopic(label="Gemini 4 Argon", signal_count=4, source_counts={"hn": 2, "news": 1, "youtube": 1}, score=80, covered_cluster_id=story.id)
    db.add(topic)
    db.flush()
    now = datetime.now(timezone.utc)

    def item(eid, title, kind, points=None):
        return SignalItem(source_kind=kind, external_id=eid, url=f"https://example.test/{eid}", title=title,
                          published_at=now - timedelta(hours=3), points=points, num_comments=10 if points else None)

    upsert_signals(db, [
        item("hn1", "Gemini 4 Argon", "hn_story", points=1400),
        item("hn2", "Gemini 4 Argon for Robotics", "hn_story", points=230),
        item("bs1", "Gemini 4 Argon is out and it is good", "bsky_post", points=None),
        item("n1", "Google launches Gemini 4 Argon", "gnews_item"),
        item("yt1", "Google Just DROPPED Its Most Powerful AI Ever", "yt_video"),
    ], now=now)
    db.execute(Signal.__table__.update().values(topic_id=topic.id))
    db.flush()

    body = client.get(f"/api/clusters/{story.id}").json()
    # Discussion platforms only, most engaged first; news re-reports and videos left out
    assert [d["title"] for d in body["discussions"]] == [
        "Gemini 4 Argon",
        "Gemini 4 Argon for Robotics",
        "Gemini 4 Argon is out and it is good",
    ]
    assert body["discussions"][0]["source"] == "hn"
    other = make_cluster(title="Unrelated story")
    assert client.get(f"/api/clusters/{other.id}").json()["discussions"] == []
