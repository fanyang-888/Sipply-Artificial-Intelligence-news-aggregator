"""Signing up, confirming and leaving the digest, through the HTTP API.

A sign-up gets a confirmation link and nothing else; only a confirmed address
gets the digest, and every digest carries that subscriber's own unsubscribe link
(in the footer and as a one-click List-Unsubscribe header).
"""

from __future__ import annotations

import re

import pytest

from app.services import subscriptions as S

SITE = "https://www.sipply.dev"


@pytest.fixture
def outbox(monkeypatch):
    """Every email the app sends in a test, instead of sending it."""
    sent: list[dict] = []
    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    monkeypatch.setattr("app.services.mailer.send", lambda message: sent.append(message))
    return sent


@pytest.fixture
def client(db, monkeypatch):
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app
    from app.rate_limit import limiter

    monkeypatch.setattr(limiter, "enabled", False)
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def token_in(mail: dict, path: str) -> str:
    match = re.search(rf"{re.escape(SITE + path)}\?token=([A-Za-z0-9_-]+)", mail["text"])
    assert match, f"no {path} link in: {mail['text']}"
    return match.group(1)


def recipients(db) -> list[str]:
    return [s.email for s in S.digest_recipients(db) if s.email.endswith("@example.com")]


def test_signing_up_sends_a_confirmation_link_and_no_digest_until_it_is_clicked(client, db, outbox):
    r = client.post("/api/subscribe", json={"email": " Reader@Example.com "})

    assert r.status_code == 200 and r.json() == {"status": "confirm_sent"}
    [mail] = outbox
    assert mail["to"] == ["reader@example.com"]
    assert token_in(mail, "/subscribe/confirm")
    assert recipients(db) == []


def test_the_confirmation_link_starts_the_digest(client, db, outbox):
    client.post("/api/subscribe", json={"email": "reader@example.com"})
    token = token_in(outbox[-1], "/subscribe/confirm")

    assert client.post("/api/subscribe/confirm", json={"token": token}).json() == {"status": "confirmed"}
    assert recipients(db) == ["reader@example.com"]
    # Opened twice (or by a mail scanner first): still fine
    assert client.post("/api/subscribe/confirm", json={"token": token}).json() == {"status": "already_confirmed"}
    assert client.post("/api/subscribe/confirm", json={"token": "no-such-token"}).status_code == 404


def test_a_confirmed_subscriber_signing_up_again_gets_no_email(client, db, outbox):
    client.post("/api/subscribe", json={"email": "reader@example.com"})
    client.post("/api/subscribe/confirm", json={"token": token_in(outbox[-1], "/subscribe/confirm")})

    assert client.post("/api/subscribe", json={"email": "reader@example.com"}).json() == {"status": "already_subscribed"}
    assert len(outbox) == 1


def test_signing_up_again_resends_the_link_at_most_every_15_minutes(client, db, outbox):
    from datetime import timedelta

    from app.models.subscriber import Subscriber

    client.post("/api/subscribe", json={"email": "reader@example.com"})
    assert client.post("/api/subscribe", json={"email": "reader@example.com"}).json() == {"status": "confirm_sent"}
    assert len(outbox) == 1  # the form can't be used to flood someone's inbox

    sub = db.query(Subscriber).filter_by(email="reader@example.com").one()
    for expected in (2, 3, 3, 3):
        sub.confirm_sent_at -= timedelta(minutes=16)
        db.flush()
        assert client.post("/api/subscribe", json={"email": "reader@example.com"}).json() == {"status": "confirm_sent"}
        assert len(outbox) == expected  # three emails at most, however often it's asked
    assert len({token_in(m, "/subscribe/confirm") for m in outbox}) == 1


def test_when_the_confirmation_email_fails_the_reader_is_told_and_can_retry(client, db, outbox, monkeypatch):
    def refuse(message):
        raise RuntimeError("Resend is down")

    monkeypatch.setattr("app.services.mailer.send", refuse)
    r = client.post("/api/subscribe", json={"email": "reader@example.com"})
    assert r.status_code == 503

    monkeypatch.setattr("app.services.mailer.send", lambda message: outbox.append(message))
    assert client.post("/api/subscribe", json={"email": "reader@example.com"}).json() == {"status": "confirm_sent"}
    assert len(outbox) == 1


def test_a_chinese_sign_up_gets_the_link_to_the_chinese_page(client, db, outbox):
    client.post("/api/subscribe", json={"email": "reader@example.com", "lang": "zh"})

    [mail] = outbox
    assert mail["subject"] == "请确认订阅 Sipply"
    assert token_in(mail, "/zh/subscribe/confirm")


def confirmed(client, outbox, email: str) -> str:
    """Sign ``email`` up and confirm it; returns its token."""
    client.post("/api/subscribe", json={"email": email})
    token = token_in(outbox[-1], "/subscribe/confirm")
    client.post("/api/subscribe/confirm", json={"token": token})
    return token


