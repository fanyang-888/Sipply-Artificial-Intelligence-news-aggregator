# Sipply — Sip AI News Simply

> **Sip** your morning news. **Supply** yourself with signal, not noise.

**Problem:** AI professionals lose hours daily sifting 10+ publications to find decision-relevant signal.

**Solution:** A production pipeline that ingests, scores, clusters, and summarises AI news into a role-personalised daily brief — automatically, bilingually, at under $1/day.

- Replaced LLM-based scoring with a trained TF-IDF + Ridge model (422 GPT-labelled examples, Pearson r=0.75), cutting per-run inference cost to $0 while covering 44% of the relevance signal — enabling the system to scale to any volume without API cost growth
- Shipped a production pipeline (ingest → filter → ML score → cluster → status → cross-day dedup → summarise → translate → email, plus the Trend Radar stages) running 4× a day on Railway, serving real users a bilingual EN/ZH digest with zero manual intervention
- Built a **Trend Radar** that groups the last 14 days of community and news signals (~5,000: Hacker News, Google News, YouTube, Bluesky, GitHub, DEV, Lobsters) into scored topics, places them by evidence and momentum, and flags the ones Sipply hasn't covered yet
- Made the site **readable by AI assistants (GEO)**: server-rendered stories with JSON-LD, a live sitemap, `robots.txt` and `llms.txt`, checked with a crawler script
- Fine-tuned Qwen2.5-1.5B via LoRA on 780 knowledge-distilled GPT-4o-mini examples (ROUGE-L = 0.37), validating a path to eliminate LLM API dependency entirely at production scale

