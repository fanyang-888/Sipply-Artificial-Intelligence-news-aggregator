"""Article scoring service.

Computes a 0–100 ``signal_score`` for each article based on:

    Raw Score (1–5) =
        0.22 × source_credibility
      + 0.12 × recency
      + 0.16 × audience_fit          (default 3, LLM-assisted in future)
      + 0.16 × practical_relevance   (default 3, LLM-assisted in future)
      + 0.12 × novelty               (default 3, LLM-assisted in future)
      + 0.10 × cross_source_confirmation  (default 3, updated after clustering)
      + 0.08 × content_richness
      + 0.04 × engagement_signal     (default 3, unavailable in v1)

    High-Signal Score (0–100) = 20 × Raw Score

Rule-based dimensions (no LLM needed):
  - source_credibility  — slug lookup table
  - recency             — published_at age in days
  - content_richness    — word count + textual signals (numbers, benchmarks)

Dimensions with defaults (LLM / clustering will replace later):
  - audience_fit, practical_relevance, novelty → 3
  - cross_source_confirmation → 1 (conservative; updated after clustering)
  - engagement_signal → 3
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.crud.article import get_unscored_articles, mark_article_scored
from app.models.article import Article
from app.models.source import Source
from app.services.ml_scorer import get_ml_scorer

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Source credibility priors (slug → 1–5 scale)
# Keys must match ``slug`` in source_catalog/trusted_sources.yaml exactly — a
# mismatch silently falls back to the 3.0 default (tests/test_scoring.py checks).
# ---------------------------------------------------------------------------
_SOURCE_CREDIBILITY: dict[str, float] = {
    # Tier 5.0 — official AI labs / benchmarking bodies
    "openai-news": 5.0,
    "anthropic-newsroom": 5.0,
    "deepmind-blog": 5.0,
    "meta-ai-blog": 5.0,
    "huggingface-blog": 5.0,
    "nvidia": 5.0,  # not in the catalog yet
    "artificial-analysis": 5.0,  # not in the catalog yet
    "epoch-ai": 5.0,  # not in the catalog yet
    # Tier 4.5 — premium curated newsletters
    "the-batch": 4.5,  # not in the catalog yet
    "import-ai": 4.5,
    # Tier 4.0 — curated newsletters
    "tldr-ai": 4.0,
    "the-rundown-ai": 4.0,  # not in the catalog yet
    # Tier 3.5 — reputable tech press
    "techcrunch-ai": 3.5,
    "venturebeat-ai": 3.5,
}
_DEFAULT_CREDIBILITY = 3.0

# ---------------------------------------------------------------------------
# Scoring weights (must sum to 1.0)
# ---------------------------------------------------------------------------
_WEIGHTS: dict[str, float] = {
    "source_credibility": 0.22,
    "recency": 0.12,
    "audience_fit": 0.16,
    "practical_relevance": 0.16,
    "novelty": 0.12,
    "cross_source_confirmation": 0.10,
    "content_richness": 0.08,
    "engagement_signal": 0.04,
}

# Regex patterns for content richness signals
_RE_PERCENTAGE = re.compile(r"\d+\.?\d*\s*%")
_RE_BENCHMARK = re.compile(
    r"\b(benchmark|mmlu|humaneval|gsm8k|accuracy|f1|bleu|rouge|"
    r"latency|token|throughput|parameter|billion|trillion)\b",
    re.IGNORECASE,
)
_RE_PRICE = re.compile(r"\$[\d,]+|\bprice\b|\bcost\b|\bpricing\b", re.IGNORECASE)
_RE_SPECIFICS = re.compile(r"\b(figure|table|chart|shows that|demonstrates|according to)\b", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Per-dimension scorers
# ---------------------------------------------------------------------------

def _score_source_credibility(source: Source | None) -> float:
    if source is None:
        return _DEFAULT_CREDIBILITY
    slug = (source.slug or "").lower().strip()
    return _SOURCE_CREDIBILITY.get(slug, _DEFAULT_CREDIBILITY)


def _score_recency(published_at: datetime | None) -> float:
    if published_at is None:
        return 2.0  # unknown date → below average
    now = datetime.now(timezone.utc)
    # Ensure timezone-aware comparison
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    age_days = (now - published_at).total_seconds() / 86400
    if age_days <= 1:
        return 5.0
    if age_days <= 3:
        return 4.0
    if age_days <= 7:
        return 3.0
    if age_days <= 14:
        return 2.0
    return 1.0


def _score_content_richness(article: Article) -> float:
    wc = article.word_count or 0
    text = (article.cleaned_text or article.excerpt or "").lower()

    # Base from word count
    if wc >= 800:
        base = 4.0
    elif wc >= 400:
        base = 3.0
    elif wc >= 150:
        base = 2.0
    else:
        base = 1.0

    # Signal bonuses (capped at 1.0 total)
    bonus = 0.0
    if _RE_PERCENTAGE.search(text):
        bonus += 0.3
    if _RE_BENCHMARK.search(text):
        bonus += 0.3
    if _RE_PRICE.search(text):
        bonus += 0.2
    if _RE_SPECIFICS.search(text):
        bonus += 0.2

    return min(5.0, base + min(1.0, bonus))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_score(article: Article) -> dict[str, Any]:
    """Return score dict with ``signal_score`` (0–100) and ``score_components``.

    Does NOT write to the database — call :func:`apply_score` to persist.
    """
    source: Source | None = article.source if hasattr(article, "source") else None

    # ML-predicted dimensions (falls back to 3.0 if model not loaded)
    ml_scores = {"audience_fit": 3.0, "practical_relevance": 3.0, "novelty": 3.0}
    scorer = get_ml_scorer()
    if scorer:
        title = article.title or ""
        text = article.excerpt or article.cleaned_text or ""
        ml_scores = scorer.predict(title, text)

    components: dict[str, float] = {
        "source_credibility": _score_source_credibility(source),
        "recency": _score_recency(article.published_at),
        "audience_fit": ml_scores["audience_fit"],
        "practical_relevance": ml_scores["practical_relevance"],
        "novelty": ml_scores["novelty"],
        "cross_source_confirmation": 1.0,  # Conservative default; updated after clustering
        "content_richness": _score_content_richness(article),
        "engagement_signal": 3.0,        # Unavailable in v1
    }

    raw_score = sum(_WEIGHTS[dim] * val for dim, val in components.items())
    signal_score = round(min(100.0, max(0.0, 20.0 * raw_score)), 2)

    return {
        "signal_score": signal_score,
        "score_components": {
            "dimensions": components,
            "weights": _WEIGHTS,
            "raw_score": round(raw_score, 4),
        },
    }


def apply_score(db: Session, article: Article) -> float:
    """Compute and persist score for a single article. Returns ``signal_score``."""
    result = compute_score(article)
    mark_article_scored(
        db,
        article_id=article.id,
        signal_score=result["signal_score"],
        score_components=result["score_components"],
    )
    return result["signal_score"]


def score_unscored_articles(db: Session, batch_size: int = 500) -> dict[str, int]:
    """Score all articles that have ``signal_score IS NULL``.

    Returns a summary dict: ``{"processed": N, "skipped": M}``.
    """
    articles = get_unscored_articles(db, limit=batch_size)
    processed = 0
    skipped = 0

    for article in articles:
        try:
            score = apply_score(db, article)
            logger.info("scored article id=%s score=%.1f", article.id, score)
            processed += 1
        except Exception:
            logger.exception("failed to score article id=%s", article.id)
            skipped += 1

    if processed:
        db.commit()
        logger.info("scoring batch done: processed=%d skipped=%d", processed, skipped)

    return {"processed": processed, "skipped": skipped}
