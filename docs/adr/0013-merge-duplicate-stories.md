# 13. One event, one story: duplicates are merged by a model judge, and old addresses redirect

Date: 2026-10-18 · Status: Accepted

## Context
Stories are built from articles that share words (TF-IDF, then a cross-day merge at title similarity ≥ 0.35). When outlets word one event differently, it becomes several stories. On 2026-10-18, 150 stories from four days included:
- three on Meta's news-scraping terms (The Verge's report, then TechCrunch and The Verge on Meta taking it back);
- two each on Google's Universal Cart, YouTube's AI-music labels, and Anthropic opening its models to outside evaluators;
- three on Meta's Muse model running on Macs.

Their title + summary similarity ran from 0.13 to 0.40. Two unrelated arXiv papers on flow matching scored 0.23, so no threshold separates them. Every story also has a permanent address that search engines already know (ADR 12), so a duplicate can't simply be deleted.

## Decision
- **A model judge on candidate pairs.** The new stage `merge_duplicate_stories` (`backend/app/services/story_merge.py`) runs after `dedup_clusters` and before `summarize`, the same pattern as the radar's topic merge (ADR 4):
  - Candidates: stories seen in the last 4 days, at most 3 days apart, with similarity ≥ 0.12, best first, 30 at most per run. Two research papers are never paired.
  - gpt-4o-mini answers one question per pair: do both report the same event? A later turn of the same incident counts as the same; separate announcements from one company, a launch and a later review, and two papers do not. When unsure, the answer is no.
  - A pair judged different is remembered (`clusters.meta.not_same_as`) and never asked again, so repeated asking can't eventually produce a wrong yes.
- **No merging along a chain.** If A matches B and B matches C, but A was judged different from C, the group is left apart.
- **The oldest published story is kept.** Its address is the one search engines know. The others' articles move into it, and it is summarized and translated again over all its sources in the same run.
- **Old addresses keep working.** A `story_redirects` row maps each merged story's old id and slug to the kept story:
  - The API answers for the old id and slug with the kept story, and the site redirects (308) because the slug differs. This covers `/story/…`, `/zh/story/…`, `/story/….md` and `/cluster/<id>`.
  - Redirects to a story that is later merged again are re-pointed, so there are no chains or dead ends.
  - Radar topics and answer checks that pointed at a merged story point at the kept one.
  - IndexNow submits the old address once, so engines see the redirect and drop the duplicate.
- **Merges can be audited and undone.** Each judged pair is logged with its verdict. Each redirect keeps a snapshot of the merged story (titles, summaries, slug, dates, article ids), so a wrong merge can be split back by hand.
- **The stage is best-effort.** If it fails or there's no API key, nothing is merged and the news pipeline continues.

## Consequences
- About a hundredth of a cent per run; after the first run, only pairs involving new stories are asked.
- A wrong "same" merges two stories until someone splits them back from the snapshot. The prompt and the "never ask twice" rule are there to keep that rare.
- The kept story's headline and summary are rewritten over more sources; its address doesn't change.
