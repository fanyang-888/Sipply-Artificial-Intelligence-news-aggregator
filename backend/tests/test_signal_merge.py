"""Merging Trend Radar topics that cover the same story."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.signals import merge as M
from app.signals.base import SignalItem

NOW = datetime(2026, 10, 14, 14, 0, tzinfo=timezone.utc)

# Real headlines from 2026-10-14: the same incident in different words, and an unrelated story
BUGGING_A = [
    "OpenAI engineer arrested in bugging of executive conference room",
    "OpenAI engineer arrested for bugging executive conference room",
    "Former OpenAI engineer charged with bugging executive meeting room",
]
BUGGING_B = [
    "Saudi National Arrested for Installing Audio Recording Device at OpenAI",
    "Saudi national arrested over recording device at OpenAI office",
    "Recording device found at OpenAI office, Saudi national arrested",
]
OTHER = [
    "Ecosia switches from Mistral to open-weight AI models",
    "Ecosia drops Mistral for open-weight models",
]


class FakeOpenAI:
    """Answers "same" for pairs where ``same(a, b)`` is true."""

    def __init__(self, same=lambda a, b: False):
        self.calls: list[list[dict]] = []
        self.same = same
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        sent = json.loads(kw["messages"][1]["content"])
        self.calls.append(sent)
        rows = [{"id": p["id"], "same": self.same(p["a"], p["b"])} for p in sent]
        message = SimpleNamespace(content=json.dumps({"pairs": rows}))
        return SimpleNamespace(
            choices=[SimpleNamespace(message=message)],
            usage=SimpleNamespace(prompt_tokens=800, completion_tokens=60),
        )


def about_bugging(titles):
    return any("bugging" in t or "recording device" in t.lower() for t in titles)


# ---------------------------------------------------------------------------
# Pure parts
# ---------------------------------------------------------------------------

def test_candidate_pairs_keep_similar_topics_only():
    pairs = M.candidate_pairs([BUGGING_A, BUGGING_B, OTHER])
    assert [(i, j) for i, j, _ in pairs] == [(0, 1)]
    assert M.candidate_pairs([BUGGING_A]) == []
    assert M.candidate_pairs([["the of and"], ["is a"]]) == []


def test_candidate_pairs_most_similar_first_and_capped():
    topics = [["Gemini 4 Argon"], ["Gemini 4 Argon is here"], ["Gemini 4 Argon for Robotics demo"]]
    pairs = M.candidate_pairs(topics, limit=2)
    assert len(pairs) == 2 and pairs[0][2] >= pairs[1][2]


def test_candidate_pairs_keeps_pairs_that_cover_the_same_story():
    # Ecosia and the bugging story share no words; a forced pair is kept beyond the threshold and the cap
    pairs = M.candidate_pairs([BUGGING_A, BUGGING_B, OTHER], limit=1, must_include={(2, 0)})
    assert [(i, j) for i, j, _ in pairs] == [(0, 1), (0, 2)]
    assert pairs[1][2] < M.MIN_PAIR_SIMILARITY
    assert M.candidate_pairs([["the of and"], ["is a"]], must_include={(0, 1)}) == [(0, 1, 0.0)]


def test_merge_sets_joins_chains():
    assert M.merge_sets([(0, 3, True), (3, 4, True)]) == [[0, 3, 4]]
    assert M.merge_sets([(2, 1, True), (0, 3, True), (1, 3, None)]) == [[0, 3], [1, 2]]
    assert M.merge_sets([(0, 1, False), (1, 2, None)]) == []


def test_merge_sets_never_joins_topics_judged_different():
    # 2026-10-14: Argon launch (0) = vague "Google just dropped…" video (1) = Argon for Robotics (2),
    # but launch ≠ Robotics: the video joins the more similar pair, Robotics stays out
    pairs = [(0, 1, True), (0, 2, False), (1, 2, True), (0, 3, True)]
    assert M.merge_sets(pairs) == [[0, 1, 3]]
    # a later "same" can still bring Robotics together with a topic it doesn't conflict with
    assert M.merge_sets(pairs + [(2, 4, True)]) == [[0, 1, 3], [2, 4]]


def test_judge_pairs_maps_answers_and_ignores_junk():
    def create(**kw):
        content = json.dumps({"pairs": [{"id": 0, "same": True}, {"id": 1, "same": "yes"}, {"id": 7, "same": True}, "x"]})
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))], usage=None)

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    verdicts, p, c = M.judge_pairs(client, [(["a"], ["b"]), (["c"], ["d"]), (["e"], ["f"])])
    assert verdicts == [True, None, None] and (p, c) == (0, 0)


# ---------------------------------------------------------------------------
# The stage (DB)
# ---------------------------------------------------------------------------

def item(external_id, title, *, hours, kind="hn_story", points=10):
    return SignalItem(
        source_kind=kind,
        external_id=external_id,
        url=f"https://example.test/{external_id}",
        title=title,
        published_at=NOW - timedelta(hours=hours),
        points=points,
        num_comments=2,
    )


def seed(db):
    from sqlalchemy import delete

    from app.models.signal import Signal, SignalTopic
    from app.signals.store import upsert_signals
    from app.signals.topics import build_topics

    db.execute(delete(SignalTopic))
    db.execute(delete(Signal))
    items = [item(f"a{i}", t, hours=6 + i, points=100) for i, t in enumerate(BUGGING_A)]
    items += [item(f"b{i}", t, hours=8 + i, kind="gnews_item", points=None) for i, t in enumerate(BUGGING_B)]
    items += [item(f"o{i}", t, hours=10 + i) for i, t in enumerate(OTHER)]
    upsert_signals(db, items, now=NOW)
    build_topics(db, now=NOW, relevance_fn=lambda title: 50.0)


def test_run_merge_joins_the_same_story_and_rescores(db):
    from sqlalchemy import func, select

    from app.models.signal import Signal, SignalTopic

    seed(db)
    assert db.execute(select(func.count()).select_from(SignalTopic)).scalar_one() == 3
    a = db.execute(select(SignalTopic).where(SignalTopic.label.like("OpenAI engineer%"))).scalar_one()
    b = db.execute(select(SignalTopic).where(SignalTopic.label.like("Saudi%"))).scalar_one()
    # The smaller topic had a description; the bigger one didn't
    story = uuid.uuid4()
    b.summary_en, b.covered_cluster_id, b.described_signal_count, b.described_at = "Bugging.", story, 3, NOW
    db.flush()
    keep_id, old_score = a.id, a.score

    fake = FakeOpenAI(same=lambda x, y: about_bugging(x) and about_bugging(y))
    summary = M.run_merge(db, fake, now=NOW, window_days=14, active_families=2, relevance_fn=lambda t: 50.0)
    assert (summary["pairs"], summary["same"], summary["merged_away"]) == (1, 1, 1)
    assert summary["cost_usd"] > 0

    topics = db.execute(select(SignalTopic)).scalars().all()
    assert len(topics) == 2
    merged = db.get(SignalTopic, keep_id)
    assert merged.signal_count == 6 and merged.source_counts == {"hn": 3, "news": 3}
    assert merged.score > old_score  # more posts, two platforms
    assert (merged.summary_en, merged.covered_cluster_id) == ("Bugging.", story)
    members = db.execute(select(func.count()).select_from(Signal).where(Signal.topic_id == keep_id)).scalar_one()
    assert members == 6


def test_run_merge_judges_topics_matched_to_the_same_sipply_story(db):
    from sqlalchemy import func, select

    from app.models.signal import Signal, SignalTopic

    seed(db)
    a = db.execute(select(SignalTopic).where(SignalTopic.label.like("OpenAI engineer%"))).scalar_one()
    other = db.execute(select(SignalTopic).where(SignalTopic.label.like("Ecosia%"))).scalar_one()
    # The describe stage matched both to one Sipply story, though their titles share nothing
    story = uuid.uuid4()
    a.covered_cluster_id = other.covered_cluster_id = story
    db.flush()
    keep_id, other_id = a.id, other.id

    fake = FakeOpenAI(same=lambda x, y: any("Ecosia" in t for t in x + y))
    summary = M.run_merge(db, fake, now=NOW, window_days=14, active_families=2, relevance_fn=lambda t: 50.0)
    assert summary["covered_pairs"] == 1
    assert summary["pairs"] == 2  # the similar bugging pair, plus the forced one
    assert (summary["same"], summary["merged_away"]) == (1, 1)
    assert db.get(SignalTopic, other_id) is None
    assert db.get(SignalTopic, keep_id).signal_count == 5
    assert db.execute(select(func.count()).select_from(Signal).where(Signal.topic_id == keep_id)).scalar_one() == 5


def test_run_merge_leaves_topics_alone_when_gpt_says_different_or_fails(db):
    from sqlalchemy import func, select

    from app.models.signal import SignalTopic

    seed(db)
    summary = M.run_merge(db, FakeOpenAI(), now=NOW, window_days=14, active_families=2, relevance_fn=lambda t: 50.0)
    assert (summary["same"], summary["merged_away"]) == (0, 0)

    def boom(**kw):
        raise RuntimeError("401 invalid_api_key")

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=boom)))
    summary = M.run_merge(db, client, now=NOW, window_days=14, active_families=2, relevance_fn=lambda t: 50.0)
    assert summary["failed"] is True
    assert db.execute(select(func.count()).select_from(SignalTopic)).scalar_one() == 3
