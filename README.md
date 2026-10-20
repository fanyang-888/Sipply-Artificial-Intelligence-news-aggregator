<div align="center">

<img src="public/logo.png" width="72" alt="" />

# Sipply

**Sip AI News Simply.** A bilingual AI news brief and a trend radar of what the AI community is discussing, built and run end to end by one person.

[**www.sipply.dev**](https://www.sipply.dev) · [Trend Radar](https://www.sipply.dev/radar) · [Archive](https://www.sipply.dev/archive) · [Weekly recaps](https://www.sipply.dev/weekly)

[![CI](https://github.com/fanyang-888/personal-ai-intelligence-tool/actions/workflows/ci.yml/badge.svg)](https://github.com/fanyang-888/personal-ai-intelligence-tool/actions/workflows/ci.yml)

</div>

![Sipply home page: today's lead story in large serif type on a dark page, with the category, a summary and why it matters](docs/images/home.jpg)

Four times a day a pipeline reads 11 AI news feeds and 7 community platforms, scores and groups the articles into stories, writes a summary of each for three kinds of reader, translates everything into Chinese, and updates a Trend Radar of the topics people are talking about. Nobody touches it between runs.

| | |
|---|---|
| **Stories written** | 3,805 |
| **Signals on the radar** | 7,852 posts, articles and videos from the last 14 days |
| **Sources** | 11 news feeds · 7 community platforms |
| **Pipeline** | 4 runs a day, about 5 minutes each, no manual steps |
| **Languages** | English and Chinese, on every page |
| **LLM spend** | under $1 a day: scoring and grouping run on local models, gpt-4o-mini only writes |
| **Tests** | 360 backend · 88 frontend · 140 smoke checks of the built site, all in CI |
| **Lighthouse** (mobile) | Accessibility 100 · Best practices 100 · SEO 100 · Performance 94–99 |

<sub>Numbers from 2026-10-16.</sub>

## Highlights

- **A trained scorer instead of LLM calls.** A TF-IDF + Ridge model trained on 422 GPT-labelled articles predicts audience fit, practical relevance and novelty (Pearson r up to 0.75). Scoring costs nothing per run and scales with volume.
- **An unattended production pipeline.** Ingest, filter, score, cluster, track status, merge stories across days, summarize, translate, then the Trend Radar stages. Each stage is timed and isolated, and a failure emails the operator.
- **A Trend Radar.** Signals from Hacker News, Google News, YouTube, Bluesky, GitHub, DEV and Lobsters are grouped into topics, scored, placed by evidence and momentum, summarized, and linked to Sipply's story on each topic when there is one.
- **Readable by AI assistants (GEO).** Every page ships its content in the server HTML with JSON-LD, and new pages are pushed to search engines through IndexNow after each run. A smoke test in CI reads the built site the way a crawler does.
- **A fine-tuned small model.** Qwen2.5-1.5B with LoRA on 780 distilled GPT-4o-mini examples (ROUGE-L 0.37), a path off the paid API.

---

## Screenshots

| | |
|---|---|
| ![Today's stories as a carousel of cards with category tabs](docs/images/today.jpg) | ![What the AI community is talking about: the top three radar topics with sparklines](docs/images/community.jpg) |
| **Today:** one story per swipe, by category | **The community:** the top radar topics on the home page |
| ![A story page in Chinese, light theme, with the English title underneath](docs/images/story-zh-light.jpg) | ![The archive: stories by day with category, source and score](docs/images/archive.jpg) |
| **Story page:** Chinese, light theme | **Archive:** every story, by day, searchable |
| ![The OpenAI topic page with its stories and the radar topics that mention it](docs/images/topic.jpg) | ![Weekly recaps with each week's top stories and a story-count sparkline](docs/images/weekly.jpg) |
| **Topic pages:** a company's stories and radar topics | **Weekly recaps:** the top stories of each week |

<p align="center">
  <img src="docs/images/phone-home.jpg" width="250" alt="Home page on a phone" />
  &nbsp;
  <img src="docs/images/phone-story.jpg" width="250" alt="A story page on a phone" />
  &nbsp;
  <img src="docs/images/phone-radar.jpg" width="250" alt="The Trend Radar on a phone" />
</p>

---

## Architecture

```mermaid
flowchart TB
    READERS(["Readers"])
    BOTS(["Search engines and AI crawlers"])

    subgraph VC["Vercel"]
        WEB["Next.js 16<br/>server-rendered pages · sitemap · robots.txt · llms.txt"]
    end

    subgraph RW["Railway"]
        direction LR
        API["FastAPI<br/>REST API"]
        PG[("PostgreSQL")]
        REDIS[("Redis<br/>5-minute cache")]
        CRON["Pipeline cron<br/>02 · 08 · 14 · 20 UTC"]
        API --> REDIS
        API --> PG
        CRON --> PG
    end

    subgraph OUT["Services the pipeline calls"]
        direction LR
        OPENAI["OpenAI<br/>gpt-4o-mini"]
        RESEND["Resend<br/>digest and operator email"]
        INDEXNOW["IndexNow<br/>Bing · Yandex · Naver"]
    end

    subgraph SRC["Sources"]
        direction LR
        NEWS["11 news feeds<br/>RSS and HTML"]
        COMM["7 community platforms<br/>HN · Google News · YouTube · Bluesky<br/>GitHub · DEV · Lobsters"]
    end

    READERS --> WEB
    BOTS --> WEB
    WEB -- "REST" --> API
    SRC --> CRON
    CRON --> OUT
```

Two paths meet in PostgreSQL. Readers and crawlers get pages from Next.js on Vercel, which reads the FastAPI service on Railway; the API is stateless and Redis holds its hot responses for five minutes. The cron job collects, writes and publishes into the same database, then clears the cache. Pages are rendered on the server, so readers and crawlers get the full content in the HTML and the client only re-ranks for the reader's role. Why it is split this way: [ADR 1](docs/adr/0001-two-hosts-one-api.md), [ADR 2](docs/adr/0002-server-html-for-crawlers.md).

## Pipeline

Railway cron runs `backend/scripts/run_pipeline.py` at 02:00, 08:00, 14:00 and 20:00 UTC.

```mermaid
flowchart TB
    subgraph N["News: a failure here stops the run"]
        direction LR
        A1["Ingest<br/>RSS and HTML,<br/>ETag gate"] --> A2["Filter<br/>keywords, length,<br/>hash dedup"] --> A3["Score<br/>rules +<br/>TF-IDF Ridge"] --> A4["Cluster<br/>TF-IDF cosine"] --> A5["Status and<br/>cross-day merge"] --> A5b["Merge duplicates<br/>model judge"] --> A6["Summarize<br/>gpt-4o-mini,<br/>3 reader roles"] --> A7["Translate<br/>into Chinese"]
    end

    subgraph R["Trend Radar: best effort, a failure is logged"]
        direction LR
        B1["Fetch signals<br/>7 platforms"] --> B2["Build topics<br/>group and score"] --> B3["Merge duplicates<br/>GPT judges pairs"] --> B4["Translate<br/>titles"] --> B5["Describe topics<br/>summary and<br/>Sipply's story"] --> B6["Write briefs<br/>for the editor"]
    end

    subgraph D["After a successful run"]
        direction LR
        C1["Clear the<br/>Redis cache"] --> C2["Rebuild the<br/>site's pages"] --> C3["Send changed URLs<br/>to IndexNow"]
    end

    N --> R --> D
    R -. "20:00 run" .-> MAIL["Digest email<br/>to subscribers"]
    D --> OPS["Operator email<br/>on a failed stage,<br/>daily summary at 20:00"]
```

Every stage is a standalone script in `backend/scripts/`; `run_pipeline.py` runs them in order, times each one, and records the result in `pipeline_runs` (shown at `/admin/pipeline-runs`). The radar stages depend on outside APIs, so their failures are logged without failing the news. A paid "what do AI assistants cite" check runs once a week, about $0.80 a month (`ANSWER_CHECKS_ENABLED`). After a successful run the pipeline tells the site which cached pages changed (`/api/revalidate`), so pages can be cached for a day (stories a week) instead of being rebuilt on every visit ([ADR 14](docs/adr/0014-cache-long-refresh-on-change.md)).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/chart-run-time-dark.svg" />
  <img src="docs/images/chart-run-time-light.svg" width="720" alt="Where a pipeline run spends its time, median seconds per stage: summarize stories 83, translate stories 59, fetch community signals 48, brief radar topics 23, describe radar topics 22, translate signals 21, fetch full articles 7, merge radar topics 6, build radar topics 6, everything else 2" />
</picture>

---

## Trend Radar

[www.sipply.dev/radar](https://www.sipply.dev/radar) shows what the AI community discussed over the last 14 days. Code: `backend/app/signals/`, `app/radar/`, `components/radar/`.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/radar.jpg" />
  <img src="docs/images/radar-light.jpg" alt="The Trend Radar: topics as numbered dots on three rings and seven category sectors, with the top topic's card: summary, signal counts, a 14-day trend and its score" />
</picture>

```mermaid
flowchart LR
    P["Posts, articles, videos<br/>with points, comments, views"] --> G["Group by title<br/>TF-IDF + union-find"]
    G --> M["Merge same-story groups<br/>similarity proposes, GPT decides"]
    M --> S["Score 0–100<br/>volume · engagement · velocity<br/>recency · relevance"]
    S --> RING["Ring by evidence<br/>mainstream · picking up · weak signal"]
    S --> MOM["Color by momentum<br/>new · rising · steady · cooling"]
    RING --> PAGE["The radar page"]
    MOM --> PAGE
```

**Signals.** Each run pulls posts, articles and videos with their engagement numbers: Hacker News (Algolia search), Google News (RSS search), YouTube (Data API), Bluesky, GitHub (new repos by stars), DEV and Lobsters. Keyed sources are skipped until their key is set; Threads is wired up but waits on Meta's approval. Keywords and limits live in `backend/app/signals/signal_sources.yaml`.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/chart-signals-dark.svg" />
  <img src="docs/images/chart-signals-light.svg" width="720" alt="Trend Radar signals by platform over the last 14 days: News 5,443 (69%), Hacker News 865 (11%), Bluesky 687 (9%), YouTube 613 (8%), DEV 90, Lobsters 85, GitHub 69 (1% each)" />
</picture>

**Topics.** Titles are grouped with the same TF-IDF + union-find as the news clusters (threshold tuned on real HN data; big, loose groups are split again). Word overlap misses one story told in different words, so likely duplicate pairs go to gpt-4o-mini, which decides whether to merge them. Each topic gets a 0–100 score:

| Component | Weight | What it measures |
|---|---|---|
| Volume | 25% | Signal count, plus a bonus for appearing on several platforms |
| Engagement | 25% | Points, comments, likes (log-scaled) |
| Velocity | 25% | Daily rate over the last 3 days against the 11 before |
| Recency | 10% | Age of the newest signal |
| Relevance | 15% | The article relevance model on the topic label |

**On the page.** Rings show evidence: *mainstream* (15+ signals), *picking up* (5–14, or 3+ on two platforms), *weak signal* (the rest). Sectors are the site's categories. Color is momentum: *new* (only in the last 3 days), *rising* (discussed before, now clearly faster), *steady or cooling*. Each topic card has an AI summary in both languages, the score split, a 14-day trend, the platform mix, the top posts, and Sipply's story on the topic when there is one (TF-IDF picks candidates, GPT confirms the match). The same call says whether a topic is news at all; memes, AI art and teaser videos are left off. How the model was chosen: [ADR 4](docs/adr/0004-trend-radar-model.md).

---

## Readable by AI assistants (GEO)

AI assistants and search engines should be able to read, find and cite Sipply:

- **Content in the HTML.** The home page, story pages, archive, topics, weekly recaps and the radar ship their full text in the server HTML; a reader's personalization re-ranks on the client.
- **Structured data.** `NewsArticle` JSON-LD on story pages with the original sources, `ItemList` on the home page, `CollectionPage` and `BreadcrumbList` on the hubs.
- **Machine entry points.** `/sitemap.xml` (every story, rendered per request), `/news-sitemap.xml` (a Google News sitemap of the last 48 hours), `/feed.xml` (RSS of the 50 newest stories, linked from every page), `/robots.txt` (AI crawlers explicitly allowed, `/admin` and `/api/` disallowed), `/llms.txt` and `/llms-full.txt` (the 50 newest stories in full). Every story also has a markdown copy at its address plus `.md` (English then Chinese), declared in its `<head>` with `rel="alternate" type="text/markdown"`.
- **Chinese at its own address.** Every page has a server-rendered Chinese twin under `/zh` (`/zh/story/…`, `/zh/radar`, …) with `<html lang="zh-CN">`, Chinese titles and structured data; each page names the other with `hreflang`, and both are in the sitemap. Before this, crawlers saw two Chinese characters on the home page ([ADR 12](docs/adr/0012-a-url-per-language.md)).
- **A page per day.** `/daily/2026-10-18` lists every story that first appeared that day, news first; its title reads "AI news today, October 18, 2026" on the day and "AI news, …" after. AI search cites dated round-ups like this for "AI news today" questions (audit of 2026-10-18).
- **Metadata for crawlers that don't run JavaScript.** `htmlLimitedBots` includes GPTBot, ClaudeBot, PerplexityBot and OAI-SearchBot, so they get the `<head>` metadata in the HTML.
- **IndexNow** (`backend/app/services/indexnow.py`). After every successful run the new and updated story pages, the topic pages they appear on, today's day page and the hub pages go to `api.indexnow.org` (Bing, Yandex, Seznam, Naver, Yep). Bing's index feeds ChatGPT search and Copilot, so a new story is findable within minutes. The key file is `public/<key>.txt`; local and test runs never submit. See [ADR 9](docs/adr/0009-tell-search-engines.md).
- **Search Console and Bing Webmaster.** Set `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` in Vercel and the ownership `<meta>` tags appear on every page.
- **Tested in CI.** The smoke job builds the site, starts it, and reads every kind of page as GPTBot would: titles, canonical URLs, JSON-LD, story links in the HTML, share images, sitemap, robots.txt, llms.txt, a real 404 and a noindex admin. See [ADR 8](docs/adr/0008-test-what-crawlers-see.md).
- **Citation tracking** (`backend/app/signals/answers.py`, once a week). Monday's 14:00 UTC run asks OpenAI's Responses API with web search the question a reader would ask about each top radar topic (gpt-4.1-mini, about $0.018 a question, 10 questions, about $0.80 a month) and records the answer and the sources it cited. The results are for the operator; public pages describe the world, not Sipply's own standing ([ADR 6](docs/adr/0006-no-self-assessment-in-public.md)).

---

## Operations and quality

| What | How |
|---|---|
| Failure alerts | A failed stage emails `ALERT_EMAIL` with what failed and whether the site was updated (`backend/app/services/alerts.py`) |
| Daily summary | The 20:00 run emails every run of the last 24 hours, new stories, and URLs sent to search engines |
| Run log | `pipeline_runs` table, per-stage status and timing, shown at `/admin/pipeline-runs` |
| CI on every pull request | Migrations on an empty Postgres + 360 pytest tests; typecheck, lint with zero warnings, 88 vitest tests; a production build read by the 140-check smoke test, then loaded in Chrome on a throttled phone to check it shows at once and doesn't move |
| Lighthouse (mobile, 2026-10-16) | Home, story, archive and radar: accessibility, best practices and SEO 100; performance 94–99; layout shift 0.001. Pages are readable before any JavaScript runs ([ADR 11](docs/adr/0011-visible-without-javascript.md)) |
| Decisions | Fourteen [architecture decision records](docs/adr/README.md): context, decision and cost of each choice |

---

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Next.js 16, TypeScript, Tailwind CSS | App Router and server components: content in the HTML |
| Backend | FastAPI, SQLAlchemy 2, Alembic, psycopg3 | Typed, with proper migrations |
| Database | PostgreSQL | Relational + full-text search |
| Cache | Redis | Simple TTL cache; the API works without it |
| ML scoring | scikit-learn (TF-IDF + Ridge) | Three relevance dimensions; trained on 422 GPT-labelled examples |
| LLM fine-tune | Qwen2.5-1.5B + LoRA | 780 summarization examples; ROUGE-L 0.37 against GPT-4o-mini |
| AI | OpenAI gpt-4o-mini | Summaries, translation, radar descriptions and merges |
| Email | Resend | Subscriber digest and operator alerts |
| Search engines | IndexNow | New pages announced after each run |
| Deployment | Vercel + Railway | Frontend CDN; managed Postgres, Redis and cron |
| i18n | `app/[lang]` + `proxy.ts`, custom `useI18n()` | English at the root, Chinese under /zh, both server-rendered; type-checked translation keys, no dependency |

---

## Features

| | |
|--|--|
| Auto-ingestion | 11 sources, 4× a day; incremental via HTTP ETag and a per-source poll interval |
| Smart filtering | Rule-based gate (keywords, length, dedup) removes off-topic articles at zero API cost |
| ML signal scoring | 0–100: rule-based dimensions (recency, source authority) + the TF-IDF Ridge model |
| Story clustering | TF-IDF + cosine similarity groups related articles into stories |
| Related stories | Worked out for every recent story once per run (one TF-IDF fit, a few seconds) and stored, so a story request reads them instead of comparing against thousands of stories |
| Cross-day dedup | Stories that evolve across days are merged, not duplicated |
| One event, one story | When outlets word one event differently, gpt-4o-mini confirms the duplicate and the stories merge; old addresses redirect ([ADR 13](docs/adr/0013-merge-duplicate-stories.md)) |
| Role personalization | PM / Developer / Student lenses with their own "why it matters" |
| Bilingual | Title, summary, takeaways and why-it-matters translated into Chinese |
| Ranking | By how big the news is, then recency: `score × e^(-0.15 × age_days)` ([ADR 5](docs/adr/0005-rank-by-story-size.md)) |
| Email digest | Daily, to subscribers, on the 20:00 UTC run |
| Home page | Four full-screen panels: the lead story, today's stories as a carousel, what the community is discussing, this week and the email |
| Archive, topics, weekly | Every story by day with search; a page per company or model; a recap per week |
| Share images | Generated per page with `next/og` (site, stories, topics, weeks) |
| Dark and light themes | Separate token sets, not an inversion; preference remembered |

---

<details>
<summary><b>ML scoring model</b></summary>

Three dimensions of the signal score used to be hardcoded at 3.0. A TF-IDF + Ridge Regression model now predicts them, covering 44% of the score's weight.

```
422 articles (production DB)
    → GPT-4o-mini labels audience_fit / practical_relevance / novelty (1-5)
    → TF-IDF (unigrams + bigrams, 30k features) + Ridge Regression
    → 5-fold cross-validation
    → models/scorer.pkl
```

5-fold cross-validation on 422 labelled examples:

| Dimension | Pearson r | MAE | vs. mean baseline |
|-----------|-----------|-----|-------------------|
| audience_fit | 0.75 | 0.71 | +40% |
| practical_relevance | 0.69 | 0.73 | +32% |
| novelty | 0.71 | 0.62 | +36% |

Inference takes about 1 ms (an LLM call takes about 1 s) at no marginal cost. Without `models/scorer.pkl` it falls back to 3.0, so a deploy never breaks on it.

```bash
# from backend/
python -m scripts.label_for_training --output data/labels.jsonl --limit 600
python -m scripts.train_scorer --labels data/labels.jsonl --output models/scorer.pkl
```

</details>

<details>
<summary><b>LLM fine-tune (Qwen2.5-1.5B + LoRA)</b></summary>

Qwen2.5-1.5B-Instruct fine-tuned on Sipply's summarization task, as an experimental replacement for GPT-4o-mini.

```
780 examples (422 article + 358 cluster summarization pairs)
    → GPT-4o-mini outputs as labels
    → LoRA (r=16) on a free Google Colab T4, about 56 minutes, 2 epochs
    → models/qwen-adapter/
```

| Metric | Score |
|--------|-------|
| ROUGE-1 | 0.505 |
| ROUGE-2 | 0.227 |
| ROUGE-L | 0.366 |

Evaluated on 156 held-out examples against GPT-4o-mini outputs.

```bash
python -m scripts.export_finetune_data --output-dir data/   # then run finetune_qwen.ipynb in Colab
```

</details>

<details>
<summary><b>Data sources</b></summary>

News sources (`backend/app/source_catalog/trusted_sources.yaml`):

| Source | How | Cadence |
|--------|-----|---------|
| OpenAI News | RSS; the feed summary is the body (article pages block automated requests) | every 60 min |
| Anthropic Newsroom | HTML (newsroom cards, incl. model launches) | every 60 min |
| Google DeepMind Blog | RSS (HTML fallback) | every 120 min |
| Hugging Face Blog | RSS | every 60 min |
| arXiv cs.AI + cs.LG | RSS | daily |
| The Verge AI | RSS | every 30 min |
| Ars Technica AI | RSS | every 60 min |
| TechCrunch AI | RSS | every 30 min |
| The Register AI | RSS | every 60 min |
| Import AI (newsletter) | RSS | daily |

Turned off, with the reason in the YAML: VentureBeat AI (feed stopped updating, 429), AI News (bot challenge), TLDR AI (no readable text), Meta AI Blog (rendered by JavaScript). Trend Radar sources are listed [above](#trend-radar).

</details>

<details>
<summary><b>Design</b></summary>

One visual language on every page, public and admin, set in `app/globals.css` (tokens) and `lib/ui/classes.ts` (type and control styles); see [ADR 7](docs/adr/0007-one-visual-language.md).

- **Stage**: a near-black page (`#080c12`) with one light, a soft beam behind each page's title; the light theme is its own token set (white cards on `#f5f8ff`).
- **Type**: Fraunces for headlines, DM Sans for reading, IBM Plex Mono in small capitals for metadata only. All self-hosted with `next/font`.
- **Surfaces**: glass panels (`.sp-glass`: translucent fill, 20px radius, a 1px gradient edge) holding rows separated by hairlines; pills for inputs and buttons; one accent color for links, the active tab and status dots.
- **Home**: four full-viewport panels, each with one focal point and one action. Panels below the fold fade up once as they enter; the server HTML is complete without JavaScript, and reduced motion turns the effect off.
- **Rules of thumb** (after Meng To's design notes and Tufte): one focal point per viewport; mono labels for metadata, never body text; a surface or an effect has a job or it goes; nothing fake.

</details>

<details>
<summary><b>Project layout</b></summary>

```
├── app/                    Next.js pages (digest, story, archive, topics, weekly, radar, admin) + sitemap/robots/llms.txt
├── components/             UI components (home panels, story view, archive, topics/weekly, radar, shared states)
├── lib/
│   ├── api/                Typed backend API client (+ server-side fetchers)
│   ├── i18n/               EN/ZH strings with typed keys
│   ├── seo/                Site URL, JSON-LD, llms.txt, share-image card
│   ├── ui/                 Shared class strings: titles, labels, tabs, inputs, buttons
│   └── utils/              Pure helpers (radar layout and filters, archive URLs...)
├── scripts/                smoke.mjs (crawler-view checks), stability.mjs (paint and layout shift in Chrome), readme-charts.mjs (the charts above)
├── docs/                   adr/ decision records, images/ for this README
└── backend/
    ├── app/
    │   ├── adapters/       Per-source scrapers (RSS, HTML, arXiv, OpenAI, DeepMind...)
    │   ├── api/routes/     FastAPI route handlers
    │   ├── models/         SQLAlchemy ORM models
    │   ├── services/       Pipeline logic (ingest, cluster, summarize, IndexNow, alerts...)
    │   ├── signals/        Trend Radar: sources, topics, merge, descriptions
    │   └── source_catalog/ trusted_sources.yaml: add new sources here
    ├── data/               Training data (labels.jsonl, finetune_train/eval.jsonl)
    ├── models/             Trained artifacts (scorer.pkl, qwen-adapter/)
    ├── migrations/         Alembic migration history
    └── scripts/            Pipeline stage scripts + ML training scripts
```

</details>

<details>
<summary><b>Local development and tests</b></summary>

**Frontend**

```bash
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev          # http://localhost:3000
```

**Backend**

```bash
cd backend/
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL + OPENAI_API_KEY
alembic upgrade head
uvicorn app.main:app --reload   # http://localhost:8000
```

**Run the pipeline**

```bash
cd backend/
python -m scripts.run_pipeline --triggered-by manual   # all stages
python -m scripts.summarize                            # or one stage
```

**Tests**

```bash
# Frontend
npm run typecheck && npm run lint && npm test

# Backend: DB tests need a local Postgres at alembic head; they run in a rolled-back
# transaction and refuse any host but localhost
cd backend/ && pip install -r requirements-dev.txt
TEST_DATABASE_URL=postgresql+psycopg://pait:pait@localhost:5432/pait_test pytest

# Smoke test of a running build, or of production
npm run build && npx next start -p 3000 &
npm run smoke -- http://localhost:3000
npm run smoke -- https://www.sipply.dev
# Paint timing and layout shift in Google Chrome on a throttled phone (needs Chrome installed)
npm run stability -- http://localhost:3000

# Redraw the README charts from the live API
node scripts/readme-charts.mjs
```

</details>

<details>
<summary><b>Deployment</b></summary>

**Backend (Railway):** two services sharing one Postgres and one Redis.

| Service | Config | Schedule |
|---------|--------|----------|
| `personal-ai-intelligence-tool` | `railway.toml` | Always-on API |
| `daily-pipeline-cron` | `railway.cron.toml` | 02:00, 08:00, 14:00, 20:00 UTC (email on the 20:00 run) |

On startup `alembic upgrade head` runs in a background thread, so Railway's health check passes immediately.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (`postgresql+psycopg://...`) |
| `OPENAI_API_KEY` | gpt-4o-mini: summaries, translation, radar |
| `RESEND_API_KEY` | Email delivery |
| `ALERT_EMAIL` | Operator emails: a failed stage, and a 24-hour summary on the 20:00 run (none while unset) |
| `ANSWER_CHECKS_ENABLED` | The paid AI-answer check runs every Monday by default; `1` makes it daily, `off` stops it |
| `MALLOC_ARENA_MAX` | `2` on the API service: one memory arena per thread let the API grow from about 0.6 to 1.5 GB a day (glibc; FastAPI runs sync endpoints on up to 40 threads) |
| `REVALIDATE_SECRET` | Shared by Vercel (production) and the cron service: lets the pipeline mark changed pages for rebuilding ([ADR 14](docs/adr/0014-cache-long-refresh-on-change.md)) |
| `REDIS_URL` | Set by the Railway Redis plugin |
| `JWT_SECRET` | Signs admin tokens |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_SECRET` | Admin login |
| `YOUTUBE_API_KEY` | Trend Radar YouTube source (optional) |
| `BLUESKY_HANDLE` / `BLUESKY_APP_PASSWORD` | Trend Radar Bluesky source (optional; an app password) |
| `THREADS_ACCESS_TOKEN` | Trend Radar Threads source (optional; needs Meta's approval) |

**Frontend (Vercel):** deploys from GitHub. `NEXT_PUBLIC_API_URL` points at the Railway API; `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` are optional.

</details>

<details>
<summary><b>API highlights</b></summary>

```bash
GET  /api/digest/today                 # featured story + top stories; ?device_id=&role= re-ranks per reader
GET  /api/clusters?limit=20&offset=0   # all stories, ranked
GET  /api/clusters/{id}                # one story with its source articles and related stories
GET  /api/clusters/index               # every story id + last update (feeds the sitemap)
GET  /api/search?q=GPT-5&type=cluster  # full-text search
GET  /api/radar?limit=40               # Trend Radar topics, rings, momentum, summaries, top posts, questions
GET  /api/pipeline-runs?limit=20       # the run log
POST /api/subscribe  {"email": "..."}  # email digest
GET  /docs                             # interactive docs
```

</details>

---

## Design decisions worth noting

The full reasoning is in the [decision records](docs/adr/README.md). A few that surprise people:

**Why TF-IDF and not embeddings for clustering?** It runs locally with no API calls and works well on short article excerpts. Embeddings would catch the same story told in different words; for the radar, a small GPT judge does that on candidate pairs instead.

**Why ask GPT whether two radar topics are the same story?** Measured on 60 real topics: true duplicates scored as low as 0.26 in title similarity while different stories reached 0.53, so no threshold separates them. Similarity proposes pairs cheaply; one small GPT request decides.

**Why rings by evidence instead of by score?** A single viral YouTube video can score as high as a story covered by 40 outlets. Rings use how many signals, on how many platforms, back a topic; the score only orders topics inside a ring.

**Why incremental RSS ingestion?** Each source has its own poll interval, and feeds are fetched with `If-None-Match`, so an unchanged feed costs an HTTP 304 and no parsing.

**Why test the built site instead of components?** The two bugs that hurt crawlers most (a page whose HTML held a loading skeleton, and escaped entities in titles) passed every unit test. The smoke test reads the production build's HTML in CI.
