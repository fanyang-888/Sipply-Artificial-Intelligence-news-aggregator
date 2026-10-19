# 4. Trend Radar: signals apart from articles, grouped locally, merged by a model judge

Date: 2026-10-12 (#57), revised #64, #66, #98, 2026-10-18 · Status: Accepted

## Context
The radar shows what the AI community is discussing: ~5,000–7,000 posts over 14 days from Hacker News, Google News, YouTube, Bluesky, GitHub, DEV and Lobsters, grouped into topics.

## Decision
- Signals live in their own tables (`signals`, `signal_topics`), not in `articles`: the article path drops short bodies and pays for a summary of every row.
- Grouping is local: TF-IDF over titles + union-find, then a 0–100 score from volume, engagement, velocity, recency and relevance.
- **Merging duplicate topics** asks gpt-4o-mini whether two topics are the same story. Measured on 60 real topics, true duplicates had title-centroid similarity as low as 0.26 and different stories as high as 0.53, so no threshold works. Candidates are pairs with similarity ≥ 0.15 (top 40) **plus every pair already matched to the same Sipply story** (#98: a launch's news and its YouTube reviews share few words).
- **Rings by evidence, not score**: mainstream ≥ 15 signals; picking up 5–14 or ≥ 3 on two platforms; weak signal otherwise. Colour is momentum (new, rising, steady, cooling).
- **Only news is shown** (2026-10-18). The call that writes a topic's summary also says whether it is news; topics that are not (memes, AI art, teaser videos, prompt lists) are left off the public radar, the topic pages, briefs and answer checks. Every topic the page shows is judged, weak signals included, so a meme can't reach the page by score alone: on 2026-10-18 four of the top fifteen were. Unjudged topics still show.
- Radar stages are best-effort: their failure is recorded and alerted, but doesn't fail the news pipeline.

## Consequences
- About a tenth of a cent per run for merging; one log line per judged pair, so every merge can be audited.
- A single viral video can't reach the inner ring on its own.
