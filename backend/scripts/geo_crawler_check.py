"""What does an AI crawler see on Sipply? (GEO readability check)

Fetches the site the way GPTBot/ClaudeBot do — raw HTML, no JavaScript — and
reports whether the stories are actually in the page, plus structured data,
sitemap, robots.txt and llms.txt. Read-only: a handful of GET requests.

Usage (from backend/):
    python -m scripts.geo_crawler_check https://www.sipply.dev
    python -m scripts.geo_crawler_check http://localhost:3000 --ua claudebot
    python -m scripts.geo_crawler_check https://www.sipply.dev --json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html import unescape
from typing import Any

import httpx

USER_AGENTS = {
    "gptbot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
    "claudebot": "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "perplexitybot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
}
DEFAULT_API = "https://personal-ai-intelligence-tool-production.up.railway.app"

_STORY_HREF = re.compile(r'href="(?:https?://[^"/]+)?/cluster/([0-9a-f-]{36})"')
_SCRIPT_STYLE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.S | re.I)
_TAG = re.compile(r"<[^>]+>")
_JSONLD = re.compile(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', re.S | re.I)


def visible_text(html: str) -> str:
    return re.sub(r"\s+", " ", unescape(_TAG.sub(" ", _SCRIPT_STYLE.sub(" ", html)))).strip()


def jsonld_types(html: str) -> list[str]:
    types: list[str] = []
    for block in _JSONLD.findall(html):
        try:
            data = json.loads(block)
        except ValueError:
            types.append("<invalid JSON>")
            continue
        for node in data if isinstance(data, list) else [data]:
            t = node.get("@type") if isinstance(node, dict) else None
            types.extend(t if isinstance(t, list) else [t] if t else [])
    return types


def _first(pattern: str, html: str) -> str | None:
    m = re.search(pattern, html, re.S | re.I)
    return unescape(m.group(1)).strip() if m else None


def page_report(client: httpx.Client, url: str) -> dict[str, Any]:
    resp = client.get(url)
    html = resp.text if resp.status_code == 200 else ""
    return {
        "url": url,
        "status": resp.status_code,
        "html_bytes": len(resp.content),
        "visible_chars": len(visible_text(html)),
        "story_links": len(set(_STORY_HREF.findall(html))),
        "jsonld": jsonld_types(html),
        "title": _first(r"<title[^>]*>(.*?)</title>", html),
        "description": _first(r'<meta name="description" content="([^"]*)"', html),
        "canonical": _first(r'<link rel="canonical" href="([^"]*)"', html),
        "_html": html,
    }


def story_report(client: httpx.Client, site: str, api: str, story_id: str | None) -> dict[str, Any]:
    if story_id is None:
        digest = client.get(f"{api}/api/digest/today").json()
        story_id = (digest.get("featured") or {}).get("id")
    if not story_id:
        return {"error": "no story id"}
    cluster = client.get(f"{api}/api/clusters/{story_id}").json()
    report = page_report(client, f"{site}/cluster/{story_id}")
    text = visible_text(report.pop("_html"))

    def present(s: str | None) -> bool:
        return bool(s) and s[:80] in text

    takeaways = [t.get("en") for t in cluster.get("takeaways") or [] if t.get("en")]
    articles = cluster.get("articles") or []
    report.update(
        {
            "summary_in_html": present((cluster.get("summary") or {}).get("en")),
            "why_it_matters_in_html": present((cluster.get("whyItMatters") or {}).get("en")),
            "takeaways_in_html": f"{sum(present(t) for t in takeaways)}/{len(takeaways)}",
            "source_titles_in_html": f"{sum(present(a.get('title')) for a in articles)}/{len(articles)}",
        }
    )
    return report


def text_report(client: httpx.Client, url: str) -> tuple[int, str]:
    resp = client.get(url)
    return resp.status_code, resp.text if resp.status_code == 200 else ""


def run(site: str, ua: str, api: str, story_id: str | None) -> dict[str, Any]:
    site = site.rstrip("/")
    with httpx.Client(headers={"User-Agent": ua}, timeout=30, follow_redirects=True) as client:
        home = page_report(client, f"{site}/")
        home.pop("_html")
        archive = page_report(client, f"{site}/archive")
        archive.pop("_html")
        radar = page_report(client, f"{site}/radar")
        radar_html = radar.pop("_html")
        radar["topics_in_html"] = radar_html.count("<details")
        story = story_report(client, site, api, story_id)

        robots_status, robots = text_report(client, f"{site}/robots.txt")
        sitemap_status, sitemap = text_report(client, f"{site}/sitemap.xml")
        llms_status, llms = text_report(client, f"{site}/llms.txt")

    return {
        "site": site,
        "user_agent": ua,
        "home": home,
        "archive": archive,
        "radar": radar,
        "story": story,
        "robots_txt": {
            "status": robots_status,
            "sitemap_line": bool(re.search(r"^sitemap:", robots, re.M | re.I)),
            "disallows_admin": "/admin" in robots,
            "names_ai_bots": sorted(b for b in ("GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot") if b in robots),
        },
        "sitemap_xml": {"status": sitemap_status, "urls": sitemap.count("<loc>")},
        "llms_txt": {
            "status": llms_status,
            "bytes": len(llms.encode()),
            "story_links": len(set(_STORY_HREF.findall(llms.replace("](", ' href="').replace(")", '"')))),
        },
    }


def print_report(r: dict[str, Any]) -> None:
    print(f"GEO crawler check — {r['site']}\nUA: {r['user_agent']}\n")
    for name in ("home", "archive", "radar", "story"):
        p = r[name]
        print(f"[{name}] {p.get('url', '')}")
        for k, v in p.items():
            if k != "url":
                print(f"    {k:24s} {v}")
    for name in ("robots_txt", "sitemap_xml", "llms_txt"):
        print(f"[{name}]")
        for k, v in r[name].items():
            print(f"    {k:24s} {v}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check what AI crawlers can read on Sipply")
    parser.add_argument("site", help="e.g. https://www.sipply.dev or http://localhost:3000")
    parser.add_argument("--ua", choices=sorted(USER_AGENTS), default="gptbot")
    parser.add_argument("--api", default=DEFAULT_API, help="API used to pick a story and its expected text")
    parser.add_argument("--story-id", default=None)
    parser.add_argument("--json", action="store_true", help="print JSON instead of text")
    args = parser.parse_args(argv)

    report = run(args.site, USER_AGENTS[args.ua], args.api.rstrip("/"), args.story_id)
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print_report(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
