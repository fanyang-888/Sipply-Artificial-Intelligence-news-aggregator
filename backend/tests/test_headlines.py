"""Story URLs (/story/<slug>) and Sipply's own headlines."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.services.headlines import make_slug, story_title, story_title_zh, valid_headline

ID = uuid.UUID("ac94574a-93c6-4a1e-9593-a6e17e04b56e")


@pytest.mark.parametrize(
    ("title", "slug"),
    [
        ("Replit is no longer working with Anthropic, CEO says | TechCrunch", "replit-is-no-longer-working-with-anthropic-ceo-says-ac94574a"),
        ("Google’s Gemini 4 Argon: 1M-token output, $2/M input", "googles-gemini-4-argon-1m-token-output-2-m-input-ac94574a"),
        ("Café über AI", "cafe-uber-ai-ac94574a"),
        ("Anthropic、Gamma 和 Clay 在 Disrupt 2026 上讨论 AI", "anthropic-gamma-clay-disrupt-2026-ai-ac94574a"),
        ("", "story-ac94574a"),
        ("！？", "story-ac94574a"),
    ],
)
def test_slug_is_the_titles_words_and_the_ids_first_eight_hex(title, slug):
    assert make_slug(title, ID) == slug


def test_slug_stops_at_a_word_boundary_within_sixty_characters():
    slug = make_slug("Confidence-Calibrated Inference Expansion for Evaluator-Guided Test-Time Reasoning in Large Models", ID)
    base = slug.removesuffix("-ac94574a")
    assert len(base) <= 60 and not base.endswith("-")
    assert base == "confidence-calibrated-inference-expansion-for-evaluator"


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        ("Replit drops Anthropic for OpenAI, citing cost", "Replit drops Anthropic for OpenAI, citing cost"),
        ('"Replit drops Anthropic for OpenAI."', "Replit drops Anthropic for OpenAI"),
        ("Replit drops Anthropic | TechCrunch", "Replit drops Anthropic"),
        ("  ", None),
        (None, None),
        ("x" * 121, None),  # too long to be a headline
    ],
)
def test_valid_headline(raw, clean):
    assert valid_headline(raw) == clean


def test_story_title_prefers_sipplys_headline():
    story = SimpleNamespace(
        headline="Replit drops Anthropic for OpenAI, citing cost",
        headline_zh="Replit 以成本为由弃用 Anthropic，改用 OpenAI",
        representative_title="Replit is no longer working with Anthropic, CEO says | TechCrunch",
        representative_title_zh="Replit 不再与 Anthropic 合作 | TechCrunch",
    )
    assert story_title(story) == "Replit drops Anthropic for OpenAI, citing cost"
    assert story_title_zh(story) == "Replit 以成本为由弃用 Anthropic，改用 OpenAI"
    story.headline = story.headline_zh = None
    assert story_title(story) == "Replit is no longer working with Anthropic, CEO says"
    assert story_title_zh(story) == "Replit 不再与 Anthropic 合作"
    story.representative_title_zh = None
    assert story_title_zh(story) is None


def test_a_summary_brings_sipplys_headline():
    from app.services.summarization import _CLUSTER_SYSTEM, _apply_cluster_summary

    assert '"headline"' in _CLUSTER_SYSTEM
    story = SimpleNamespace()
    _apply_cluster_summary(story, {"summary": "s", "headline": '"Replit drops Anthropic for OpenAI, citing cost."'})
    assert story.headline == "Replit drops Anthropic for OpenAI, citing cost"
    _apply_cluster_summary(story, {"summary": "s"})
    assert story.headline is None  # the source title is shown instead


def test_summarized_stories_get_a_permanent_slug(db, make_cluster):
    from datetime import datetime, timezone

    from app.services.headlines import assign_missing_slugs

    now = datetime.now(timezone.utc)
    summarized = make_cluster(title="Replit is no longer working with Anthropic | TechCrunch", summarized_at=now)
    with_headline = make_cluster(title="Some source title", summarized_at=now, headline="Replit drops Anthropic for OpenAI")
    kept = make_cluster(title="Anything", summarized_at=now, slug="an-older-slug-12345678")
    pending = make_cluster(title="Not summarized yet", summarized_at=None)

    assert assign_missing_slugs(db) == 2
    assert summarized.slug == f"replit-is-no-longer-working-with-anthropic-{summarized.id.hex[:8]}"
    assert with_headline.slug == f"replit-drops-anthropic-for-openai-{with_headline.id.hex[:8]}"
    assert kept.slug == "an-older-slug-12345678"
    assert pending.slug is None
    assert assign_missing_slugs(db) == 0  # once only


class FakeHeadlines:
    """Stands in for openai.OpenAI: a headline per story, except ids listed in ``bad``."""

    def __init__(self, bad=()):
        import json

        self.json = json
        self.bad = set(bad)
        self.calls = 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        self.calls += 1
        sent = self.json.loads(kw["messages"][1]["content"])
        rows = [
            {"id": s["id"], "headline": "" if s["id"] in self.bad else f"Sipply: {s['title'][:30]}", "headline_zh": f"中文：{s['title'][:10]}"}
            for s in sent
        ]
        content = self.json.dumps({"stories": rows}, ensure_ascii=False)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))], usage=None)


def test_backfill_writes_headlines_for_recent_stories_only(db, make_cluster):
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import update

    from app.models.cluster import Cluster
    from app.services.headlines import backfill_headlines

    db.execute(update(Cluster).values(headline="existing"))  # other rows in the test DB are not ours
    now = datetime.now(timezone.utc)
    recent = make_cluster(title="Gemini 4 Argon ships", summarized_at=now, first_seen_at=now - timedelta(days=1), slug="gemini-4-argon-ships-11111111")
    bad = make_cluster(title="A paper", summarized_at=now, first_seen_at=now - timedelta(days=2))
    old = make_cluster(title="Last spring", summarized_at=now, first_seen_at=now - timedelta(days=90))
    done = make_cluster(title="Has one", summarized_at=now, first_seen_at=now, headline="Already Sipply's")

    client = FakeHeadlines(bad={1})
    result = backfill_headlines(db, client, now=now, limit=10)

    assert result["written"] == 1 and result["unusable"] == 1
    assert recent.headline == "Sipply: Gemini 4 Argon ships" and recent.headline_zh == "中文：Gemini 4 A"
    assert recent.slug == "gemini-4-argon-ships-11111111"  # the URL does not move
    assert bad.headline is None and bad.meta.get("headline_tried") is True
    assert old.headline is None and done.headline == "Already Sipply's"
    # Nothing left to try: no second call
    assert backfill_headlines(db, client, now=now, limit=10)["written"] == 0 and client.calls == 1


def test_a_translation_carries_the_headline():
    import importlib

    tr = importlib.import_module("scripts.translate_clusters")
    assert '"headline_zh"' in tr._SYSTEM
    story = SimpleNamespace(headline="Replit drops Anthropic for OpenAI")
    tr.apply_translation(story, {"title_zh": "Replit 不再与 Anthropic 合作", "headline_zh": "Replit 弃用 Anthropic，改用 OpenAI。"})
    assert story.representative_title_zh == "Replit 不再与 Anthropic 合作"
    assert story.headline_zh == "Replit 弃用 Anthropic，改用 OpenAI"
    no_headline = SimpleNamespace(headline=None)
    tr.apply_translation(no_headline, {"title_zh": "标题", "headline_zh": "不该有"})
    assert no_headline.headline_zh is None
