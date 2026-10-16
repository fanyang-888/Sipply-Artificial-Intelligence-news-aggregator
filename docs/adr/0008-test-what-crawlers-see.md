# 8. What crawlers see is tested on a production build, in CI

Date: 2026-10-16 (#102, #108) · Status: Accepted

## Context
After the archive was server-rendered (#101), the live HTML still had no stories: a client component that reads `useSearchParams()` makes a static (ISR) render bail out to its Suspense fallback. Dev renders every request dynamically, so local checks, unit tests and `tsc` all passed.

## Decision
- Pages whose client part reads the URL render per request (`dynamic = "force-dynamic"`); their data keeps its fetch cache.
- `scripts/smoke.mjs` fetches every kind of page as raw HTML and checks titles, canonicals, JSON-LD types, story links in the HTML, double-escaped entities, the 404, admin `noindex`, share images, sitemap, robots and llms.txt (83 checks).
- A CI job builds the site against the live API, serves it with `next start` and runs the script on every PR. If the API is down it warns and skips rather than failing.

## Consequences
- A page that ships a skeleton instead of its content fails the PR.
- CI depends on the production API being up (read-only GETs), like Vercel's preview builds.
