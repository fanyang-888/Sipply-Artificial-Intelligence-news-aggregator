# 9. Tell search engines about new pages on every run

Date: 2026-10-16 (#107) · Status: Accepted

## Context
AI assistants with web search can only cite pages their search index holds; ChatGPT search and Copilot read Bing's index. Sipply waited for crawlers to find new stories.

## Decision
After every successful run (news stages ok), the pipeline submits to IndexNow (Bing, Yandex, Seznam, Naver, Yep): the hub pages, this week's recap, every story summarized or given new articles since the previous successful run, and the company pages those stories appear on. The key file is `public/<key>.txt` (public by design). Local and test runs never submit; `INDEXNOW_ENABLED=0` turns it off. Search Console / Bing Webmaster ownership tags come from env vars.

## Consequences
- New stories can be indexed within minutes of a run.
- A failure is recorded in the run's results and never fails the pipeline.
