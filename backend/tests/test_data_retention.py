"""Old data the site no longer needs is trimmed, so the 500 MB database volume doesn't fill up."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services import data_retention as R

NOW = datetime(2026, 10, 21, 2, 0, tzinfo=timezone.utc)


def test_old_articles_lose_their_full_text_but_keep_everything_shown(db, make_article):
    old = make_article(title="Old story", raw_text="full text " * 200, cleaned_text="clean " * 200, excerpt="An excerpt.",
                       published_at=NOW - timedelta(days=R.ARTICLE_TEXT_DAYS + 1))
    recent = make_article(title="Recent story", raw_text="full text", cleaned_text="clean",
                          published_at=NOW - timedelta(days=R.ARTICLE_TEXT_DAYS - 1))
    undated_old = make_article(title="No date", raw_text="x", cleaned_text="y", published_at=None)
    undated_old.created_at = NOW - timedelta(days=R.ARTICLE_TEXT_DAYS + 5)
    db.flush()

    assert R.prune_article_text(db, now=NOW) == 2
    for a in (old, recent, undated_old):
        db.refresh(a)
    assert (old.raw_text, old.cleaned_text) == (None, None)
    assert (old.title, old.excerpt) == ("Old story", "An excerpt.")  # what pages show stays
    assert (recent.raw_text, recent.cleaned_text) == ("full text", "clean")
    assert (undated_old.raw_text, undated_old.cleaned_text) == (None, None)
    assert R.prune_article_text(db, now=NOW) == 0  # nothing left to trim
