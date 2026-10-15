"""Trend Radar topic descriptions: candidate stories, the GPT batch, and the DB stage."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.signals import describe as D
from app.signals.base import SignalItem

NOW = datetime(2026, 10, 13, 14, 0, tzinfo=timezone.utc)


class FakeOpenAI:
    """Stands in for openai.OpenAI. ``pick(posts, stories)`` returns the story id to answer with."""

    def __init__(self, pick=lambda posts, stories: None, drop_ids=()):
        self.calls: list[list[dict]] = []
        self.pick = pick
        self.drop_ids = set(drop_ids)
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        sent = json.loads(kw["messages"][1]["content"])
        self.calls.append(sent)
        rows = [
            {
                "id": t["id"],
                "summary_en": f"EN {t['posts'][0]}",
                "summary_zh": f"中文 {t['posts'][0]}",
                "story": self.pick(t["posts"], t["stories"]),
                "question": f"What happened with {t['posts'][0]}?",
            }
            for t in sent
            if t["id"] not in self.drop_ids
        ]
        message = SimpleNamespace(content=json.dumps({"topics": rows}, ensure_ascii=False))
        return SimpleNamespace(
            choices=[SimpleNamespace(message=message)],
            usage=SimpleNamespace(prompt_tokens=1000, completion_tokens=300),
        )


def first_story_containing(word):
    def pick(posts, stories):
        return next((s["id"] for s in stories if word.lower() in s["title"].lower()), None)

    return pick


# ---------------------------------------------------------------------------
# Candidates (pure)
# ---------------------------------------------------------------------------

def test_candidate_stories_finds_the_same_event_in_other_words():
    # Real titles from 2026-10-13: the radar topic and Sipply's story share few title words
    topics = [
        "Anthropic asks users to stop being mean to Claude Anthropic wants people to stop being mean to Claude",
        "NTT to build $6.3bn data center for Anthropic in Japan",
    ]
    stories = [
        "Anthropic is giving startups a free year of Claude Team and $1,000 in credits",
        "Anthropic changes usage policy to ban model abuse and election interference "
        "Anthropic updated its usage policy to prohibit abusive or cruel behavior toward Claude and people being mean",
        "Amazon drops data center NDAs, and AI agents want your credit card",
        "Google froze its open source bug bounty program",
    ]
    out = D.candidate_stories(topics, stories, k=2)
    assert out[0][0] == 1
    # Candidates only narrow the field (GPT makes the call); the closest still comes first
    assert out[1][0] == 2 and len(out[1]) <= 2


def test_candidate_stories_edge_cases():
    assert D.candidate_stories(["a topic"], []) == [[]]
    assert D.candidate_stories([], ["a story"]) == []
    assert D.candidate_stories(["the and of"], ["is the"]) == [[]]  # nothing but stop words


# ---------------------------------------------------------------------------
# One request (pure, fake client)
# ---------------------------------------------------------------------------

def test_describe_batch_maps_answers_and_only_accepts_own_candidates():
    a, b = uuid.uuid4(), uuid.uuid4()
    items = [
        {"posts": ["Gemini 4 Argon"], "stories": [(a, "Google releases Gemini 4 Argon", "Google launched its new model.")]},
        {"posts": ["Mistral Large 4"], "stories": [(b, "Mistral's new 1T model", "Mistral released a 1T model.")]},
        {"posts": ["Dropped one"], "stories": []},
        {"posts": ["No candidates"], "stories": []},
    ]

    def pick(posts, stories):
        if posts[0] == "Mistral Large 4":
            return "s7"  # not one of its candidates
        if posts[0] == "No candidates":
            return "s0"  # it had none
        return stories[0]["id"] if stories else None

    fake = FakeOpenAI(pick=pick, drop_ids={2})
    results, p, c = D.describe_batch(fake, items)
    # GPT sees each candidate's opening lines, not just its title
    assert fake.calls[0][0]["stories"] == [{"id": "s0", "title": "Google releases Gemini 4 Argon", "about": "Google launched its new model."}]
    assert results[0] == {
        "summary_en": "EN Gemini 4 Argon",
        "summary_zh": "中文 Gemini 4 Argon",
        "story": a,
        "question": "What happened with Gemini 4 Argon?",
    }
    assert results[1]["story"] is None
    assert results[2] is None  # no answer for it
    assert results[3]["story"] is None
    assert (p, c) == (1000, 300)


def test_describe_batch_ignores_malformed_rows():
    def create(**kw):
        content = json.dumps({"topics": [{"id": 0, "summary_en": "  ", "summary_zh": "x"}, "junk", {"id": 9}]})
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))], usage=None)

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    results, p, c = D.describe_batch(client, [{"posts": ["x"], "stories": []}])
    assert results == [None] and (p, c) == (0, 0)


# ---------------------------------------------------------------------------
# The stage (DB)
# ---------------------------------------------------------------------------

def item(external_id, title, *, hours=12.0, kind="hn_story", points=10):
    return SignalItem(
        source_kind=kind,
        external_id=external_id,
        url=f"https://example.test/{external_id}",
        title=title,
        published_at=NOW - timedelta(hours=hours),
        points=points,
        num_comments=2,
    )


def seed_topics(db):
    """One mainstream topic (16 posts), one cross-platform topic (3 posts), one weak signal (2 posts)."""
    from sqlalchemy import delete

    from app.models.signal import Signal, SignalTopic
    from app.signals.store import upsert_signals
    from app.signals.topics import build_topics

    db.execute(delete(SignalTopic))
    db.execute(delete(Signal))
    items = [item(f"m{i}", f"Meta launches Muse Wonder AI model to rival OpenAI, part {i}", hours=6 + i) for i in range(16)]
    items += [
        item("h1", "Claude Haiku 5.5 released", hours=20),
        item("h2", "Claude Haiku 5.5 released today", hours=22, kind="gnews_item", points=None),
        item("h3", "Claude Haiku 5.5 released on AWS", hours=24, kind="gnews_item", points=None),
        item("y1", "These Claude videos will make you better", hours=30, kind="yt_video", points=None),
        item("y2", "These Claude videos will make you better than 99%", hours=31, kind="yt_video", points=None),
    ]
    upsert_signals(db, items, now=NOW)
    build_topics(db, now=NOW, relevance_fn=lambda title: 50.0)


def test_run_describe_inner_rings_only_and_links_the_story(db, make_cluster):
    from sqlalchemy import select

    from app.models.signal import SignalTopic

    seed_topics(db)
    muse = make_cluster(
        title="Meta releases its first frontier model, Muse Wonder",
        summary="Meta launched Muse Wonder, an AI model it says rivals OpenAI and Anthropic.",
        last_seen_at=NOW - timedelta(hours=10),
    )
    make_cluster(title="Meta Muse ages out", last_seen_at=NOW - timedelta(days=20))

    fake = FakeOpenAI(pick=first_story_containing("Muse Wonder"))
    summary = D.run_describe(db, fake, now=NOW, window_days=14, batch_size=1)
    assert (summary["pending"], summary["described"], summary["covered"], summary["failed"]) == (2, 2, 1, 0)
    assert len(fake.calls) == 2 and summary["cost_usd"] > 0
    # Old stories are not candidates
    sent_titles = [s["title"] for call in fake.calls for t in call for s in t["stories"]]
    sent_about = [s["about"] for call in fake.calls for t in call for s in t["stories"]]
    assert "Meta launched Muse Wonder, an AI model it says rivals OpenAI and Anthropic." in sent_about
    assert "Meta Muse ages out" not in sent_titles

    rows = {t.label[:10]: t for t in db.execute(select(SignalTopic)).scalars()}
    meta, haiku, videos = rows["Meta launc"], rows["Claude Hai"], rows["These Clau"]
    assert meta.covered_cluster_id == muse.id and meta.summary_zh.startswith("中文 ")
    assert meta.described_signal_count == 16 and meta.described_at == NOW
    assert meta.question_en.startswith("What happened with Meta launches Muse Wonder")
    assert haiku.described_at == NOW and haiku.covered_cluster_id is None  # checked: Sipply has no story
    assert videos.described_at is None  # weak signal: not described

    # Next run: the covered topic is left alone, the uncovered one is checked again
    again = FakeOpenAI()
    assert D.run_describe(db, again, now=NOW, window_days=14)["pending"] == 1
    assert [t["posts"][0] for call in again.calls for t in call] == ["Claude Haiku 5.5 released"]


def test_needs_description_after_growth():
    topic = SimpleNamespace(
        described_at=NOW, covered_cluster_id=uuid.uuid4(), question_en="Q?", described_signal_count=10, signal_count=14
    )
    assert not D.needs_description(topic)
    topic.signal_count = 15
    assert D.needs_description(topic)
    # Described before questions existed: describe again once to get one
    topic.signal_count, topic.question_en = 14, None
    assert D.needs_description(topic)


def test_run_describe_stops_at_the_first_api_error(db):
    seed_topics(db)
    calls = []

    def boom(**kw):
        calls.append(kw)
        raise RuntimeError("401 invalid_api_key")

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=boom)))
    summary = D.run_describe(db, client, now=NOW, window_days=14, batch_size=1)
    assert len(calls) == 1
    assert summary["described"] == 0 and summary["failed"] == 2
