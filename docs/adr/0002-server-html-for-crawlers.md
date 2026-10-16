# 2. Ship the content in the server HTML; personalize on the client

Date: 2026-10-12 (#58, extended in #101) · Status: Accepted

## Context
AI assistants and search crawlers (GPTBot, ClaudeBot, PerplexityBot, Bingbot) mostly read raw HTML without running JavaScript. The first version fetched everything in the browser, so a crawler saw a page with no stories. At the same time, readers get a personalized order (by role and reading history).

## Decision
- Every page renders its full text on the server: the non-personalized digest on `/`, the whole story on `/cluster/[id]`, all 40 radar topic cards (hidden until selected), and the archive's newest 20 stories.
- Personalization re-ranks on the client after load; it never changes what the server HTML contains.
- Every page carries machine-readable context: `WebSite` + `Organization` JSON-LD (with a `SearchAction`), `NewsArticle` / `CollectionPage` / `BreadcrumbList` where they apply, canonical URLs, Open Graph images, plus `/sitemap.xml`, `/robots.txt` (AI crawlers explicitly allowed) and `/llms.txt`.
- `htmlLimitedBots` adds the AI crawlers so they get `<head>` metadata in the first response.

## Consequences
- Crawlers and readers see the same stories; the personalized order is a client-side refinement.
- Pages are heavier (see ADR 10), and hidden content must stay honest: it is the same text the reader sees after one click.
- What the server HTML contains has to be tested, not assumed (ADR 8).
