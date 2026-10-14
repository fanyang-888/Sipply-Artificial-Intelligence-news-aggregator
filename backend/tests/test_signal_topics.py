"""Trend Radar topics: tagging, velocity, scoring, grouping, and the DB build."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest

from app.services.clustering import group_texts
from app.signals import topics as T
from app.signals.base import SignalItem
from app.signals.topic_tags import tag_title, tag_titles

NOW = datetime(2026, 10, 12, 12, 0, tzinfo=timezone.utc)


def ago(days: float) -> datetime:
    return NOW - timedelta(days=days)


def sig(title, days=1.0, kind="hn_story", points=0, comments=0):
    return SimpleNamespace(
        id=uuid.uuid4(),
        title=title,
        published_at=ago(days),
        source_kind=kind,
        points=points,
        num_comments=comments,
        like_count=None,
    )


# ---------------------------------------------------------------------------
# Topic tags
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("title", "tag"),
    [
        ("Gemini 4 Argon", "Model Release"),
        ("Mistral Large 4", "Model Release"),
        ("OpenAI annualised revenues $20B less than signalled", "Funding"),
        ("Anthropic launches free AI security scans", "Product Launch"),
        ("Nvidia GPU shortage hits labs", "Infrastructure"),
        ("OpenAI fires three safety researchers", "Safety"),
        ("New research on scaling laws", "Research"),
        # word boundaries: no "fund" in "fundamental", no "invest" in "investigating"
        ("The fundamental limits of transformers", "Other"),
        ("Investigating unintended model actions", "Other"),
        # a bare model name is not a release
        ("Claude Code is great", "Other"),
    ],
)
def test_tag_title(title, tag):
    assert tag_title(title) == tag


def test_tag_titles_majority_ignores_other():
    titles = ["Gemini 4 Argon", "Gemini 4 is here", "Something else entirely", "Google funding $2B round"]
    assert tag_titles(titles) == "Model Release"
    assert tag_titles(["nothing", "here"]) == "Other"


# ---------------------------------------------------------------------------
# Velocity / scoring
# ---------------------------------------------------------------------------

def test_daily_counts_buckets_oldest_first():
    counts = T.daily_counts([ago(0.5), ago(0.9), ago(1.5), ago(13.5), ago(20)], NOW, 14)
    assert counts[-1] == 2 and counts[-2] == 1 and counts[0] == 1
    assert sum(counts) == 4  # the 20-day-old one is outside the window


def test_velocity_flat_rising_and_fading():
    assert T.velocity_ratio([1] * 14) == pytest.approx(1.0)
    surge = [0] * 11 + [3, 3, 3]
    assert T.velocity_ratio(surge) == pytest.approx(7.0)  # (3 + .5) / (0 + .5)
    fading = [3] * 11 + [0, 0, 0]
    assert T.velocity_ratio(fading) < 0.2
    # one brand-new post is mild growth, not an infinite surge
    assert T.velocity_ratio([0] * 13 + [1]) == pytest.approx(1.67, abs=0.01)


def test_score_components_and_total():
    c = T.score_components(
        signal_count=25, families=2, active_families=2, engagement=3000,
        velocity=6.0, last_seen=ago(0.5), now=NOW, relevance=80.0,
    )
    assert c == {"volume": 100.0, "engagement": 100.0, "velocity": 100.0, "recency": 100.0, "relevance": 80.0}
    # .25·100 ×3 + .1·100 + .15·80
    assert T.total_score(c) == pytest.approx(97.0)

    quiet = T.score_components(
        signal_count=1, families=1, active_families=2, engagement=0,
        velocity=1.0, last_seen=ago(10), now=NOW, relevance=50.0,
    )
    assert quiet["engagement"] == 0.0
    assert quiet["recency"] == 15.0
    assert 30 < quiet["velocity"] < 40  # flat


@pytest.mark.parametrize(("hours", "expected"), [(5, 100.0), (48, 70.0), (100, 40.0), (400, 15.0)])
def test_recency_buckets(hours, expected):
    assert T.recency_score(NOW - timedelta(hours=hours), NOW) == expected


# ---------------------------------------------------------------------------
# Grouping
# ---------------------------------------------------------------------------

def test_group_texts_links_similar_titles_within_dates():
    texts = [
        "OpenAI fires three safety researchers",
        "OpenAI fires safety researchers over leak",
        "Gemini 4 Argon launches",
        "OpenAI fires three safety researchers",  # same words, but a month later
    ]
    dates = [ago(1), ago(2), ago(1), ago(40)]
    groups = group_texts(texts, dates, threshold=0.4, date_proximity_days=5, vectorizer_kwargs={"stop_words": "english"})
    assert sorted(map(sorted, groups)) == [[0, 1], [2], [3]]


def test_group_texts_empty_corpus():
    assert group_texts([], [], threshold=0.4, date_proximity_days=5) is None
    assert group_texts(["the", "a"], [None, None], threshold=0.4, date_proximity_days=5,
                       vectorizer_kwargs={"stop_words": "english"}) is None


def test_refine_groups_splits_big_loose_groups_only(monkeypatch):
    from sklearn.feature_extraction.text import TfidfVectorizer

    monkeypatch.setattr(T, "MAX_GROUP_SIZE", 3)
    loose = ["apple banana", "apple banana", "cherry plum", "cherry plum",
             "kiwi mango", "kiwi mango", "pear fig", "pear fig"]
    texts = loose + ["delta epsilon"] * 4
    dates = [ago(1)] * len(texts)
    matrix = TfidfVectorizer().fit_transform(texts)
    chained, tight = list(range(8)), [8, 9, 10, 11]
    # Pretend a loose first pass chained four stories into one group
    assert T.cohesion(matrix, tight) == pytest.approx(1.0)
    assert T.cohesion(matrix, chained) < T.MIN_COHESION
    refined = T.refine_groups([chained, tight], texts, dates, matrix, threshold=0.2)
    assert sorted(map(sorted, refined)) == [[0, 1], [2, 3], [4, 5], [6, 7], tight]


def test_draft_topics_keeps_groups_and_hot_singletons():
    signals = [
        sig("Anthropic bans cruel behavior towards Claude", 0.5, points=50),
        sig("Anthropic bans cruel behavior to Claude models", 1.0, "gnews_item"),
        sig("Anthropic bans cruel behavior, users react", 2.0, points=20),
        sig("Lonely low-traffic post about tokenizers", 1.0, points=4),
        sig("Viral essay on LLM capability gap", 0.3, points=600, comments=300),
    ]
    drafts, n_groups = T.draft_topics(
        signals, now=NOW, window_days=14, active_families=2, relevance_fn=lambda title: 50.0
    )
    labels = [d.label for d in drafts]
    assert n_groups == 3
    assert "Lonely low-traffic post about tokenizers" not in labels
    assert "Viral essay on LLM capability gap" in labels
    group = next(d for d in drafts if d.signal_count == 3)
    assert group.label == "Anthropic bans cruel behavior towards Claude"  # most engagement
    assert group.source_counts == {"hn": 2, "news": 1}
    # 3 signals in the last 3 days and none before: new, not rising
    assert not group.rising
    assert group.topic_tag == "Regulation"
    assert drafts == sorted(drafts, key=lambda d: -d.score)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def item(external_id, title, *, days=1.0, kind="hn_story", points=10, comments=2):
    return SignalItem(
        source_kind=kind,
        external_id=external_id,
        url=f"https://example.test/{external_id}",
        title=title,
        published_at=ago(days),
        points=points,
        num_comments=comments,
    )


def test_upsert_inserts_then_refreshes_metrics(db):
    from sqlalchemy import select

    from app.models.signal import Signal
    from app.signals.store import upsert_signals

    assert upsert_signals(db, [item("u1", "First"), item("u1", "First (dupe in batch)")], now=NOW) == 1
    upsert_signals(db, [item("u1", "First", points=99, comments=40)], now=NOW + timedelta(hours=6))
    rows = db.execute(select(Signal).where(Signal.external_id == "u1")).scalars().all()
    assert len(rows) == 1
    db.refresh(rows[0])
    assert (rows[0].points, rows[0].num_comments) == (99, 40)
    assert rows[0].fetched_at == NOW + timedelta(hours=6)


def test_fetch_since_backfills_then_overlaps(db):
    from sqlalchemy import delete

    from app.models.signal import Signal
    from app.signals.config import RadarConfig
    from app.signals.ingest import fetch_since
    from app.signals.store import upsert_signals

    db.execute(delete(Signal))
    cfg = RadarConfig(window_days=14, refresh_overlap_days=2)
    assert fetch_since(db, "hn", cfg, NOW) == NOW - timedelta(days=14)
    upsert_signals(db, [item("f1", "x")], now=NOW - timedelta(hours=6))
    assert fetch_since(db, "hn", cfg, NOW) == NOW - timedelta(days=2, hours=6)
    # news has not run yet → full backfill
    assert fetch_since(db, "news", cfg, NOW) == NOW - timedelta(days=14)


def test_build_topics_replaces_topics_and_prunes(db):
    from sqlalchemy import delete, func, select

    from app.models.signal import Signal, SignalTopic
    from app.signals.store import upsert_signals

    db.execute(delete(Signal))
    upsert_signals(
        db,
        [
            item("b1", "OpenAI fires three safety researchers", days=0.5),
            item("b2", "OpenAI fires safety researchers over leak", days=1.0),
            item("b3", "Lonely post", days=1.0, points=1, comments=0),
            item("b4", "Ancient history", days=90),
        ],
        now=NOW,
    )
    summary = T.build_topics(db, now=NOW, relevance_fn=lambda title: 50.0)
    assert summary["topics"] == 1 and summary["pruned"] == 1

    topic = db.execute(select(SignalTopic)).scalar_one()
    assert topic.signal_count == 2
    members = db.execute(select(Signal.external_id).where(Signal.topic_id == topic.id)).scalars().all()
    assert sorted(members) == ["b1", "b2"]

    # A rebuild replaces, never accumulates
    T.build_topics(db, now=NOW, relevance_fn=lambda title: 50.0)
    assert db.execute(select(func.count()).select_from(SignalTopic)).scalar_one() == 1
    assert db.execute(select(func.count()).select_from(Signal).where(Signal.external_id == "b4")).scalar_one() == 0


@pytest.mark.parametrize(
    ("count", "platforms", "ring"),
    [
        (15, 1, 1),  # plenty of posts, even on one platform
        (72, 2, 1),
        (14, 1, 2),
        (5, 1, 2),
        (3, 2, 2),  # a handful, but already on two platforms
        (4, 1, 3),  # four YouTube videos
        (2, 2, 3),
        (1, 1, 3),
    ],
)
def test_evidence_ring(count, platforms, ring):
    assert T.evidence_ring(count, platforms) == ring


def momentum(counts, last_seen_days=0.2):
    return T.topic_momentum(
        counts=counts, velocity=T.velocity_ratio(counts), last_seen=ago(last_seen_days), now=NOW
    )


def test_topic_momentum():
    quiet11 = [0] * 11
    # Only in the last 3 days (at most 1 earlier post): new, however fast
    assert momentum(quiet11 + [10, 20, 30]) == "new"
    assert momentum([1] + [0] * 10 + [5, 5, 5]) == "new"
    # Discussed before, now at least 2x faster with 3+ recent posts: rising
    assert momentum([1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 3, 4, 5]) == "rising"
    # A slow trickle that picked up only a little: steady
    assert momentum([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1]) == "steady"
    # Slowed down, or nothing new for more than three days: cooling
    assert momentum([5] * 11 + [0, 0, 1]) == "cooling"
    assert momentum([0] * 6 + [3] * 5 + [0, 0, 0], last_seen_days=3.5) == "cooling"
    assert T.topic_momentum(counts=[], velocity=1.0, last_seen=None, now=NOW) == "cooling"


def test_label_comes_from_headlines_before_videos_and_posts():
    members = [
        sig("Is this the Start of AGI? | Gemini 4 Argon review!", 0.5, "yt_video", points=0, comments=900),
        sig("anotha one, Gemini is out", 0.4, "bsky_post", points=0, comments=500),
        sig("Google releases Gemini 4 Argon", 1.0, "gnews_item"),
        sig("Gemini 4 Argon", 1.0, "hn_story", points=300, comments=120),
    ]
    assert T.label_signal(members).title == "Gemini 4 Argon"  # HN first, though the video has more engagement
    assert T.label_signal(members[:3]).title == "Google releases Gemini 4 Argon"  # then news
    assert T.label_signal(members[:2]).title == "anotha one, Gemini is out"  # Bluesky before YouTube


def test_evidence_trail_rebuilds_ring_history_from_publish_dates():
    members = [(ago(10.5), "hn"), (ago(9.5), "hn")]  # a quiet start on HN
    members += [(ago(2.5), "news")] * 3  # news picks it up
    members += [(ago(0.5), "news")] * 12  # then the burst
    signals, rings = T.evidence_trail(members, now=NOW, days=14)
    assert len(signals) == len(rings) == 14
    assert signals[0] == 0 and rings[0] == 0  # 13 days ago: nothing yet
    assert (signals[-11], rings[-11]) == (1, 3)  # 10 days ago: one HN post, weak signal
    assert (signals[-3], rings[-3]) == (5, 2)  # 2 days ago: 5 posts on two platforms
    assert (signals[-1], rings[-1]) == (17, 1)  # now: mainstream
    assert signals == sorted(signals)  # only accumulates
    assert T.evidence_trail([], now=NOW, days=3) == ([0, 0, 0], [0, 0, 0])


def test_match_previous_best_overlap_first_and_one_to_one():
    old = {"A": {1, 2, 3, 4}, "B": {10, 11}}
    new = [
        {1, 2, 3, 4, 5},  # grew by one post: continues A (0.8)
        {1, 2, 3},  # also overlaps A (0.75), but A is taken
        {10, 11, 12, 13, 14},  # 2/5 = 0.4: too different from B
        {99},
    ]
    assert T.match_previous(new, old) == ["A", None, None, None]
    assert T.match_previous([], old) == []
    assert T.match_previous([{1}], {}) == [None]


def test_build_topics_carries_descriptions_to_the_matching_topic(db):
    from sqlalchemy import delete, select

    from app.models.signal import Signal, SignalTopic
    from app.signals.store import upsert_signals

    db.execute(delete(Signal))
    upsert_signals(
        db,
        [
            item("c1", "OpenAI fires three safety researchers", days=0.5),
            item("c2", "OpenAI fires safety researchers over leak", days=1.0),
            item("g1", "Gemini 4 Argon launches", days=1.0),
            item("g2", "Gemini 4 Argon is here", days=1.2),
        ],
        now=NOW,
    )
    T.build_topics(db, now=NOW, relevance_fn=lambda title: 50.0)
    openai = db.execute(select(SignalTopic).where(SignalTopic.label.like("OpenAI%"))).scalar_one()
    story_id = uuid.uuid4()
    openai.summary_en, openai.summary_zh = "OpenAI fired three safety researchers.", "OpenAI 解雇了三名安全研究员。"
    openai.covered_cluster_id, openai.described_signal_count, openai.described_at = story_id, 2, NOW
    db.flush()
    old_id = openai.id

    # One more post joins the OpenAI topic; Gemini was never described
    upsert_signals(db, [item("c3", "OpenAI fires three safety researchers, report says", days=0.2)], now=NOW)
    summary = T.build_topics(db, now=NOW, relevance_fn=lambda title: 50.0)
    assert summary["descriptions_kept"] == 1

    rows = {t.label[:6]: t for t in db.execute(select(SignalTopic)).scalars()}
    kept = rows["OpenAI"]
    assert kept.id != old_id and kept.signal_count == 3
    assert (kept.summary_zh, kept.covered_cluster_id, kept.described_signal_count) == (
        "OpenAI 解雇了三名安全研究员。", story_id, 2,
    )
    assert rows["Gemini"].described_at is None and rows["Gemini"].summary_en is None


def test_run_ingest_end_to_end_with_mocked_sources(db):
    from sqlalchemy import delete, func, select

    from app.models.signal import Signal
    from app.signals.config import GNewsConfig, HNConfig, RadarConfig, YouTubeConfig
    from app.signals.ingest import run_ingest

    db.execute(delete(Signal))

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "hn.algolia.com":
            hit = {
                "objectID": "42", "title": "Ask HN: How do you test agents?", "url": None,
                "points": 12, "num_comments": 30, "created_at_i": int(ago(1).timestamp()),
                "_tags": ["story", "ask_hn"],
            }
            return httpx.Response(200, json={"hits": [hit], "nbPages": 1})
        return httpx.Response(200, content=b'<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>')

    from app.signals.base import SignalCredentials
    from app.signals.config import DevtoConfig, GitHubConfig, LobstersConfig

    cfg = RadarConfig(
        hn=HNConfig(queries=["agents"]),
        gnews=GNewsConfig(queries=["agents"]),
        youtube=YouTubeConfig(queries=["agents"]),
        github=GitHubConfig(enabled=False),
        devto=DevtoConfig(enabled=False),
        lobsters=LobstersConfig(enabled=False),
    )
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    summary = asyncio.run(run_ingest(db, client, cfg, now=NOW, credentials=SignalCredentials(), pause_sec=0))

    assert summary["hn"]["status"] == "ok" and summary["hn"]["written"] == 1
    assert summary["news"]["status"] == "ok" and summary["news"]["items"] == 0
    # keyed sources are skipped without credentials, disabled ones by config
    for family in ("youtube", "bluesky", "threads", "github", "devto", "lobsters"):
        assert summary[family]["status"] == "skipped", family
    row = db.execute(select(Signal)).scalar_one()
    assert (row.source_kind, row.is_question) == ("hn_ask", True)
    assert db.execute(select(func.count()).select_from(Signal)).scalar_one() == 1


# ---------------------------------------------------------------------------
# Chinese titles (translate_signals)
# ---------------------------------------------------------------------------

class FakeOpenAI:
    """Stands in for openai.OpenAI: answers with "<zh>title" for every id it was sent."""

    def __init__(self, drop_ids=()):
        self.calls: list[list[dict]] = []
        self.drop_ids = set(drop_ids)
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        import json

        sent = json.loads(kw["messages"][1]["content"])
        self.calls.append(sent)
        rows = [{"id": r["id"], "zh": f"<zh>{r['en']}"} for r in sent if r["id"] not in self.drop_ids]
        message = SimpleNamespace(content=json.dumps({"translations": rows}))
        return SimpleNamespace(
            choices=[SimpleNamespace(message=message)],
            usage=SimpleNamespace(prompt_tokens=100, completion_tokens=200),
        )


def test_translate_batch_maps_answers_back_by_id():
    from app.signals.translate import translate_batch

    zh, p, c = translate_batch(FakeOpenAI(drop_ids={1}), ["Claude Haiku 5.5", "Missing one", "Ask HN: Why?"])
    assert zh == ["<zh>Claude Haiku 5.5", None, "<zh>Ask HN: Why?"]
    assert (p, c) == (100, 200)


def test_run_translate_only_visible_untranslated_signals(db):
    from sqlalchemy import delete, select

    from app.models.signal import Signal
    from app.signals.store import upsert_signals
    from app.signals.translate import run_translate

    db.execute(delete(Signal))
    upsert_signals(
        db,
        [
            item("t1", "OpenAI fires three safety researchers", days=0.5),
            item("t2", "OpenAI fires safety researchers over leak", days=1.0),
            item("q1", "How do you evaluate coding agents?", days=1.0, points=1, comments=0),
            item("x1", "Lonely post nobody sees", days=1.0, points=1, comments=0),
            item("old", "Why so old?", days=40),
        ],
        now=NOW,
    )
    T.build_topics(db, now=NOW, relevance_fn=lambda title: 50.0)

    fake = FakeOpenAI()
    summary = run_translate(db, fake, now=NOW, window_days=14, batch_size=2)
    rows = {s.external_id: s.title_zh for s in db.execute(select(Signal)).scalars()}
    # topic members + the question; not the loner, not the out-of-window question
    assert rows == {
        "t1": "<zh>OpenAI fires three safety researchers",
        "t2": "<zh>OpenAI fires safety researchers over leak",
        "q1": "<zh>How do you evaluate coding agents?",
        "x1": None,
        "old": None,
    }
    assert summary["translated"] == 3 and summary["failed"] == 0
    assert [len(c) for c in fake.calls] == [2, 1]  # batches of 2
    assert summary["cost_usd"] > 0

    # Already-translated titles are never sent again
    again = FakeOpenAI()
    assert run_translate(db, again, now=NOW, window_days=14)["pending"] == 0
    assert again.calls == []


def test_upsert_resets_translation_only_when_title_changes(db):
    from sqlalchemy import select

    from app.models.signal import Signal
    from app.signals.store import upsert_signals

    upsert_signals(db, [item("z1", "Original title")], now=NOW)
    row = db.execute(select(Signal).where(Signal.external_id == "z1")).scalar_one()
    row.title_zh = "原标题"
    db.flush()

    upsert_signals(db, [item("z1", "Original title", points=50)], now=NOW)
    db.refresh(row)
    assert row.title_zh == "原标题"  # same title, new points: keep

    upsert_signals(db, [item("z1", "Edited title")], now=NOW)
    db.refresh(row)
    assert row.title_zh is None  # title changed: translate again


def test_run_translate_stops_at_the_first_api_error(db):
    from sqlalchemy import delete

    from app.models.signal import Signal
    from app.signals.store import upsert_signals
    from app.signals.translate import run_translate

    db.execute(delete(Signal))
    upsert_signals(db, [item(f"e{i}", f"How do agents work, part {i}?") for i in range(5)], now=NOW)

    calls = []

    def boom(**kw):
        calls.append(kw)
        raise RuntimeError("401 invalid_api_key")

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=boom)))
    summary = run_translate(db, client, now=NOW, window_days=14, batch_size=2)
    assert len(calls) == 1  # no retry storm across the other batches
    assert summary["translated"] == 0 and summary["failed"] == 5
