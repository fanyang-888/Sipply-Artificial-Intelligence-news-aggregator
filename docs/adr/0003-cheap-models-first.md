# 3. Local models first; pay for LLM calls only where they earn it

Date: recorded 2026-10-16 · Status: Accepted

## Context
The budget is under $1 a day. Every ingested article needs a relevance score; only a few dozen stories a day need prose.

## Decision
- **Scoring** is a local TF-IDF + Ridge model trained on 422 GPT-labelled examples (Pearson r = 0.75), combined with rule-based recency and source authority: $0 per article, ~1 ms.
- **Filtering** is rule-based (keywords, length, dedup) before any model runs.
- **gpt-4o-mini** writes the summaries, takeaways, role angles and Chinese translations, and judges radar merges and coverage; each stage logs its cost.
- A paid feature is switched off when its value isn't shown: the AI-answer check (web search, $0.0176 a question, 0 citations of Sipply in its first run) is off unless `ANSWER_CHECKS_ENABLED=1` (#106). Revised 2026-10-18: it runs once a week (10 questions, about $0.80 a month), enough to see the trend for the price of a coffee; `ANSWER_CHECKS_ENABLED=off` stops it.
- A LoRA fine-tune of Qwen2.5-1.5B on 780 distilled examples (ROUGE-L 0.37) keeps a path open to drop the API for summaries.

## Consequences
- A full run costs about one to two cents; the email and radar stages included.
- Scoring quality is bounded by 422 labels; retraining is a script, not a service.
