"""Clustering service — groups related articles into story clusters.

Algorithm (v1 hybrid rule-based):
  1. Fetch all eligible articles: is_filtered_out != True, cluster_id IS NULL,
     published within the last WINDOW_DAYS days.
  2. Build a text corpus: title + " " + (excerpt or cleaned_text[:400]).
  3. TF-IDF vectorize the corpus.
  4. Compute pairwise cosine similarity.
  5. Union-Find: merge pairs whose similarity >= SIMILARITY_THRESHOLD and whose
     publication dates are within DATE_PROXIMITY_DAYS of each other.
  6. For each group (including singletons):
       - type = "event" if date span <= EVENT_MAX_DAYS else "theme"
       - representative_title = title of highest-scored article
       - cluster_score = computed from article scores + source diversity + recency
       - Insert Cluster row; set article.cluster_id for all members.

Cluster score formula:
  cluster_score = 0.60 × max_article_score
                + 0.15 × source_diversity_score   (0–100, based on unique source count)
                + 0.15 × 50                        (theme consistency placeholder)
                + 0.10 × recency_score             (0–100, based on most recent article)
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crud.cluster import create_cluster, assign_articles_to_cluster
from app.models.article import Article
from app.models.cluster import Cluster

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
WINDOW_DAYS = 7               # only cluster articles published in last N days
SIMILARITY_THRESHOLD = 0.28   # TF-IDF cosine similarity to link two articles
DATE_PROXIMITY_DAYS = 5       # articles > N days apart → cannot share an event cluster
EVENT_MAX_DAYS = 3            # cluster date span <= N days → "event", else "theme"

_ARTICLE_VECTORIZER: dict[str, Any] = {
    "max_features": 8000,
    "ngram_range": (1, 2),
    "stop_words": "english",
    "min_df": 1,
}


# ---------------------------------------------------------------------------
# Union-Find (path compression + rank)
# ---------------------------------------------------------------------------

class _UnionFind:
    def __init__(self, n: int) -> None:
        self._parent = list(range(n))
        self._rank = [0] * n

    def find(self, x: int) -> int:
        while self._parent[x] != x:
            self._parent[x] = self._parent[self._parent[x]]  # path compression
            x = self._parent[x]
        return x

    def union(self, x: int, y: int) -> None:
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return
        if self._rank[rx] < self._rank[ry]:
            rx, ry = ry, rx
        self._parent[ry] = rx
        if self._rank[rx] == self._rank[ry]:
            self._rank[rx] += 1

    def groups(self) -> dict[int, list[int]]:
        from collections import defaultdict
        g: dict[int, list[int]] = defaultdict(list)
        for i in range(len(self._parent)):
            g[self.find(i)].append(i)
        return dict(g)


# ---------------------------------------------------------------------------
# Cluster score
# ---------------------------------------------------------------------------

def _recency_score_100(dt: datetime | None) -> float:
    if dt is None:
        return 40.0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    age_days = (datetime.now(timezone.utc) - dt).total_seconds() / 86400
    if age_days <= 1:
        return 100.0
    if age_days <= 3:
        return 80.0
    if age_days <= 7:
        return 60.0
    if age_days <= 14:
        return 40.0
    return 20.0


def _compute_cluster_score(articles: list[Article]) -> float:
    scores = [a.signal_score for a in articles if a.signal_score is not None]
    max_score = max(scores) if scores else 50.0

    unique_sources = len({a.source_id for a in articles})
    source_diversity = min(unique_sources, 5) / 5.0 * 100.0

    latest = max(
        (a.published_at for a in articles if a.published_at),
        default=None,
    )
    recency = _recency_score_100(latest)

    raw = (
        0.60 * max_score
        + 0.15 * source_diversity
        + 0.15 * 50.0          # theme consistency placeholder
        + 0.10 * recency
    )
    return round(min(100.0, max(0.0, raw)), 2)


# ---------------------------------------------------------------------------
# Main clustering logic
# ---------------------------------------------------------------------------

def _fetch_eligible_articles(db: Session) -> list[Article]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)
    return list(
        db.execute(
            select(Article).where(
                Article.cluster_id.is_(None),
                Article.is_filtered_out.is_not(True),
                Article.published_at >= cutoff,
            )
        ).scalars().all()
    )


def _build_corpus(articles: list[Article]) -> list[str]:
    docs = []
    for a in articles:
        body = (a.excerpt or (a.cleaned_text or "")[:400]).strip()
        docs.append(f"{a.title} {body}")
    return docs


def _within_days(da: datetime | None, db_: datetime | None, days: float) -> bool:
    """True if the two datetimes are at most ``days`` apart; unknown dates always match."""
    if da is None or db_ is None:
        return True  # unknown dates → allow grouping
    if da.tzinfo is None:
        da = da.replace(tzinfo=timezone.utc)
    if db_.tzinfo is None:
        db_ = db_.replace(tzinfo=timezone.utc)
    return abs((da - db_).total_seconds()) <= days * 86400


def _dates_compatible(a: Article, b: Article) -> bool:
    """True if the two articles are within DATE_PROXIMITY_DAYS of each other."""
    return _within_days(a.published_at, b.published_at, DATE_PROXIMITY_DAYS)


# ---------------------------------------------------------------------------
# Text grouping (shared with the Trend Radar signal topics)
# ---------------------------------------------------------------------------

def tfidf_groups(
    texts: list[str],
    dates: list[datetime | None],
    *,
    threshold: float,
    date_proximity_days: float,
    vectorizer_kwargs: dict[str, Any] | None = None,
) -> tuple[list[list[int]], Any, list[str]] | None:
    """Single-link groups of texts by TF-IDF cosine similarity.

    Two texts are linked when their similarity is >= ``threshold`` and their
    dates are within ``date_proximity_days``; links are transitive. Every
    index lands in exactly one group (singletons included), and groups come
    back ordered by their smallest member index.

    Returns ``(groups, tfidf_matrix, feature_names)``, or None when the corpus
    has no usable terms.
    """
    # Import here to avoid top-level sklearn cost at app startup
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    import numpy as np

    n = len(texts)
    if n == 0:
        return None
    vectorizer = TfidfVectorizer(**(vectorizer_kwargs or {}))
    try:
        tfidf_matrix = vectorizer.fit_transform(texts)
    except ValueError:
        return None

    uf = _UnionFind(n)

    # Compute similarity in chunks to avoid huge memory for large n
    chunk = 64
    for start in range(0, n, chunk):
        end = min(start + chunk, n)
        sims = cosine_similarity(tfidf_matrix[start:end], tfidf_matrix)  # (chunk, n)
        rows, cols = np.nonzero(sims >= threshold)
        for i_local, j in zip(rows.tolist(), cols.tolist()):
            i_global = start + i_local
            if j > i_global and _within_days(dates[i_global], dates[j], date_proximity_days):
                uf.union(i_global, j)

    return list(uf.groups().values()), tfidf_matrix, vectorizer.get_feature_names_out().tolist()


def group_texts(
    texts: list[str],
    dates: list[datetime | None],
    *,
    threshold: float,
    date_proximity_days: float,
    vectorizer_kwargs: dict[str, Any] | None = None,
) -> list[list[int]] | None:
    """Index groups from :func:`tfidf_groups`, or None when the corpus is unusable."""
    result = tfidf_groups(
        texts,
        dates,
        threshold=threshold,
        date_proximity_days=date_proximity_days,
        vectorizer_kwargs=vectorizer_kwargs,
    )
    return result[0] if result is not None else None


def run_clustering(db: Session) -> dict[str, int]:
    """Cluster all eligible unclustered articles.

    Returns ``{"articles_processed": N, "clusters_created": M}``.
    """
    articles = _fetch_eligible_articles(db)
    if not articles:
        logger.info("clustering: no eligible articles found")
        return {"articles_processed": 0, "clusters_created": 0}

    logger.info("clustering: %d eligible articles", len(articles))

    groups = group_texts(
        _build_corpus(articles),
        [a.published_at for a in articles],
        threshold=SIMILARITY_THRESHOLD,
        date_proximity_days=DATE_PROXIMITY_DAYS,
        vectorizer_kwargs=_ARTICLE_VECTORIZER,
    )
    if groups is None:
        logger.warning("clustering: TF-IDF failed (empty corpus?)")
        return {"articles_processed": 0, "clusters_created": 0}

    clusters_created = 0

    for indices in groups:
        group_articles = [articles[i] for i in indices]

        # Determine cluster type
        dates = [a.published_at for a in group_articles if a.published_at]
        if dates:
            if any(d.tzinfo is None for d in dates):
                dates = [d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d for d in dates]
            span_days = (max(dates) - min(dates)).total_seconds() / 86400
            cluster_type = "event" if span_days <= EVENT_MAX_DAYS else "theme"
            first_seen = min(dates)
            last_seen = max(dates)
        else:
            cluster_type = "event"
            first_seen = last_seen = None

        # Representative title: highest-scored article, fallback to first
        scored = [(a.signal_score or 0.0, a) for a in group_articles]
        best = max(scored, key=lambda x: x[0])[1]
        representative_title = best.title

        cluster_score = _compute_cluster_score(group_articles)
        unique_sources = len({a.source_id for a in group_articles})

        cluster = create_cluster(
            db,
            cluster_type=cluster_type,
            status="new",
            representative_title=representative_title,
            cluster_score=cluster_score,
            article_count=len(group_articles),
            source_count=unique_sources,
            first_seen_at=first_seen,
            last_seen_at=last_seen,
        )

        assign_articles_to_cluster(db, cluster_id=cluster.id, articles=group_articles)
        clusters_created += 1
        logger.info(
            "cluster created id=%s type=%s articles=%d score=%.1f title=%.60s",
            cluster.id, cluster_type, len(group_articles), cluster_score, representative_title,
        )

    db.commit()
    logger.info(
        "clustering done: articles=%d clusters=%d",
        len(articles), clusters_created,
    )
    return {"articles_processed": len(articles), "clusters_created": clusters_created}
