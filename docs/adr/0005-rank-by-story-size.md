# 5. Rank the home page by how big the news is, not only by how well it was written up

Date: 2026-10-15 (#80) · Status: Accepted

## Context
The digest was ordered by `cluster_score`, which rewards a well-structured write-up. Research papers and newsletters scored high and often outranked the day's actual news.

## Decision
`app/services/home_ranking.py`: rank = (cluster_score + 0.25 × the matching radar topic's score) × recency decay, with at most two papers and one newsletter in the list, and the lead must be news. The email uses the same order. Personalization re-ranks from these scores on the client.

## Consequences
- Community attention (the radar) now lifts stories people are talking about.
- The weights are judgement, checked by simulation against a day's real digest, not learned.
