"""The pipeline's page warm-up: one GET per page, never raises."""

from __future__ import annotations

import httpx

from app.services.page_warm import WARM_PATHS, warm_pages


def test_warms_every_page_and_reports_cache_state():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.url.path == "/radar":
            return httpx.Response(200, headers={"x-vercel-cache": "STALE"})
        return httpx.Response(200, headers={"x-vercel-cache": "HIT"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        results = warm_pages(client, site="https://example.test")
    assert seen == list(WARM_PATHS)
    assert results["/radar"] == "200 STALE" and results["/"] == "200 HIT"


def test_a_failing_page_does_not_stop_the_others():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/weekly":
            raise httpx.ConnectTimeout("slow")
        return httpx.Response(200)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        results = warm_pages(client, site="https://example.test")
    assert results["/weekly"] == "error ConnectTimeout"
    assert results["/archive"] == "200 -"
