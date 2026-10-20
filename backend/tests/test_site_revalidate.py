"""Telling the site which cached pages a pipeline run changed (POST /api/revalidate)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from app.services import site_revalidate as R

NOW = datetime(2026, 10, 20, 8, 5, tzinfo=timezone.utc)
SECRET = "test-secret-not-real"


def capture(status: int = 200):
    sent: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append({"url": str(request.url), "auth": request.headers.get("authorization"), "body": json.loads(request.content)})
        return httpx.Response(status, json={"revalidated": len(json.loads(request.content)["tags"])})

    return sent, httpx.Client(transport=httpx.MockTransport(handler))


def test_a_runs_tags_are_the_run_data_and_each_changed_story(db, make_cluster):
    from app.models.story_redirect import StoryRedirect

    since = NOW - timedelta(hours=6)
    fresh = make_cluster(title="OpenAI ships a new model", summarized_at=NOW - timedelta(hours=1), last_seen_at=NOW - timedelta(hours=1))
    fresh.slug = f"openai-ships-a-new-model-{fresh.id.hex[:8]}"
    grew = make_cluster(title="A research result", summarized_at=NOW - timedelta(days=2), last_seen_at=NOW - timedelta(minutes=30))
    make_cluster(title="Old news", summarized_at=NOW - timedelta(days=3), last_seen_at=NOW - timedelta(days=3))
    make_cluster(title="Not summarized yet", summarized_at=None, last_seen_at=NOW - timedelta(minutes=10))
    merged_id = uuid.uuid4()
    db.add(StoryRedirect(old_id=merged_id, old_slug="meta-removes-language-11111111", cluster_id=grew.id, created_at=NOW - timedelta(hours=1)))
    db.add(StoryRedirect(old_id=uuid.uuid4(), old_slug="merged-long-ago-22222222", cluster_id=grew.id, created_at=NOW - timedelta(days=3)))
    db.flush()

    tags = R.revalidate_tags(db, since=since)
    assert tags[0] == "run"  # the home page, radar, topics, weeks, days and feeds
    assert set(tags[1:]) == {
        f"story:{fresh.slug}", f"story-id:{fresh.id}",
        f"story:a-research-result-{grew.id.hex[:8]}", f"story-id:{grew.id}",
        # A story merged this run: its old address must start redirecting
        "story:meta-removes-language-11111111", f"story-id:{merged_id}",
    }


def test_submit_posts_the_tags_with_the_secret():
    sent, client = capture()
    result = R.submit(["run", "story-id:abc"], client=client, secret=SECRET, site="https://www.sipply.dev")
    assert sent == [{"url": "https://www.sipply.dev/api/revalidate", "auth": f"Bearer {SECRET}", "body": {"tags": ["run", "story-id:abc"]}}]
    assert result == {"status": "ok", "tags": 2, "http_status": 200}


def test_submit_never_raises_and_skips_without_a_secret():
    sent, client = capture(status=401)
    assert R.submit(["run"], client=client, secret=SECRET) == {"status": "failed", "tags": 0, "http_status": 401}

    def boom(request):
        raise httpx.ConnectError("no route")

    result = R.submit(["run"], client=httpx.Client(transport=httpx.MockTransport(boom)), secret=SECRET)
    assert result["status"] == "failed" and "ConnectError" in result["error"]
    assert R.submit(["run"], client=client, secret="") == {"status": "skipped", "reason": "REVALIDATE_SECRET not set"}
    assert len(sent) == 1
