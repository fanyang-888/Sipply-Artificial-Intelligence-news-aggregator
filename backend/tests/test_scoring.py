"""Article signal scoring (app.services.scoring)."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.services import scoring
from app.services.scoring import (
    _DEFAULT_CREDIBILITY,
    _WEIGHTS,
    _score_content_richness,
    _score_recency,
    _score_source_credibility,
    compute_score,
)


def hours_ago(h: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=h)


def test_weights_sum_to_one():
    assert sum(_WEIGHTS.values()) == pytest.approx(1.0)


@pytest.mark.parametrize(
    ("age_hours", "expected"),
    [(12, 5.0), (48, 4.0), (5 * 24, 3.0), (10 * 24, 2.0), (30 * 24, 1.0)],
)
def test_recency_buckets(age_hours, expected):
    assert _score_recency(hours_ago(age_hours)) == expected


def test_recency_unknown_date_is_below_average():
    assert _score_recency(None) == 2.0


def test_recency_accepts_naive_datetimes_as_utc():
    naive = (datetime.now(timezone.utc) - timedelta(hours=2)).replace(tzinfo=None)
    assert _score_recency(naive) == 5.0


def _catalog():
    import yaml

    from app.source_catalog.loader import _DEFAULT_FILE

    return yaml.safe_load(_DEFAULT_FILE.read_text(encoding="utf-8"))["sources"]


def test_every_official_lab_in_the_catalog_gets_top_credibility():
    # Regression: DeepMind, Hugging Face and Meta AI were keyed by slugs the
    # catalog doesn't use, so they silently scored the 3.0 default
    labs = {row["slug"] for row in _catalog() if row["type"] == "company_news"}
    assert {"deepmind-blog", "huggingface-blog", "meta-ai-blog"} <= labs
    for slug in labs:
        assert _score_source_credibility(SimpleNamespace(slug=slug)) == 5.0, slug


def test_credibility_keys_are_catalog_slugs_or_known_future_sources():
    from app.services.scoring import _SOURCE_CREDIBILITY

    catalog = {row["slug"] for row in _catalog()}
    not_yet_added = {"nvidia", "artificial-analysis", "epoch-ai", "the-batch", "the-rundown-ai"}
    # A key outside both sets is a typo that never matches any source
    assert set(_SOURCE_CREDIBILITY) - catalog == not_yet_added


def test_source_credibility_known_and_unknown():
    assert _score_source_credibility(SimpleNamespace(slug="openai-news")) == 5.0
    assert _score_source_credibility(SimpleNamespace(slug="  TechCrunch-AI ")) == 3.5
    assert _score_source_credibility(SimpleNamespace(slug="some-random-blog")) == _DEFAULT_CREDIBILITY
    assert _score_source_credibility(None) == _DEFAULT_CREDIBILITY


@pytest.mark.parametrize(
    ("word_count", "expected"),
    [(900, 4.0), (500, 3.0), (200, 2.0), (50, 1.0)],
)
def test_content_richness_word_count_base(word_count, expected):
    plain = SimpleNamespace(word_count=word_count, cleaned_text="plain prose", excerpt=None)
    assert _score_content_richness(plain) == expected


def test_content_richness_bonus_is_capped_at_one():
    text = "It scored 85% on the MMLU benchmark, costs $20, according to the table."
    rich = SimpleNamespace(word_count=900, cleaned_text=text, excerpt=None)
    # base 4.0 + bonuses (0.3 + 0.3 + 0.2 + 0.2 = 1.0, capped) = 5.0
    assert _score_content_richness(rich) == 5.0


def test_compute_score_is_deterministic_without_ml_model(monkeypatch):
    monkeypatch.setattr(scoring, "get_ml_scorer", lambda: None)
    article = SimpleNamespace(
        source=SimpleNamespace(slug="openai-news"),
        published_at=hours_ago(2),
        word_count=900,
        cleaned_text="It scored 85% on the MMLU benchmark, costs $20, according to the table.",
        excerpt=None,
        title="GPT update",
    )
    result = compute_score(article)
    # 20 × (.22·5 + .12·5 + .16·3 + .16·3 + .12·3 + .10·1 + .08·5 + .04·3) = 20 × 3.64
    assert result["signal_score"] == pytest.approx(72.8)
    assert result["score_components"]["weights"] == _WEIGHTS


def test_compute_score_uses_ml_predictions_when_available(monkeypatch):
    class FakeScorer:
        def predict(self, title, text):
            return {"audience_fit": 5.0, "practical_relevance": 5.0, "novelty": 5.0}

    monkeypatch.setattr(scoring, "get_ml_scorer", lambda: FakeScorer())
    article = SimpleNamespace(
        source=None, published_at=None, word_count=50, cleaned_text="", excerpt=None, title="x"
    )
    dims = compute_score(article)["score_components"]["dimensions"]
    assert dims["audience_fit"] == dims["practical_relevance"] == dims["novelty"] == 5.0
    assert 0.0 <= compute_score(article)["signal_score"] <= 100.0
