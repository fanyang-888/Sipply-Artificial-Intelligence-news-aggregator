"""Shared pytest setup.

Pure unit tests need nothing. Tests that use the ``db`` fixture need
TEST_DATABASE_URL pointing at a *local* Postgres migrated to alembic head;
each such test runs inside a transaction that is rolled back afterwards, so
the database is left untouched. Without TEST_DATABASE_URL they are skipped.

    cd backend/
    TEST_DATABASE_URL=postgresql+psycopg://user:pw@localhost:5432/pait_test \
        alembic upgrade head   # once, with DATABASE_URL set to the same URL
    TEST_DATABASE_URL=... pytest
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
if TEST_DATABASE_URL.startswith("postgresql://"):
    TEST_DATABASE_URL = TEST_DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

# app.config.Settings validates these at import time. Process env beats a local
# backend/.env, so app code imported by tests can never reach a real database.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL or "postgresql+psycopg://unused@localhost:1/unused"
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SOURCE_FETCH_USER_AGENT", "sipply-tests")
os.environ.pop("REDIS_URL", None)


@pytest.fixture(scope="session")
def _engine():
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set — skipping database tests")
    if urlsplit(TEST_DATABASE_URL).hostname not in ("localhost", "127.0.0.1"):
        pytest.fail("TEST_DATABASE_URL must point at localhost; refusing to touch a remote database")
    from sqlalchemy import create_engine

    engine = create_engine(TEST_DATABASE_URL)
    yield engine
    engine.dispose()


@pytest.fixture
def db(_engine):
    """A Session whose work is rolled back when the test ends."""
    from sqlalchemy.orm import Session

    conn = _engine.connect()
    outer = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        conn.close()


def _now() -> datetime:
    return datetime.now(timezone.utc)


@pytest.fixture
def make_source(db):
    from app.models.source import Source

    def _make(**kw) -> Source:
        src = Source(
            name=kw.pop("name", "Test Source"),
            type=kw.pop("type", "rss"),
            fetch_frequency_minutes=kw.pop("fetch_frequency_minutes", 60),
            slug=kw.pop("slug", f"test-{uuid.uuid4().hex[:8]}"),
            **kw,
        )
        db.add(src)
        db.flush()
        return src

    return _make


@pytest.fixture
def make_cluster(db):
    from app.models.cluster import Cluster

    def _make(**kw) -> Cluster:
        title = kw.pop("title", f"cluster {uuid.uuid4().hex[:6]}")
        cluster = Cluster(
            representative_title=title,
            representative_title_zh=kw.pop("title_zh", f"{title} (zh)"),
            cluster_score=kw.pop("score", 50.0),
            last_seen_at=kw.pop("last_seen_at", _now()),
            **kw,
        )
        db.add(cluster)
        db.flush()
        return cluster

    return _make


@pytest.fixture
def make_article(db, make_source):
    from app.models.article import Article

    def _make(**kw) -> Article:
        source = kw.pop("source", None) or make_source()
        article = Article(
            source_id=source.id,
            title=kw.pop("title", "Test article about AI models"),
            url=kw.pop("url", f"https://example.test/{uuid.uuid4().hex}"),
            **kw,
        )
        db.add(article)
        db.flush()
        return article

    return _make


@pytest.fixture
def days_ago():
    return lambda d: _now() - timedelta(days=d)


@pytest.fixture(autouse=True)
def _no_page_warm(monkeypatch):
    """A pipeline run ends by requesting the live site's pages; tests that run the pipeline must not."""
    monkeypatch.setattr("app.services.page_warm.warm_pages", lambda *args, **kwargs: {})
