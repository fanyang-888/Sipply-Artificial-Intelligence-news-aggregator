# 1. Frontend on Vercel, API and pipeline on Railway, one REST API between them

Date: recorded 2026-10-16 (in place since the first deploy) · Status: Accepted

## Context
Sipply is a reading site plus a batch pipeline that runs four times a day (02, 08, 14, 20 UTC). The site needs a CDN and per-page caching; the pipeline needs Python (scikit-learn, OpenAI, feed parsing), Postgres and a scheduler. One person runs it.

## Decision
- Next.js 16 (App Router) on **Vercel**; it reads only the public REST API (`NEXT_PUBLIC_API_URL`).
- FastAPI + PostgreSQL + Redis on **Railway**, as two services from one codebase: the always-on API, and `daily-pipeline-cron`, which runs `scripts/run_pipeline.py`.
- The API is stateless. Redis caches hot endpoints for 5 minutes; every successful run busts the cache and then requests the five hub pages once, so Vercel rebuilds them now rather than on the next reader's visit.

## Consequences
- Each side deploys on its own; a merge triggers both, and **Vercel usually finishes first**. A frontend built against the old API must tolerate missing fields (`withRadarDefaults`), and static pages fetched during a deploy can cache an error for one revalidate window.
- The frontend can be built and tested against the live API without credentials (CI does this, see ADR 8).
- Two bills, but both stay within hobby tiers.
