"""Trim data the site no longer needs, so the 500 MB database volume doesn't fill up.

On 2026-10-21 the volume held 241 MB (97 MB of tables). An article's full text
(raw_text, cleaned_text; about 9 KB) is used only in its first days: scoring,
clustering (7-day window) and summarizing. Pages and the API show the title,
excerpt and link, so after ARTICLE_TEXT_DAYS the text is dropped. That freed
about 22 MB at first and stops about 1 MB a week of growth. (Radar signals are
already pruned after 60 days in app/signals/topics.py; answer checks after 90.)
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, or_, update
from sqlalchemy.orm import Session

from app.models.article import Article

ARTICLE_TEXT_DAYS = 60


def prune_article_text(db: Session, *, now: datetime) -> int:
    """Drop the full text of articles older than ARTICLE_TEXT_DAYS (by publication, else by
    when they were stored). Returns how many articles were trimmed."""
    cutoff = now - timedelta(days=ARTICLE_TEXT_DAYS)
    result = db.execute(
        update(Article)
        .where(
            func.coalesce(Article.published_at, Article.created_at) < cutoff,
            or_(Article.raw_text.is_not(None), Article.cleaned_text.is_not(None)),
        )
        .values(raw_text=None, cleaned_text=None)
        .execution_options(synchronize_session=False)
    )
    db.commit()
    return result.rowcount or 0