def test_every_digest_carries_the_subscribers_own_one_click_unsubscribe(client, db, outbox, monkeypatch):
    from datetime import date
    from types import SimpleNamespace

    from app.services.email_service import send_digest_email

    confirmed(client, outbox, "a@example.com")
    confirmed(client, outbox, "b@example.com")
    outbox.clear()
    stories = [SimpleNamespace(representative_title="A story", summary="What happened.")]

    assert send_digest_email(stories, S.digest_recipients(db), today=date(2026, 11, 3))[1] == 0
    mails = [m for m in outbox if m["to"][0].endswith("@example.com")]
    tokens = []
    for mail in mails:
        token = token_in(mail, "/unsubscribe")
        assert f'href="{SITE}/unsubscribe?token={token}"' in mail["html"]
        assert mail["headers"] == {
            "List-Unsubscribe": f"<{SITE}/api/unsubscribe?token={token}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
        assert "reply" not in (mail["html"] + mail["text"]).lower()  # sipply.dev receives no mail
        tokens.append(token)
    assert len(set(tokens)) == 2


def test_one_click_unsubscribe_stops_the_digest(client, db, outbox):
    token = confirmed(client, outbox, "reader@example.com")

    # What a mail client sends (RFC 8058), passed on by the site
    r = client.post(
        f"/api/unsubscribe?token={token}",
        content="List-Unsubscribe=One-Click",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 200 and r.json() == {"status": "unsubscribed"}
    assert recipients(db) == []
    # Clicked again, or a token that names no one: still 200, but it says nothing was removed
    r = client.post(f"/api/unsubscribe?token={token}")
    assert r.status_code == 200 and r.json() == {"status": "not_subscribed"}


def test_addresses_never_confirmed_are_deleted_after_a_week(client, db, outbox):
    from datetime import datetime, timedelta, timezone

    from app.models.subscriber import Subscriber

    client.post("/api/subscribe", json={"email": "never@example.com"})
    confirmed(client, outbox, "kept@example.com")
    now = datetime.now(timezone.utc)

    # A resend late in the week doesn't postpone the deletion
    never = db.query(Subscriber).filter_by(email="never@example.com").one()
    never.confirm_sent_at = now + timedelta(days=6)
    db.flush()

    assert S.prune_unconfirmed(db, now=now + timedelta(days=6)) == 0
    assert S.prune_unconfirmed(db, now=now + timedelta(days=7, minutes=1)) >= 1
    left = {s.email for s in db.query(Subscriber).all()}
    assert "never@example.com" not in left and "kept@example.com" in left


def test_alembic_sees_the_subscribers_table():
    """migrations/env.py compares the database with what importing app.models registers; a
    model missing there makes `alembic revision --autogenerate` write a drop_table for it.
    Checked in a fresh interpreter: this test module has imported the model already."""
    import os
    import subprocess
    import sys
    from pathlib import Path

    probe = "from app.models import Article; from app.db import Base; print('subscribers' in Base.metadata.tables)"
    env = {**os.environ, "DATABASE_URL": "postgresql+psycopg://unused@localhost:1/unused"}
    out = subprocess.run([sys.executable, "-c", probe], cwd=Path(__file__).parents[1], env=env, capture_output=True, text=True)
    assert out.stdout.strip() == "True", out.stderr


def test_a_chinese_subscriber_gets_the_chinese_unsubscribe_page(client, db, outbox):
    from datetime import date
    from types import SimpleNamespace

    from app.services.email_service import digest_message

    client.post("/api/subscribe", json={"email": "reader@example.com", "lang": "zh"})
    client.post("/api/subscribe/confirm", json={"token": token_in(outbox[-1], "/zh/subscribe/confirm")})
    [sub] = [s for s in S.digest_recipients(db) if s.email == "reader@example.com"]

    mail = digest_message([SimpleNamespace(representative_title="A story", summary=None)], sub, date(2026, 11, 3))
    assert token_in(mail, "/zh/unsubscribe") == sub.token
    assert mail["headers"]["List-Unsubscribe"] == f"<{SITE}/api/unsubscribe?token={sub.token}>"


def test_a_sign_up_by_code_that_sets_no_token_still_gets_one(db):
    """The previous release inserts only (id, email): it may still be serving while the
    API's migration runs, so the database fills the token in."""
    from sqlalchemy import text

    db.execute(text("INSERT INTO subscribers (id, email) VALUES (gen_random_uuid(), 'old-code@example.com')"))
    token, confirmed_at = db.execute(text("SELECT token, confirmed_at FROM subscribers WHERE email = 'old-code@example.com'")).one()
    assert len(token) == 64 and confirmed_at is None


def test_health_says_whether_the_api_can_send_email(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    assert TestClient(app).get("/health").json() == {"status": "ok", "mail": False}
    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    assert TestClient(app).get("/health").json() == {"status": "ok", "mail": True}
