"""POST /api/events records readers, not crawlers or our own test browsers."""

from __future__ import annotations

from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from app.api.routes import events as E
from app.main import app

CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"


@pytest.mark.parametrize(
    "ua",
    [
        "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/130.0.0.0 Safari/537.36",
        "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
        "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 sipply-stability",
        "Mozilla/5.0 (Linux; Android 11) Chrome-Lighthouse",
        "",
        None,
    ],
)
def test_crawlers_and_test_browsers_are_automated(ua):
    assert E.is_automated(ua)


def test_people_are_not():
    assert not E.is_automated(CHROME)
    assert not E.is_automated("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")


def test_only_readers_events_are_stored(monkeypatch):
    added: list = []

    class FakeSession:
        def add(self, row):
            added.append(row)

    @contextmanager
    def fake_scope():
        yield FakeSession()

    monkeypatch.setattr("app.db.session_scope", fake_scope)
    monkeypatch.setattr("app.cache._get_client", lambda: None)
    client = TestClient(app)
    body = {"type": "cluster_viewed", "entity_id": "abc", "device_id": "d1"}
    assert client.post("/api/events", json=body, headers={"User-Agent": "GPTBot/1.2"}).status_code == 204
    assert added == []
    assert client.post("/api/events", json=body, headers={"User-Agent": CHROME}).status_code == 204
    assert [(e.type, e.entity_id, e.device_id) for e in added] == [("cluster_viewed", "abc", "d1")]
