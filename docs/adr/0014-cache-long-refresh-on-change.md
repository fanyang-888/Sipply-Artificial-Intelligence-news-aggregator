# 14. Pages are cached for long and rebuilt when a pipeline run changes them

Date: 2026-10-20 · Status: Accepted

## Context
On 2026-10-20 the Vercel Hobby plan showed "Exceeded free resources": 290K of 200K ISR write units a month, and 2 of 4 hours of active CPU. Vercel stores every rebuilt page, and a rebuild costs writes (8 KB units) whenever its output differs from the stored copy. Comparing production pages before and after a rebuild showed:

- **No two rebuilds of a page are the same.** The order of the framework's script chunks moves, and the API added "Updated 17h ago", the time to the second, and 14-day counts measured from now.
- **Every page was tied to a 5-minute lifetime.** The headline ticker in the layout and the story page's "next story" both read today's digest (300 s), so each of about 7,900 story pages (two languages) was rebuilt on any visit more than 5 minutes after the last one. That meant every crawler visit after the IndexNow submissions, and again after every pipeline run.
- **Each deploy empties the page cache**, so every merge started the rebuilds over.

## Decision
- **The ticker and "next story" load in the browser.** Story pages no longer depend on the digest. The ticker strip keeps its height while it loads, so nothing moves.
- **Long lifetimes, refreshed on demand** (`lib/api/cache-policy.ts`):
  - A story's data and pages live a week, tagged `story:<slug>` and `story-id:<id>`.
  - Everything that changes with a run (home, radar, topics, weeks, days, feeds, sitemap index) lives a day, tagged `run`.
  - After each successful run, the pipeline POSTs the changed tags to `/api/revalidate`: always `run`, plus every story it created, changed or merged away, the same stories IndexNow is told about. It authenticates with `REVALIDATE_SECRET`, set on Vercel production and the Railway cron service.
  - Tags expire at once, so the page warm-up and the crawlers IndexNow sends get the new pages.
- **The sitemap, news sitemap and RSS feed are cached the same way** (a day, `run` tag). Built per request, the 4 MB sitemap took 5-8 s of function time on every crawler visit. They are route handlers, and the sitemap is split. On Vercel, whatever is served at `/sitemap.xml` keeps its build-time copy, whether refreshed by tag or by path, as `app/sitemap.ts` or as a route handler, at 4 MB or at 2 KB. `/sitemaps/*` files are rebuilt like the feeds. So `/sitemap.xml` is an index that only names files: `/sitemaps/pages.xml`, `/sitemaps/stories-<n>.xml` (250 stories each, about 260 KB), and eight spare story files (valid, empty sitemaps) for the next 2,000 stories, so new stories show up without a deploy. It has no `<lastmod>`. Built by `lib/seo/sitemap.ts`.
- **Nothing on a page depends on the clock** where it can be avoided: the home page gets the UTC day, and `llms-full.txt` is dated by its newest story.
- **Changes are merged in batches**, because each production deploy rebuilds every visited page.

## Consequences
- A story page is rebuilt when its story changes, or at most weekly. Hub pages are rebuilt about four times a day.
- If the revalidate call fails, which the run records as `revalidate_site` and alerts on, pages refresh when their lifetime ends: a day for hubs, a week for stories.
- A story's related-stories list on its page can lag by up to a week, unless the story itself changes.
