# Sipply — Backend (FastAPI)

FastAPI backend for Sipply. Handles article ingestion, the full LLM processing pipeline, and REST API routes consumed by the Vercel frontend.

**Production:** `https://personal-ai-intelligence-tool-production.up.railway.app`  
**Interactive docs:** `/docs`

---

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # fill in DATABASE_URL and OPENAI_API_KEY
alembic upgrade head
uvicorn app.main:app --reload
```

Open [http://localhost:8000/health](http://localhost:8000/health).

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | ✅ | SQLAlchemy URL (`postgresql+psycopg://…`) |
| `OPENAI_API_KEY` | ✅ | gpt-4o-mini: summaries, translation, Trend Radar topic merges and descriptions |
| `APP_ENV` | ✅ | `development` or `production` |
| `SOURCE_FETCH_USER_AGENT` | ✅ | User-Agent sent when fetching articles |
| `REDIS_URL` | optional | Redis cache (graceful no-op fallback if absent) |
| `YOUTUBE_API_KEY` | optional | Trend Radar YouTube source (skipped while unset) |
| `BLUESKY_HANDLE` / `BLUESKY_APP_PASSWORD` | optional | Trend Radar Bluesky source (app password, skipped while unset) |
| `THREADS_ACCESS_TOKEN` | optional | Trend Radar Threads source (needs Meta's `threads_keyword_search` approval) |
| `JWT_SECRET` | admin only | Signs admin session tokens |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | admin only | Login credentials |

---

## Running the pipeline

```bash
# All stages in sequence (what the Railway cron runs)
python -m scripts.run_pipeline

# Individual stages
python -m scripts.ingest_full_articles                          # fetch article HTML
python -m scripts.ingest_full_articles --slug techcrunch-ai    # single source
python -m scripts.ingest_full_articles --dry-run               # no DB writes
python -m scripts.ingest_full_articles --force-retry-failures  # clear 403 bans

python -m scripts.filter_articles       # rule-based relevance filter (keywords, length, dedup)
python -m scripts.score_articles        # signal score (0–100)
python -m scripts.cluster_articles      # TF-IDF story clustering
python -m scripts.update_cluster_status # new/escalating/peaking/ongoing/fading
python -m scripts.dedup_clusters        # merge cross-day duplicate clusters
python -m scripts.summarize             # gpt-4o-mini summaries + audience blocks
python -m scripts.translate_clusters    # EN → ZH for all cluster fields
python -m scripts.ingest_signals        # Trend Radar: HN, Google News, YouTube, GitHub, DEV, Lobsters, Bluesky, Threads
python -m scripts.build_signal_topics   # Trend Radar: group + score signal topics
python -m scripts.merge_signal_topics   # Trend Radar: merge topics about the same story (gpt-4o-mini)
python -m scripts.translate_signals     # Trend Radar: Chinese titles
python -m scripts.describe_signal_topics  # Trend Radar: summaries + which Sipply story covers each topic
python -m scripts.send_digest_email     # digest email (the cron sends it on the 20:00 UTC run only)
```

The Trend Radar stages are best-effort: if a source or OpenAI is down, the
run records them as failed but the news pipeline still counts as a success.
Keywords and per-source limits live in `app/signals/signal_sources.yaml`.

---

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| GET | `/health/db` | Readiness check (DB ping) |
| GET | `/api/digest/today` | Featured cluster + top 9; `?device_id=&role=` re-ranks per reader |
| GET | `/api/clusters` | Paginated cluster list |
| GET | `/api/clusters/{id}` | Cluster with articles + related cluster ids |
| GET | `/api/clusters/index` | Every story id + last update (for the sitemap) |
| GET | `/api/search` | Full-text search (clusters + articles) |
| GET | `/api/radar` | Trend Radar topics: ring, momentum, score breakdown, daily counts, summary, Sipply coverage, top posts, questions |
| GET | `/api/pipeline-runs` | Pipeline run history |
| POST | `/api/auth/login` | Get JWT token |
| POST | `/api/admin/trigger-pipeline` | Trigger pipeline (JWT required) |

---

## Database schema

| Table | Purpose |
|-------|---------|
| `sources` | Publisher registry (synced from `trusted_sources.yaml`) |
| `articles` | Ingested articles — full text, scores, cluster assignment |
| `ingest_url_states` | Per-URL fetch state (403 backoff counters, retry_at) |
| `clusters` | Story clusters — summaries, takeaways, audience blocks (EN + ZH) |
| `drafts` | Retired LinkedIn-draft feature; table kept for its data, no longer read or written |
| `pipeline_runs` | Run history with per-stage timing and status |
| `signals` | Trend Radar posts/news/videos with live engagement numbers |
| `signal_topics` | Trend Radar topics, rebuilt from `signals` on every run; summaries and the covering story carry over to the matching topic |

Migrations live in `migrations/`. Run `alembic upgrade head` to apply.  
On Railway, migrations run automatically at startup in a background thread.

---

## Adding a new source

Edit `app/source_catalog/trusted_sources.yaml`:

```yaml
- name: Example AI Blog
  slug: example-ai
  type: tech_press          # company_news | tech_press | research | newsletter
  base_url: https://example.com/
  feed_url: https://example.com/feed.xml
  adapter_key: generic_rss  # generic_rss works for any standard RSS feed
  ingestion_method: rss
  is_active: true
  fetch_frequency_minutes: 60
  source_priority: 15       # higher = surfaces more in scoring
  import_limit: 30
```

The source is upserted into the DB on the next pipeline run — no migration needed.

---

## Layout

```
app/
├── adapters/       Per-source scrapers (RSS, HTML, arXiv, DeepMind, OpenAI…)
├── api/routes/     FastAPI route handlers
├── crud/           DB query helpers
├── models/         SQLAlchemy ORM models
├── schemas/        Pydantic request/response schemas
├── services/       Pipeline business logic
├── signals/        Trend Radar: sources (HN, Google News, YouTube, GitHub, DEV, Lobsters, Bluesky, Threads), topics, merge, descriptions
└── source_catalog/ trusted_sources.yaml

migrations/         Alembic migration scripts
scripts/
├── run_pipeline.py             Daily orchestrator (called by Railway cron)
├── ingest_full_articles.py
├── filter_articles.py
├── score_articles.py
├── cluster_articles.py
├── update_cluster_status.py
├── dedup_clusters.py
├── summarize.py
├── translate_clusters.py
├── ingest_signals.py           Trend Radar signals
├── build_signal_topics.py      Trend Radar topics
├── merge_signal_topics.py      Trend Radar duplicate merge
├── translate_signals.py        Trend Radar Chinese titles
├── describe_signal_topics.py   Trend Radar summaries + coverage
├── send_digest_email.py
├── geo_crawler_check.py        What AI crawlers can read on the site
└── seed_sources.py
```
