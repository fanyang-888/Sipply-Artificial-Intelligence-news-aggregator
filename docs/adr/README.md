# Architecture decision records

Short records of decisions that shaped Sipply: the context, what was decided, and what it costs. Format after Michael Nygard; one file per decision, never rewritten, superseded by a new record when a decision changes.

| # | Decision |
|---|---|
| [1](0001-two-hosts-one-api.md) | Frontend on Vercel, API and pipeline on Railway, one REST API between them |
| [2](0002-server-html-for-crawlers.md) | Ship the content in the server HTML; personalize on the client |
| [3](0003-cheap-models-first.md) | Local models first; pay for LLM calls only where they earn it |
| [4](0004-trend-radar-model.md) | Trend Radar: signals apart from articles, grouped locally, merged by a model judge |
| [5](0005-rank-by-story-size.md) | Rank the home page by how big the news is |
| [6](0006-no-self-assessment-in-public.md) | Public pages describe the world, never Sipply's own gaps |
| [7](0007-one-visual-language.md) | One visual language on every page; motion never takes over scrolling |
| [8](0008-test-what-crawlers-see.md) | What crawlers see is tested on a production build, in CI |
| [9](0009-tell-search-engines.md) | Tell search engines about new pages on every run |
| [10](0010-radar-page-weight-accepted.md) | Keep the radar page's weight for now |
