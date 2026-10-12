"""Per-reader homepage re-ranking (app.services.personalization)."""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone

import pytest

from app.services.personalization import (
    PRIOR_STRENGTH,
    ROLE_TOPIC_PRIOR,
    reading_history,
    rerank,
    topic_affinity,
)

NOW = datetime(2026, 7, 8, 12, 0, tzinfo=timezone.utc)


def story(topic: str, score: float, age_days: float = 0.0, sid: str | None = None) -> dict:
    return {
        "id": sid or f"{topic}-{score}",
        "topicTag": topic,
        "clusterScore": score,
        "lastSeenAt": (NOW - timedelta(days=age_days)).isoformat(),
    }


def ids(stories: list[dict]) -> list[str]:
    return [s["id"] for s in stories]


# ── topic_affinity ──────────────────────────────────────────────────────────


def test_no_history_and_no_role_means_no_personalization():
    assert topic_affinity(Counter(), None) == {}


def test_unknown_role_is_ignored():
    assert topic_affinity(Counter(), "ceo") == {}


def test_role_alone_is_the_cold_start_prior():
    assert topic_affinity(Counter(), "developer") == ROLE_TOPIC_PRIOR["developer"]


def test_one_story_read_barely_moves_anything():
    # history weight = 1 / (1 + PRIOR_STRENGTH)
    assert topic_affinity(Counter({"Funding": 1}), None)["Funding"] == pytest.approx(1 / (1 + PRIOR_STRENGTH))


def test_history_outweighs_the_role_prior_as_it_grows():
    few = topic_affinity(Counter({"Funding": 1}), "developer")
    many = topic_affinity(Counter({"Funding": 30}), "developer")
    assert many["Funding"] > few["Funding"]
    # a developer who mostly reads funding news now ranks Funding above Open Source
    assert many["Funding"] > many["Open Source"]
    assert few["Funding"] < few["Open Source"]


# ── rerank ──────────────────────────────────────────────────────────────────


def test_matching_topic_overtakes_a_close_competitor():
    research, funding = story("Research", 60), story("Funding", 58)
    assert ids(rerank([research, funding], {"Funding": 1.0}, now=NOW)) == [funding["id"], research["id"]]


def test_boost_is_capped_so_a_clearly_bigger_story_still_wins():
    big, niche = story("Research", 90), story("Funding", 50)  # 50 × 1.5 = 75 < 90
    assert ids(rerank([big, niche], {"Funding": 1.0}, now=NOW)) == [big["id"], niche["id"]]


def test_base_score_matches_the_global_recency_decay():
    stale_high = story("Research", 80, age_days=3)  # 80 × e^-0.45 ≈ 51
    fresh_low = story("Funding", 60)
    assert ids(rerank([stale_high, fresh_low], {}, now=NOW)) == [fresh_low["id"], stale_high["id"]]


def test_ties_keep_the_original_order():
    a, b, c = story("Research", 50, sid="a"), story("Funding", 50, sid="b"), story("Safety", 50, sid="c")
    assert ids(rerank([a, b, c], {"Model Release": 1.0}, now=NOW)) == ["a", "b", "c"]


# ── database: reading history ──────────────────────────────────────────────


@pytest.fixture
def make_event(db):
    from app.models.event import Event

    def _make(device_id: str, entity_id: str, type_: str = "cluster_viewed", days_ago: float = 0):
        db.add(Event(
            device_id=device_id,
            type=type_,
            entity_id=entity_id,
            created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
        ))
        db.flush()

    return _make


def test_reading_history_counts_distinct_recent_stories(db, make_cluster, make_event):
    funding = make_cluster(topic_tag="Funding")
    research = make_cluster(topic_tag="Research")
    other = make_cluster(topic_tag="Safety")
    old = make_cluster(topic_tag="Regulation")

    make_event("me", str(funding.id))
    make_event("me", str(funding.id))            # re-reading the same story counts once
    make_event("me", str(research.id))
    make_event("me", str(old.id), days_ago=45)    # outside the history window
    make_event("me", str(other.id), type_="other_event")  # not a story view
    make_event("me", "not-a-uuid")                # client-supplied garbage
    make_event("someone-else", str(other.id))

    assert reading_history(db, "me") == Counter({"Funding": 1, "Research": 1})


def test_reading_history_for_unknown_device_is_empty(db):
    assert reading_history(db, str(uuid.uuid4())) == Counter()


# ── HTTP: /api/digest/today?device_id=…&role=… ────────────────────────────


@pytest.fixture
def client(db, monkeypatch):
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    monkeypatch.setattr("app.api.routes.digest.cache_get", lambda key: None)
    monkeypatch.setattr("app.api.routes.digest.cache_set", lambda key, value: None)
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def digest_stories(make_cluster):
    return {
        "featured": make_cluster(title="featured", topic_tag="Research", score=95),
        "research": make_cluster(title="research", topic_tag="Research", score=60),
        "funding": make_cluster(title="funding", topic_tag="Funding", score=58),
        "launch": make_cluster(title="launch", topic_tag="Product Launch", score=45),
    }


def order(body: dict) -> list[str]:
    return [c["title"]["en"] for c in body["topClusters"]]


def test_anonymous_request_gets_the_global_order(client, digest_stories):
    body = client.get("/api/digest/today").json()
    assert order(body) == ["research", "funding", "launch"]
    assert body["personalized"] is False


def test_reading_history_reorders_the_list_but_not_the_featured_story(
    client, digest_stories, make_cluster, make_event, days_ago
):
    # three funding stories read (older ones, outside today's digest)
    for _ in range(3):
        old_funding = make_cluster(topic_tag="Funding", last_seen_at=days_ago(20))
        make_event("reader-1", str(old_funding.id))

    body = client.get("/api/digest/today", params={"device_id": "reader-1"}).json()
    assert body["featured"]["title"]["en"] == "featured"
    assert order(body) == ["funding", "research", "launch"]
    assert body["personalized"] is True


def test_role_cold_starts_a_reader_with_no_history(client, digest_stories):
    # PM prior: funding 58 × (1 + .5 × .7) ≈ 78, launch 45 × (1 + .5 × 1) = 67.5, research 60 × 1
    body = client.get("/api/digest/today", params={"device_id": str(uuid.uuid4()), "role": "pm"}).json()
    assert order(body) == ["funding", "launch", "research"]
    assert body["personalized"] is True


def test_personalized_flag_is_false_when_order_is_unchanged(client, digest_stories):
    # developer prior only boosts Research here (60 × 1.25 = 75), which is already first
    body = client.get("/api/digest/today", params={"role": "developer"}).json()
    assert order(body) == ["research", "funding", "launch"]
    assert body["personalized"] is False
