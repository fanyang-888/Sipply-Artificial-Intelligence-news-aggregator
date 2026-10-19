"""Telling search engines about new and updated pages (IndexNow)."""

from __future__ import annotations

import json

import httpx

from app.services import indexnow

KEY = "aa8db26b0873dac1032938789ff80a3a"


def capture(status: int = 200):
    sent: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append({"url": str(request.url), "body": json.loads(request.content)})
        return httpx.Response(status)

    return sent, httpx.Client(transport=httpx.MockTransport(handler))


def test_submit_posts_the_urls_with_the_sites_key():
    sent, client = capture()
    result = indexnow.submit(
        ["https://www.sipply.dev/cluster/a", "https://www.sipply.dev/", "https://www.sipply.dev/cluster/a"],
        client=client,
        key=KEY,
    )
    assert sent[0]["url"] == "https://api.indexnow.org/indexnow"
    assert sent[0]["body"] == {
        "host": "www.sipply.dev",
        "key": KEY,
        "keyLocation": f"https://www.sipply.dev/{KEY}.txt",
        "urlList": ["https://www.sipply.dev/cluster/a", "https://www.sipply.dev/"],
    }
    assert result == {"status": "ok", "submitted": 2, "http_status": 200}


def test_a_refusal_or_a_network_error_is_reported_not_raised():
    _, client = capture(status=403)  # key file missing or wrong
    assert indexnow.submit(["https://www.sipply.dev/"], client=client, key=KEY) == {
        "status": "failed", "submitted": 0, "http_status": 403,
    }

    def boom(request):
        raise httpx.ConnectError("no route")

    result = indexnow.submit(["https://www.sipply.dev/"], client=httpx.Client(transport=httpx.MockTransport(boom)), key=KEY)
    assert result["status"] == "failed" and result["submitted"] == 0 and "ConnectError" in result["error"]


def test_nothing_to_submit_sends_nothing():
    sent, client = capture()
    assert indexnow.submit([], client=client, key=KEY) == {"status": "skipped", "submitted": 0}
    assert sent == []


def test_a_runs_urls_are_its_new_or_updated_stories_their_company_pages_and_the_hubs(db, make_cluster):
    from datetime import datetime, timedelta, timezone

    now = datetime(2026, 10, 16, 8, 5, tzinfo=timezone.utc)
    since = now - timedelta(hours=6)
    fresh = make_cluster(title="OpenAI ships a new model", summarized_at=now - timedelta(hours=1), last_seen_at=now - timedelta(hours=1))
    updated = make_cluster(title="A research result", summarized_at=now - timedelta(days=2), last_seen_at=now - timedelta(minutes=30))
    make_cluster(title="Old news", summarized_at=now - timedelta(days=3), last_seen_at=now - timedelta(days=3))
    make_cluster(title="Not summarized yet", summarized_at=None, last_seen_at=now - timedelta(minutes=10))

    urls = indexnow.changed_urls(db, since=since, now=now)

    site = "https://www.sipply.dev"
    english = [u for u in urls if not u.startswith(f"{site}/zh")]
    assert english[:8] == [
        f"{site}/", f"{site}/radar", f"{site}/archive", f"{site}/topics", f"{site}/weekly", f"{site}/daily",
        f"{site}/weekly/2026-W42", f"{site}/daily/2026-10-16",
    ]
    assert set(english[8:]) == {
        f"{site}/story/openai-ships-a-new-model-{fresh.id.hex[:8]}",
        f"{site}/story/a-research-result-{updated.id.hex[:8]}",
        f"{site}/topics/openai",
    }
    # Every page also at its Chinese address (/zh, /zh/story/…)
    chinese = [u for u in urls if u.startswith(f"{site}/zh")]
    assert chinese == [f"{site}/zh" if u == f"{site}/" else u.replace(site, f"{site}/zh", 1) for u in english]


def test_a_story_merged_this_run_is_submitted_at_its_old_address(db, make_cluster):
    import uuid
    from datetime import datetime, timedelta, timezone

    from app.models.story_redirect import StoryRedirect

    now = datetime(2026, 10, 16, 8, 5, tzinfo=timezone.utc)
    since = now - timedelta(hours=6)
    kept = make_cluster(title="Meta drops its scraping terms", summarized_at=now - timedelta(days=2), last_seen_at=now - timedelta(days=2))
    db.add_all([
        StoryRedirect(old_id=uuid.uuid4(), old_slug="meta-removes-language-11111111", cluster_id=kept.id, created_at=now - timedelta(hours=1)),
        StoryRedirect(old_id=uuid.uuid4(), old_slug=None, cluster_id=kept.id, created_at=now - timedelta(hours=1)),
        StoryRedirect(old_id=uuid.uuid4(), old_slug="merged-long-ago-22222222", cluster_id=kept.id, created_at=now - timedelta(days=3)),
    ])
    db.flush()

    urls = indexnow.changed_urls(db, since=since, now=now)
    site = "https://www.sipply.dev"
    # So search engines recrawl it, follow the redirect and drop the duplicate
    assert f"{site}/story/meta-removes-language-11111111" in urls
    assert f"{site}/zh/story/meta-removes-language-11111111" in urls
    assert not any("merged-long-ago" in u for u in urls)
