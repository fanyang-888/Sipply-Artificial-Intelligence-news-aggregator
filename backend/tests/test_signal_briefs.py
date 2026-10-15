"""Content briefs for radar topics Sipply hasn't covered: validation, selection, the DB stage."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.signals import briefs as B
from app.signals.base import SignalItem

NOW = datetime(2026, 10, 15, 14, 0, tzinfo=timezone.utc)
POSTS = [
    {"title": "Anthropic bans abusive behavior towards Claude", "url": "https://example.test/a", "platform": "hn"},
    {"title": "Anthropic lets Claude end abusive chats", "url": "https://example.test/b", "platform": "news"},
]


def row(**over):
    base = {
        "headline_en": "Anthropic lets Claude end abusive conversations",
        "headline_zh": "Anthropic 允许 Claude 结束辱骂性对话",
        "angle_en": "What changes for apps built on Claude.",
        "angle_zh": "基于 Claude 的应用会受什么影响。",
        "questions": [{"en": "Can Claude end a conversation?", "zh": "Claude 能结束对话吗？"}],
        "facts": [
            {"en": "Anthropic banned abusive behavior towards Claude.", "zh": "Anthropic 禁止辱骂 Claude。", "post": 1},
            {"en": "Claude can now end abusive chats.", "zh": "Claude 现在可以结束辱骂性对话。", "post": 2},
        ],
    }
    return {**base, **over}


# ── parse_brief ──────────────────────────────────────────────────────────────


def test_a_fact_must_come_from_one_of_the_posts():
    facts = row()["facts"] + [
        {"en": "Made-up number: 40% of users.", "zh": "编的", "post": 9},  # no post 9
        {"en": "No post given.", "zh": "没有出处"},
        {"en": "Boolean is not a post number.", "zh": "布尔", "post": True},
    ]
    brief = B.parse_brief(row(facts=facts), POSTS)
    assert [f["en"] for f in brief["facts"]] == [
        "Anthropic banned abusive behavior towards Claude.",
        "Claude can now end abusive chats.",
    ]
    assert brief["facts"][1]["source"] == POSTS[1]
    assert brief["sources"] == POSTS  # the posts the facts cite, once each, in order


def test_too_few_grounded_facts_or_no_headline_means_no_brief():
    assert B.parse_brief(row(facts=row()["facts"][:1]), POSTS) is None
    assert B.parse_brief(row(headline_en="  "), POSTS) is None


def test_missing_chinese_falls_back_to_english_and_lists_are_capped():
    facts = [{"en": f"Fact {i}.", "post": 1} for i in range(8)]
    questions = [{"en": f"Q{i}?"} for i in range(5)] + ["not a dict"]
    brief = B.parse_brief(row(headline_zh=None, facts=facts, questions=questions), POSTS)
    assert brief["headlineZh"] == brief["headlineEn"]
    assert len(brief["facts"]) == B.MAX_FACTS and brief["facts"][0]["zh"] == "Fact 0."
    assert [q["en"] for q in brief["questions"]] == ["Q0?", "Q1?", "Q2?"]
    assert brief["sources"] == POSTS[:1]


# ── needs_brief ──────────────────────────────────────────────────────────────


def topic(**over):
    base = dict(
        signal_count=8, source_counts={"hn": 5, "news": 3}, described_at=NOW, covered_cluster_id=None,
        brief=None, brief_signal_count=None,
    )
    return SimpleNamespace(**{**base, **over})


def test_only_described_gaps_in_the_inner_rings_get_a_brief():
    assert B.needs_brief(topic())
    assert not B.needs_brief(topic(covered_cluster_id=uuid.uuid4()))  # Sipply has a story
    assert not B.needs_brief(topic(described_at=None))  # coverage not checked yet
    assert not B.needs_brief(topic(signal_count=2, source_counts={"youtube": 2}))  # weak signal


def test_a_briefed_topic_is_briefed_again_only_once_it_grows():
    assert not B.needs_brief(topic(brief={"headlineEn": "x"}, brief_signal_count=8, signal_count=11))
    assert B.needs_brief(topic(brief={"headlineEn": "x"}, brief_signal_count=8, signal_count=12))


# ── the DB stage ─────────────────────────────────────────────────────────────


class FakeOpenAI:
    """Answers every topic with the facts above (plus one citing a post that doesn't exist)."""

    def __init__(self):
        self.calls: list[list[dict]] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        items = json.loads(kw["messages"][1]["content"])
        self.calls.append(items)
        rows = []
        for it in items:
            facts = [{"en": p["title"] + ".", "zh": "中文 " + p["title"], "post": p["n"]} for p in it["posts"][:2]]
            facts.append({"en": "Invented.", "zh": "编的", "post": 99})
            rows.append(row(id=it["id"], headline_en="Brief: " + it["posts"][0]["title"], facts=facts))
        message = SimpleNamespace(content=json.dumps({"topics": rows}, ensure_ascii=False))
        return SimpleNamespace(
            choices=[SimpleNamespace(message=message)],
            usage=SimpleNamespace(prompt_tokens=2000, completion_tokens=600),
        )


def item(external_id, title, *, hours=12.0, kind="hn_story", points=10, text=None):
    return SignalItem(
        source_kind=kind,
        external_id=external_id,
        url=f"https://example.test/{external_id}",
        title=title,
        published_at=NOW - timedelta(hours=hours),
        points=points,
        num_comments=2,
        text=text,
    )


def test_run_briefs_writes_briefs_for_gaps_only(db):
    from sqlalchemy import delete, select

    from app.models.signal import Signal, SignalTopic
    from app.signals.store import upsert_signals
    from app.signals.topics import build_topics

    db.execute(delete(SignalTopic))
    db.execute(delete(Signal))
    items = [item(f"m{i}", f"Meta launches Muse Wonder AI model to rival OpenAI, part {i}", hours=6 + i) for i in range(16)]
    items += [
        item("h1", "Anthropic bans abusive behavior towards Claude", hours=20, text="Claude can now end chats."),
        item("h2", "Anthropic bans abusive behavior towards Claude models", hours=22, kind="gnews_item", points=None),
        item("h3", "Anthropic bans abusive behavior towards Claude, users react", hours=24, kind="gnews_item", points=None),
    ]
    upsert_signals(db, items, now=NOW)
    build_topics(db, now=NOW, relevance_fn=lambda title: 50.0)
    topics = {t.label[:4]: t for t in db.execute(select(SignalTopic)).scalars()}
    meta, anthropic = topics["Meta"], topics["Anth"]
    for t in (meta, anthropic):  # as describe_signal_topics would leave them
        t.described_at = NOW
        t.summary_en = f"Summary of {t.label}"
    meta.covered_cluster_id = uuid.uuid4()  # Sipply covered Meta; Anthropic is the gap
    db.flush()

    fake = FakeOpenAI()
    summary = B.run_briefs(db, fake, now=NOW)
    assert (summary["pending"], summary["briefed"], summary["failed"]) == (1, 1, 0) and summary["cost_usd"] > 0
    sent = fake.calls[0][0]
    assert sent["summary"].startswith("Summary of Anthropic")
    assert sent["posts"][0]["text"] == "Claude can now end chats."  # the post body goes along
    assert {p["platform"] for p in sent["posts"]} == {"hn", "news"}

    db.refresh(anthropic)
    brief = anthropic.brief
    assert brief["headlineEn"].startswith("Brief: Anthropic bans")
    assert len(brief["facts"]) == 2  # the invented fact (post 99) is dropped
    assert all(f["source"]["url"].startswith("https://example.test/h") for f in brief["facts"])
    assert brief["writtenAt"] == NOW.isoformat() and anthropic.brief_signal_count == anthropic.signal_count
    assert meta.brief is None

    # Nothing grew: the next run has nothing to do
    assert B.run_briefs(db, FakeOpenAI(), now=NOW)["pending"] == 0


def test_run_briefs_stops_at_the_first_api_error(db, monkeypatch):
    monkeypatch.setattr(B, "topics_to_brief", lambda db: [SimpleNamespace(id=1, summary_en="s", label="l", question_en=None)])
    monkeypatch.setattr(B, "topic_posts", lambda db, topics: {1: [dict(POSTS[0], text="")]})

    def boom(**kw):
        raise RuntimeError("429 insufficient_quota")

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=boom)))
    summary = B.run_briefs(db, client, now=NOW)
    assert summary["briefed"] == 0 and summary["failed"] == 1
