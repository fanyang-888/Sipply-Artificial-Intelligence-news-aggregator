"""GitHub, DEV, Lobsters, Bluesky and Threads radar sources, against mocked HTTP (no network)."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import httpx

from app.signals.base import SignalCredentials, credentials_from_settings
from app.signals.bluesky import fetch_bluesky, parse_bsky_post, post_url
from app.signals.config import (
    BlueskyConfig,
    DevtoConfig,
    GitHubConfig,
    LobstersConfig,
    ThreadsConfig,
    load_radar_config,
)
from app.signals.devto import fetch_devto
from app.signals.github import fetch_github, parse_github_repo
from app.signals.lobsters import fetch_lobsters, parse_lobsters_story
from app.signals.threads import fetch_threads

NOW = datetime(2026, 10, 13, 12, 0, tzinfo=timezone.utc)
SINCE = NOW - timedelta(days=14)


def run(coro):
    return asyncio.run(coro)


def client_for(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def query_of(request: httpx.Request) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlsplit(str(request.url)).query).items()}


def iso(days_ago: float) -> str:
    return (NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Config / credentials
# ---------------------------------------------------------------------------

def test_bundled_config_has_the_new_sources():
    cfg = load_radar_config()
    assert cfg.github.queries and cfg.devto.tags and cfg.lobsters.tags
    assert cfg.bluesky.queries and cfg.threads.queries


def test_keyed_sources_are_active_only_with_their_keys():
    none = SignalCredentials()
    assert none.active_families() == ["hn", "news", "github", "devto", "lobsters"]
    full = SignalCredentials(
        youtube_api_key="y", bluesky_handle="me.bsky.social", bluesky_app_password="p", threads_access_token="t"
    )
    assert len(full.active_families()) == 8
    assert not SignalCredentials(bluesky_handle="me.bsky.social").family_active("bluesky")  # needs both


def test_credentials_from_settings_reads_secrets(monkeypatch):
    from pydantic import SecretStr

    from app.config import settings

    monkeypatch.setattr(settings, "bluesky_handle", "me.bsky.social")
    monkeypatch.setattr(settings, "bluesky_app_password", SecretStr("app-pw"))
    creds = credentials_from_settings()
    assert (creds.bluesky_handle, creds.bluesky_app_password) == ("me.bsky.social", "app-pw")


# ---------------------------------------------------------------------------
# GitHub
# ---------------------------------------------------------------------------

def gh_repo(repo_id, name, stars, days_ago=2, description="An agent framework"):
    return {
        "id": repo_id, "full_name": name, "html_url": f"https://github.com/{name}",
        "description": description, "created_at": iso(days_ago), "stargazers_count": stars,
        "language": "Python", "topics": ["llm"], "owner": {"login": name.split("/")[0]},
    }


def test_parse_github_repo():
    item = parse_github_repo(gh_repo(1, "acme/agentkit", 3177), "topic:llm")
    assert item.source_kind == "gh_repo"
    assert item.title == "acme/agentkit: An agent framework"
    # The source chip already says GitHub; the repo owner is in the title
    assert (item.points, item.author, item.outlet) == (3177, "acme", None)
    assert parse_github_repo({"full_name": "x/y"}) is None


def test_fetch_github_adds_window_and_star_floor_and_dedups():
    seen = []

    def handler(request):
        seen.append(query_of(request))
        assert request.url.host == "api.github.com"
        return httpx.Response(200, json={"items": [gh_repo(1, "acme/agentkit", 500), gh_repo(2, "acme/other", 120)]})

    result = run(fetch_github(client_for(handler), GitHubConfig(queries=["topic:llm", "topic:mcp"], min_stars=100), since=SINCE, pause_sec=0))
    assert result.status == "ok" and result.requests == 2
    assert sorted(i.external_id for i in result.items) == ["1", "2"]
    assert seen[0]["q"] == "topic:llm created:>=2026-09-29 stars:>=100"
    assert seen[0]["sort"] == "stars"


# ---------------------------------------------------------------------------
# DEV
# ---------------------------------------------------------------------------

def devto_post(post_id, reactions, days_ago=1):
    return {
        "id": post_id, "title": f"Post {post_id}", "url": f"https://dev.to/u/post-{post_id}",
        "description": "How I built an agent", "published_at": iso(days_ago),
        "public_reactions_count": reactions, "comments_count": 5, "user": {"username": "u"}, "tag_list": ["ai"],
    }


def test_fetch_devto_filters_reactions_and_window():
    seen = []

    def handler(request):
        seen.append(query_of(request))
        return httpx.Response(200, json=[devto_post(1, 50), devto_post(2, 3), devto_post(3, 80, days_ago=20)])

    result = run(fetch_devto(client_for(handler), DevtoConfig(tags=["ai"], min_reactions=10), since=SINCE, now=NOW, pause_sec=0))
    assert [i.external_id for i in result.items] == ["1"]  # 2: too few reactions, 3: before the window
    item = result.items[0]
    assert (item.points, item.num_comments, item.outlet) == (50, 5, "@u")
    assert seen == [{"tag": "ai", "top": "14", "per_page": "50"}]


# ---------------------------------------------------------------------------
# Lobsters
# ---------------------------------------------------------------------------

def lobsters_story(short_id, score, days_ago, submitter="alice"):
    return {
        "short_id": short_id, "title": f"Story {short_id}", "url": f"https://example.com/{short_id}",
        "comments_url": f"https://lobste.rs/s/{short_id}", "created_at": iso(days_ago),
        "score": score, "comment_count": 4, "tags": ["ai"], "submitter_user": submitter,
    }


def test_parse_lobsters_story_handles_both_submitter_shapes():
    assert parse_lobsters_story(lobsters_story("a1", 5, 1)).author == "alice"
    assert parse_lobsters_story(lobsters_story("a2", 5, 1, submitter={"username": "bob"})).author == "bob"
    item = parse_lobsters_story(lobsters_story("a3", 5, 1))
    assert item.discussion_url == "https://lobste.rs/s/a3"


def test_fetch_lobsters_pages_until_the_window_start():
    pages = []

    def handler(request):
        pages.append(request.url.path)
        if request.url.path == "/t/ai.json":
            return httpx.Response(200, json=[lobsters_story("n1", 8, 1), lobsters_story("n2", 1, 2)])
        return httpx.Response(200, json=[lobsters_story("o1", 9, 10), lobsters_story("o2", 9, 30)])

    result = run(fetch_lobsters(client_for(handler), LobstersConfig(tags=["ai"], max_pages=5, min_score=3), since=SINCE, pause_sec=0))
    assert pages == ["/t/ai.json", "/t/ai/page/2.json"]  # page 2 reached stories older than the window
    assert sorted(i.external_id for i in result.items) == ["n1", "o1"]  # n2: score too low, o2: too old


# ---------------------------------------------------------------------------
# Bluesky
# ---------------------------------------------------------------------------

def bsky_post(rkey, likes, days_ago=1, text="Claude Haiku 5.5 is out and it is fast"):
    return {
        "uri": f"at://did:plc:abc/app.bsky.feed.post/{rkey}", "cid": "c",
        "author": {"handle": "alice.bsky.social"},
        "record": {"text": text, "createdAt": iso(days_ago)},
        "likeCount": likes, "repostCount": 3, "quoteCount": 1, "replyCount": 7, "indexedAt": iso(days_ago),
    }


def test_post_url_and_parse():
    assert post_url("at://did:plc:abc/app.bsky.feed.post/3k2", "a.bsky.social") == "https://bsky.app/profile/a.bsky.social/post/3k2"
    assert post_url("at://did:plc:abc/app.bsky.feed.like/3k2", "a") is None
    item = parse_bsky_post(bsky_post("r1", 40))
    assert (item.like_count, item.points, item.num_comments) == (40, 4, 7)
    assert item.url == "https://bsky.app/profile/alice.bsky.social/post/r1"
    assert item.outlet == "@alice.bsky.social"


def test_bluesky_skipped_without_credentials():
    def handler(request):
        raise AssertionError("no request expected")

    result = run(fetch_bluesky(client_for(handler), BlueskyConfig(queries=["LLM"]), since=SINCE, handle=None, app_password=None))
    assert result.status == "skipped" and "BLUESKY" in result.note


def test_bluesky_logs_in_then_searches_the_accounts_pds():
    calls: list[httpx.Request] = []

    def handler(request):
        calls.append(request)
        if request.url.path.endswith("createSession"):
            body = json.loads(request.content)
            assert body == {"identifier": "me.bsky.social", "password": "app-pw"}
            return httpx.Response(200, json={
                "accessJwt": "JWT", "refreshJwt": "R", "handle": "me.bsky.social", "did": "did:plc:me",
                "didDoc": {"service": [{"type": "AtprotoPersonalDataServer", "serviceEndpoint": "https://pds.example.host"}]},
            })
        return httpx.Response(200, json={"posts": [bsky_post("r1", 40), bsky_post("r2", 2), bsky_post("r3", 99, days_ago=30)]})

    cfg = BlueskyConfig(queries=["LLM"], min_likes=10)
    result = run(fetch_bluesky(client_for(handler), cfg, since=SINCE, handle="me.bsky.social", app_password="app-pw", pause_sec=0))

    search = calls[1]
    assert search.url.host == "pds.example.host"
    assert search.headers["authorization"] == "Bearer JWT"
    q = query_of(search)
    assert (q["q"], q["sort"], q["lang"], q["since"]) == ("LLM", "top", "en", "2026-09-29T12:00:00Z")
    assert all("app-pw" not in str(c.url) for c in calls)
    assert [i.external_id for i in result.items] == ["at://did:plc:abc/app.bsky.feed.post/r1"]
    assert result.status == "ok"


def test_bluesky_bad_login_fails_cleanly():
    def handler(request):
        return httpx.Response(401, json={"error": "AuthenticationRequired"})

    result = run(fetch_bluesky(client_for(handler), BlueskyConfig(queries=["LLM"]), since=SINCE, handle="me", app_password="wrong"))
    assert result.status == "failed"
    assert result.note == "login failed (401)"


# ---------------------------------------------------------------------------
# Threads
# ---------------------------------------------------------------------------

def test_threads_skipped_without_token():
    def handler(request):
        raise AssertionError("no request expected")

    result = run(fetch_threads(client_for(handler), ThreadsConfig(queries=["OpenAI"]), since=SINCE, access_token=None))
    assert result.status == "skipped"


def test_threads_searches_with_bearer_token_not_in_url():
    calls: list[httpx.Request] = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"data": [
            {"id": "1", "text": "What is everyone using for AI agents?", "permalink": "https://www.threads.net/@u/post/1",
             "timestamp": "2026-10-12T10:00:00+0000", "username": "u"},
            {"id": "2", "text": "old", "permalink": "https://www.threads.net/@u/post/2",
             "timestamp": "2026-09-01T10:00:00+0000", "username": "u"},
        ]})

    result = run(fetch_threads(client_for(handler), ThreadsConfig(queries=["AI agent"]), since=SINCE, access_token="TOKEN", pause_sec=0))
    assert calls[0].headers["authorization"] == "Bearer TOKEN"
    assert "TOKEN" not in str(calls[0].url)
    q = query_of(calls[0])
    assert (q["q"], q["search_type"], q["since"]) == ("AI agent", "TOP", str(int(SINCE.timestamp())))
    assert [i.external_id for i in result.items] == ["1"]
    assert result.items[0].is_question


def test_threads_api_error_stops_the_run():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(400, json={"error": {"message": "Invalid OAuth access token"}})

    result = run(fetch_threads(client_for(handler), ThreadsConfig(queries=["a", "b"]), since=SINCE, access_token="expired"))
    assert len(calls) == 1
    assert result.status == "failed" and "400" in result.note