**Live:** [www.sipply.dev](https://www.sipply.dev) · Trend Radar: [www.sipply.dev/radar](https://www.sipply.dev/radar)

---

## Why I built this

The AI space moves faster than any newsletter can keep up with. I wanted a tool that:
- **Aggregates** every major AI publication automatically
- **Filters** noise from signal with a fast rule-based gate, then ranks by a trained ML scorer
- **Clusters** related stories so you see the thread, not just individual articles
- **Personalises** the angle depending on whether you're a PM, engineer, or student
- **Translates** everything to Chinese for bilingual readers

So I built it — including the ingestion pipeline, the ML scoring model, the LLM processing chain, the REST API, and the frontend.

---

## Features

| | |
|--|--|
| Auto-ingestion | Fetches articles from 11 active sources 4× a day via Railway cron; incremental via HTTP ETag + poll-frequency gate |
| Smart filtering | Rule-based gate (keyword match + length + dedup) removes off-topic articles at zero API cost |
| ML signal scoring | Composite 0-100 score: rule-based dimensions (recency, source authority) + TF-IDF Ridge model predicting audience fit, practical relevance, and novelty |
| Story clustering | TF-IDF + cosine similarity groups related articles into story threads |
| Cross-day dedup | Stories that evolve across days are merged, not duplicated |
| Role personalisation | PM / Developer / Student lenses with tailored "why it matters" context |
| Bilingual | Every field (title, summary, takeaways, why it matters) auto-translated to Chinese |
| Email digest | Daily digest sent to subscribers via Resend, on the 20:00 UTC run only |
| Home page | Four full-screen panels: the lead story, today's stories as a sideways carousel (category tabs: models, research, funding, products, policy & safety, open source & infra), what the AI community is discussing, this week + the email |
| One visual language | Fraunces headlines, mono micro-labels, glass panels and one accent on every page (`lib/ui/classes.ts`, `PageHeader`) |
| Trend Radar | Community and news signals grouped into topics; rings by evidence, color by momentum, AI summaries, Sipply coverage — see [Trend Radar](#trend-radar) |
| Readable by AI assistants | Server-rendered pages, JSON-LD, sitemap, `robots.txt`, `llms.txt` — see [GEO](#readable-by-ai-assistants-geo) |
| Dark / light mode | Theme toggle with localStorage persistence; all colours via CSS custom properties |
| Recency ranking | Digest ranks stories by `score × e^(-0.15 × age_days)` — fresh beats stale |
| Full-text search | Archive search across all clusters and articles |
| SEO / Open Graph | Per-page `<title>`, `og:` tags and generated share images (`opengraph-image.tsx`) for the site, stories, topics and weeks |

---

## Architecture

![System Architecture](docs/System_Architecture.png)

The backend is **stateless**. All state lives in PostgreSQL. Redis caches hot endpoints (5-min TTL) and is busted after each successful pipeline run.

## Pipeline

Railway cron runs `scripts/run_pipeline.py` at **02:00, 08:00, 14:00 and 20:00 UTC**; the digest email goes out on the 20:00 run only.

```mermaid
flowchart LR
    SRC["News sources\n11 feeds"]
    SIG["Community sources\nHN · Google News · YouTube\nBluesky · GitHub · DEV · Lobsters"]

    subgraph COLLECT["Data Collection"]
        direction TB
        S1["1 · Ingest\nRSS + HTML\nETag gate"]
        S2["2 · Filter\nKeyword + length\n+ hash dedup"]
        S1 --> S2
    end

    subgraph SCORE["Scoring & Clustering"]
        direction TB
        S3["3 · Score\nRule-based +\nTF-IDF Ridge ML"]
        S4["4 · Cluster\nCosine similarity\ngreedy merge"]
        S5["5 · Status\nnew / escalating\npeaking / fading"]
        S6["6 · Dedup\nCross-day\nstory merge"]
        S3 --> S4 --> S5 --> S6
    end

    subgraph GENERATE["LLM Generation"]
        direction TB
        S7["7 · Summarize\nGPT-4o-mini\n3-role context"]
        S8["8 · Translate\nClusters to ZH"]
        S7 --> S8
    end

    subgraph RADAR["Trend Radar (best-effort)"]
        direction TB
        R1["9 · Ingest signals"]
        R2["10 · Build topics\nTF-IDF groups + score"]
        R3["11 · Merge topics\nsame story? (GPT)"]
        R4["12 · Translate titles"]
        R5["13 · Describe topics\nsummary + Sipply coverage"]
        R1 --> R2 --> R3 --> R4 --> R5
    end

    subgraph DELIVER["Delivery"]
        direction TB
        S10["14 · AI answer check\noff by default (ANSWER_CHECKS_ENABLED)"]
        S9["15 · Email\n20:00 UTC run only"]
        CACHE["Redis cache bust\nai_tool:*"]
        S10 --> S9 --> CACHE
    end

    SRC --> COLLECT --> SCORE --> GENERATE --> RADAR --> DELIVER
    SIG --> R1

    style COLLECT  fill:#f0f9ff,stroke:#0ea5e9
    style SCORE    fill:#faf5ff,stroke:#9333ea
    style GENERATE fill:#fefce8,stroke:#ca8a04
    style RADAR    fill:#fff1f2,stroke:#e11d48
    style DELIVER  fill:#f0fdf4,stroke:#16a34a
```

Each stage is a standalone script in `backend/scripts/`; `run_pipeline.py` orchestrates them in sequence with per-stage timing, failure isolation, and a final Redis cache bust. The Trend Radar stages depend on third-party APIs, so a failure there is recorded in the run log but doesn't fail the news pipeline.

---

## Trend Radar

[www.sipply.dev/radar](https://www.sipply.dev/radar) shows what the AI community is discussing over the last 14 days. Code: `backend/app/signals/`, `app/radar/`, `components/radar/`.

**Signals.** Each run pulls posts, articles and videos with their engagement numbers: Hacker News (Algolia search), Google News (RSS search), YouTube (Data API), Bluesky (app password), GitHub (new repos by stars), DEV and Lobsters. Keyed sources are skipped until their key is set; Threads is wired up but needs Meta's approval. Keywords and limits: `backend/app/signals/signal_sources.yaml`.

**Topics.** Titles are grouped with the same TF-IDF + union-find as the news clusters (threshold tuned on real HN data; big, loose groups are re-split). Word overlap misses one story told in different words, so likely duplicate pairs are checked by gpt-4o-mini and merged. Each topic gets a 0–100 score:

| Component | Weight | What it measures |
|---|---|---|
| Volume | 25% | Signal count, plus a bonus for appearing on several platforms |
| Engagement | 25% | Points, comments, likes (log-scaled) |
| Velocity | 25% | Daily rate over the last 3 days vs the 11 before |
| Recency | 10% | Age of the newest signal |
| Relevance | 15% | The article relevance model on the topic label |

**On the page.** Rings show evidence: *mainstream* (15+ signals), *picking up* (5–14, or 3+ on two platforms), *weak signal* (the rest). Sectors are the site's categories. Color is momentum: *new* (only in the last 3 days), *rising* (discussed before, now clearly faster), *steady*, *cooling*. Each topic card has an AI summary (EN + 中文), the score split, a 14-day trend, the platform mix, the top posts, and whether Sipply already has a story on it (TF-IDF picks candidate stories, GPT confirms the match).

**Cost.** The GPT steps (title translation, summaries, coverage, duplicate checks) cost well under a cent per run.

---

## Readable by AI assistants (GEO)

AI assistants and search crawlers should be able to read and cite Sipply:

- **Server-rendered content**: the homepage, story pages and the radar ship their full text in the HTML (readers' personalization re-ranks on the client).
- **Structured data**: `NewsArticle` JSON-LD on story pages (with the original sources), `ItemList` on the homepage.
- **Machine entry points**: `/sitemap.xml` (every story; rendered per request so it never goes stale), `/robots.txt` (AI crawlers explicitly allowed, `/admin` and `/api/` disallowed), `/llms.txt`.
- **Metadata for crawlers that don't run JS**: `htmlLimitedBots` includes GPTBot, ClaudeBot, PerplexityBot and OAI-SearchBot, so they get `<head>` metadata in the HTML.
- **IndexNow** (`backend/app/services/indexnow.py`): after every successful pipeline run the new and updated story pages, the company pages they appear on and the hub pages are submitted to `api.indexnow.org` (Bing, Yandex, Seznam, Naver, Yep). Bing's index is what ChatGPT search and Copilot read, so new stories become findable within minutes instead of whenever a crawler comes by. The key file is `public/<key>.txt`; local and test runs never submit (`INDEXNOW_ENABLED=0` turns it off anywhere).
- **Search Console / Bing Webmaster**: set `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` in Vercel and the ownership `<meta>` tags appear on every page.
- **Check**: `python -m scripts.geo_crawler_check https://www.sipply.dev` (from `backend/`) fetches pages as GPTBot or ClaudeBot would (raw HTML, no JavaScript) and reports what they can see.
- **Citation tracking** (`backend/app/signals/answers.py`): each mainstream or picking-up radar topic gets the question a reader would ask an AI assistant. When enabled (`ANSWER_CHECKS_ENABLED=1`; off by default since 2026-10-16) the 14:00 UTC run sends the top 10 to OpenAI's Responses API with the `web_search` tool (gpt-4.1-mini, measured ~$0.018 a question: the model searches ~1.5 times per question). Each check records the answer, the sources it cited and read, and whether a sipply.dev page was among them. The radar shows it per topic and as "Who AI assistants cite" (`GET /api/radar/answers`). This is the API's search, not the ChatGPT app: a fixed-settings proxy, comparable over time.

---

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Next.js 16, TypeScript, Tailwind CSS | App Router, RSC, fast builds |
| Backend | FastAPI, SQLAlchemy 2, Alembic, psycopg3 | Async-ready, typed, proper migrations |
| Database | PostgreSQL | Relational + full-text search |
| Cache | Redis | Simple TTL cache; graceful fallback if unavailable |
| ML scoring | scikit-learn (TF-IDF + Ridge) | Predicts 3 relevance dimensions; trained on 422 GPT-labeled examples |
| LLM fine-tune | Qwen2.5-1.5B + LoRA | Fine-tuned on 780 summarization examples; ROUGE-L=0.37 vs GPT-4o-mini |
| AI | OpenAI GPT-4o-mini | summarise · translate (cluster-level only) |
| Email | Resend | Transactional digest delivery to subscribers |
| Deployment | Vercel + Railway | Frontend CDN + managed Postgres/Redis/cron |
| i18n | Custom `useI18n()` hook | Zero-dependency EN/ZH with type-safe translation keys |

---

## ML scoring model

Three dimensions of the signal score were previously hardcoded at 3.0. They are now predicted by a trained TF-IDF + Ridge Regression model, covering **44% of total score weight**.

### Training pipeline

```
422 articles (production DB)
    → GPT-4o-mini labels audience_fit / practical_relevance / novelty (1-5)
    → TF-IDF (unigrams + bigrams, 30k features) + Ridge Regression
    → 5-fold cross-validation
    → models/scorer.pkl
```

### Evaluation (5-fold CV on 422 labeled examples)

| Dimension | Pearson r | MAE | vs. mean baseline |
|-----------|-----------|-----|-------------------|
| audience_fit | 0.75 | 0.71 | +40% |
| practical_relevance | 0.69 | 0.73 | +32% |
| novelty | 0.71 | 0.62 | +36% |

### Inference

Inference runs in ~1ms locally (vs ~1s for an LLM call) at zero marginal cost. Falls back to `3.0` defaults if `models/scorer.pkl` is not present, so deploys are always safe.

### Retrain

```bash
# 1. Re-label articles (run from backend/)
python -m scripts.label_for_training --output data/labels.jsonl --limit 600

# 2. Retrain and evaluate
python -m scripts.train_scorer --labels data/labels.jsonl --output models/scorer.pkl
```

---

## LLM fine-tune (Qwen2.5-1.5B + LoRA)

A Qwen2.5-1.5B-Instruct model fine-tuned on Sipply's summarization task as an experimental alternative to GPT-4o-mini for article and cluster summarization.

### Training

```
780 examples (422 article + 358 cluster summarization pairs)
    → GPT-4o-mini outputs used as training labels
    → LoRA fine-tune (r=16) on Google Colab T4 GPU (free tier)
    → ~56 minutes training time, 2 epochs
    → models/qwen-adapter/
```

### Results

| Metric | Score |
|--------|-------|
| ROUGE-1 | 0.505 |
| ROUGE-2 | 0.227 |
| ROUGE-L | 0.366 |

Evaluated on 156 held-out examples against GPT-4o-mini outputs as reference.

### Retrain

```bash
# Export training data from DB
python -m scripts.export_finetune_data --output-dir data/

# Run finetune_qwen.ipynb in Google Colab (T4 GPU, free tier)
# Adapter saved to models/qwen-adapter/
```

---

## Data sources

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

Turned off, with the reason in the YAML: VentureBeat AI (feed stopped updating, 429), AI News (bot challenge), TLDR AI (no readable text), Meta AI Blog (JavaScript-rendered). Trend Radar sources are listed [above](#trend-radar).

---

## Design

One visual language on every page, public and admin, set in `app/globals.css` (tokens) and `lib/ui/classes.ts` (type and control styles):

- **Stage**: a near-black page (`#080c12`) with one light, a soft radial beam behind each page's title; the light theme is its own token set (white cards on `#f5f8ff`), not an inversion.
- **Type**: Fraunces (light, large) for headlines and section titles; DM Sans for reading; IBM Plex Mono in small capitals for metadata only — categories, dates, counts, tabs.
- **Surfaces**: glass panels (`.sp-glass`: translucent fill, 20px radius, a 1px gradient edge drawn with a mask) holding rows separated by hairlines (`.sp-rows`); pills for inputs, buttons and chips; one accent colour (`#4a9eff` / `#1d6fe8`) for links, the active tab and small status dots.
- **Home**: four full-viewport panels — the lead story, today's stories as a native-scroll carousel with snap points (no wheel hijacking), what the AI community is discussing, this week + the email — each with one focal point and one action. Panels fade up once as they enter; the server HTML is complete without JavaScript and reduced-motion disables the effect.
- **Share images**: generated per page with `next/og` in the same language (`lib/seo/og-card.tsx`).
- **Rules of thumb** (after Meng To's design notes and Tufte): one focal point per viewport; metadata in mono labels, never body text; a surface or an effect has to do a job or it goes; nothing fake — no placeholder counts, quotes or logos.

## Project layout

```
├── app/                    Next.js pages (digest, cluster, archive, radar, admin) + sitemap/robots/llms.txt
├── components/             UI components (home panels, story view, archive, topics/weekly, radar, shared states)
├── lib/
│   ├── api/                Type-safe backend API client (+ server-side fetchers)
│   ├── i18n/               EN/ZH locale strings with typed keys
│   ├── seo/                Site URL, JSON-LD, llms.txt builders
│   ├── ui/                 Shared class strings: titles, labels, tabs, inputs, buttons
│   └── utils/              Pure helpers (radar layout and filters, archive URLs...)
├── types/                  Shared TypeScript type definitions
├── middleware.ts           Next.js middleware — admin route guard
└── backend/
    ├── app/
    │   ├── adapters/       Per-source scrapers (RSS, HTML, arXiv, OpenAI, DeepMind...)
    │   ├── api/routes/     FastAPI route handlers
    │   ├── crud/           DB query helpers
    │   ├── models/         SQLAlchemy ORM models
    │   ├── services/       Pipeline business logic (ingest, cluster, summarise...)
    │   ├── signals/        Trend Radar: sources, topics, merge, descriptions
    │   └── source_catalog/ trusted_sources.yaml — add new sources here
    ├── data/               Training data (labels.jsonl, finetune_train/eval.jsonl)
    ├── models/             Trained artifacts (scorer.pkl, qwen-adapter/)
    ├── migrations/         Alembic migration history
    └── scripts/            Pipeline stage scripts + ML training scripts
```

---

## Local development

### Frontend

```bash
npm install
npm run dev          # http://localhost:3000
```

Create `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend

```bash
cd backend/
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL + OPENAI_API_KEY
alembic upgrade head
uvicorn app.main:app --reload   # http://localhost:8000
```

### Run the pipeline manually

```bash
cd backend/

# All stages at once
python -m scripts.run_pipeline --triggered-by manual

# Or stage by stage
python -m scripts.ingest_full_articles --slug anthropic-newsroom --per-source-limit 5
python -m scripts.filter_articles
python -m scripts.score_articles
python -m scripts.cluster_articles
python -m scripts.summarize
```

### Tests

CI (`.github/workflows/ci.yml`) runs on every pull request and push to `main`: backend migrations are applied to an empty Postgres, then `pytest`; the frontend runs `npm run typecheck`, `npm run lint -- --max-warnings=0` and `npm test`.

```bash
# Frontend — typecheck + unit tests (vitest)
npm run typecheck
npm run lint
npm test

# Backend — pure unit tests run anywhere; DB tests need a local Postgres at alembic head
cd backend/
pip install -r requirements-dev.txt
DATABASE_URL=postgresql+psycopg://pait:pait@localhost:5432/pait_test alembic upgrade head
TEST_DATABASE_URL=postgresql+psycopg://pait:pait@localhost:5432/pait_test pytest
```

DB tests run inside a transaction that is rolled back, and refuse to run against any host other than localhost. Without `TEST_DATABASE_URL` they are skipped.

---

## Deployment

### Backend (Railway)

Deployed as two Railway services sharing one Postgres + Redis instance:

| Service | Config | Schedule |
|---------|--------|----------|
| `personal-ai-intelligence-tool` | `railway.toml` | Always-on API |
| `daily-pipeline-cron` | `railway.cron.toml` | 02:00, 08:00, 14:00, 20:00 UTC (email on the 20:00 run) |

On startup, `alembic upgrade head` runs in a background thread so Railway's healthcheck passes immediately.

Required environment variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (`postgresql+psycopg://...`) |
| `OPENAI_API_KEY` | GPT-4o-mini — summarise, translate |
| `RESEND_API_KEY` | Email delivery for daily digest |
| `REDIS_URL` | Auto-set by Railway Redis plugin |
| `JWT_SECRET` | Signs admin JWT tokens |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_SECRET` | Admin login |
| `YOUTUBE_API_KEY` | Trend Radar YouTube source (optional; skipped while unset) |
| `BLUESKY_HANDLE` / `BLUESKY_APP_PASSWORD` | Trend Radar Bluesky source (optional; an app password, not the account password) |
| `THREADS_ACCESS_TOKEN` | Trend Radar Threads source (optional; needs Meta's `threads_keyword_search` approval) |

### Frontend (Vercel)

Auto-deploys from GitHub. Set one environment variable:

```
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
```

---

## API highlights

```bash
# Today's digest (featured story + top clusters); add ?device_id=&role= to re-rank per reader
GET /api/digest/today

# All clusters (paginated, ranked by recency-weighted score)
GET /api/clusters?limit=20&offset=0

# Single cluster with source articles + related stories
GET /api/clusters/{id}

# Full-text search
GET /api/search?q=GPT-5&type=cluster

# Trend Radar: topics with rings, momentum, summaries, coverage, top posts and questions
GET /api/radar?limit=40

# What an AI assistant with web search cited for the radar questions (last 30 days)
GET /api/radar/answers?days=30

# Every story id + last update (feeds the sitemap)
GET /api/clusters/index

# Subscribe to email digest
POST /api/subscribe   { "email": "..." }

# Interactive docs
GET /docs
```

---

## Design decisions worth noting

**Why not vector search for clustering?**
TF-IDF + cosine similarity runs locally with no API calls, adds zero cost per run, and works well on the short article excerpts we ingest. Vector embeddings would improve recall across semantically similar but lexically different articles — a natural next upgrade.

**Why GPT-4o-mini instead of a larger model?**
The pipeline runs daily across 13 sources. Filtering and scoring are handled by rule-based logic and a local ML model (zero API cost). GPT-4o-mini is only used for summarisation and translation — keeping total cost under $1/day.

**Why Redis cache with 5-min TTL?**
The digest and cluster list endpoints are hit on every page load. Caching avoids repeated Postgres aggregation queries. The pipeline explicitly busts the cache (`ai_tool:*`) after every successful run so stale data never persists beyond one cycle.

**Why ask GPT whether two radar topics are the same story?**
Measured on 60 real topics: between topic title centroids, true duplicates scored as low as 0.26 while different stories reached 0.53, so no similarity threshold separates them. Similarity only picks candidate pairs (cheap, local); one small GPT request judges them.

**Why rings by evidence instead of by score?**
A single viral YouTube video can score as high as a story covered by 40 outlets. Rings use how many signals, on how many platforms, back a topic; the score only orders topics inside a ring. In one snapshot, 12 of the top 40 topics were just a few YouTube videos each; they now sit in the outer ring.

**Why incremental RSS ingestion?**
Each source has a configurable `fetch_frequency_minutes`. The ingest script skips sources polled too recently (`last_polled_at` gate) and sends `If-None-Match` ETag headers so unchanged feeds return HTTP 304 with zero parsing cost — saving bandwidth and avoiding source rate limits.
