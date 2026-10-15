"""Related stories for a story page: stories about the same thing, not just the same type.

Candidates are public stories seen within RELATED_WINDOW_DAYS of the story.
They are ranked by TF-IDF similarity of title + the start of the summary,
plus a bonus for naming the same company or model family (app.services.entities)
and for the same topic tag. Below RELATED_MIN_SCORE a story isn't related;
the page then shows fewer (or no) related stories rather than unrelated ones.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.cluster import Cluster
from app.services.entities import entities_in

RELATED_LIMIT = 4
RELATED_WINDOW_DAYS = 45
RELATED_MIN_SCORE = 0.2
# Added to the similarity when both titles name the same entity / share the topic tag;
# neither alone reaches RELATED_MIN_SCORE, some shared wording is still needed
ENTITY_BONUS = 0.15
TOPIC_TAG_BONUS = 0.05
SUMMARY_CHARS = 300

_VECTORIZER: dict[str, Any] = {"stop_words": "english", "sublinear_tf": True, "ngram_range": (1, 2)}


@dataclass(frozen=True)
class StoryText:
    id: str
    title: str
    summary: str | None
    topic_tag: str | None
    last_seen_at: datetime | None


def _text(s: StoryText) -> str:
    return f"{s.title}. {(s.summary or '')[:SUMMARY_CHARS]}"


def rank_related(target: StoryText, candidates: list[StoryText], limit: int = RELATED_LIMIT) -> list[str]:
    """Ids of the candidates most related to ``target``, best first; only those above RELATED_MIN_SCORE."""
    if not candidates:
        return []
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    try:
        matrix = TfidfVectorizer(**_VECTORIZER).fit_transform([_text(target)] + [_text(c) for c in candidates])
    except ValueError:  # every text was stop words
        return []
    sims = cosine_similarity(matrix[0], matrix[1:]).ravel()
    target_entities = {e.slug for e in entities_in(target.title)}

    scored: list[tuple[float, datetime, str]] = []
    for cand, sim in zip(candidates, sims):
        score = float(sim)
        if target_entities & {e.slug for e in entities_in(cand.title)}:
            score += ENTITY_BONUS
        if target.topic_tag and cand.topic_tag == target.topic_tag:
            score += TOPIC_TAG_BONUS
        if score >= RELATED_MIN_SCORE:
            seen = cand.last_seen_at or datetime.min.replace(tzinfo=timezone.utc)
            scored.append((score, seen, cand.id))
    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return [cid for _, _, cid in scored[:limit]]


def related_cluster_ids(db: Session, cluster: Cluster, limit: int = RELATED_LIMIT) -> list[str]:
    """Related public stories for ``cluster`` (see module docstring)."""
    anchor = cluster.last_seen_at or cluster.first_seen_at or datetime.now(timezone.utc)
    window = timedelta(days=RELATED_WINDOW_DAYS)
    rows = db.execute(
        select(Cluster.id, Cluster.representative_title, Cluster.summary, Cluster.topic_tag, Cluster.last_seen_at).where(
            Cluster.id != cluster.id,
            Cluster.representative_title_zh.isnot(None),
            Cluster.last_seen_at >= anchor - window,
            Cluster.last_seen_at <= anchor + window,
        )
    ).all()
    candidates = [StoryText(str(cid), title, summary, tag, seen) for cid, title, summary, tag, seen in rows]
    target = StoryText(str(cluster.id), cluster.representative_title, cluster.summary, cluster.topic_tag, cluster.last_seen_at)
    return rank_related(target, candidates, limit)

