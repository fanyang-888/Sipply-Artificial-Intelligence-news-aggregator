#!/usr/bin/env bash
# One-shot Railway deployment for personal-ai-intelligence-tool backend.
# Run from the backend/ directory.
# Usage:
#   cd backend/
#   bash deploy-railway.sh

set -euo pipefail
cd "$(dirname "$0")"

# Read OPENAI_API_KEY from .env file (never hard-code secrets in scripts)
if [ -f .env ]; then
  OPENAI_KEY=$(grep '^OPENAI_API_KEY=' .env | cut -d'=' -f2- | tr -d "'" | tr -d '"')
fi
if [ -z "${OPENAI_KEY:-}" ]; then
  echo "ERROR: OPENAI_API_KEY not found in .env. Please add it."
  exit 1
fi

echo "==> Checking Railway login..."
if ! railway whoami &>/dev/null; then
  echo "    Not logged in. Opening browser login..."
  railway login
fi

echo "==> Creating Railway project..."
railway init --name personal-ai-intelligence-tool-backend 2>/dev/null || true

echo "==> Adding Postgres..."
railway add --database postgres 2>/dev/null || echo "    (may already exist)"

echo "==> Setting env vars..."
railway variables --set "APP_ENV=production"
railway variables --set "SOURCE_FETCH_USER_AGENT=PersonalAIIntelligenceTool/0.1 (+local-dev)"
railway variables --set "OPENAI_API_KEY=${OPENAI_KEY}"

echo "==> Deploying..."
railway up --detach

echo "==> Waiting 45s for first boot..."
sleep 45

echo "==> Setting DATABASE_URL with psycopg driver..."
RAW=$(railway variables 2>/dev/null | grep DATABASE_URL | head -1 | sed 's/.*= //')
if [[ "$RAW" == postgresql://* ]]; then
  railway variables --set "DATABASE_URL=${RAW/postgresql:\/\//postgresql+psycopg://}"
  echo "    DATABASE_URL updated."
else
  echo "    Could not auto-fix DATABASE_URL. Check Railway dashboard."
fi

echo "==> Running migrations..."
railway run --service personal-ai-intelligence-tool-backend alembic upgrade head

echo "==> Seeding sources..."
railway run --service personal-ai-intelligence-tool-backend python -m scripts.seed_sources

echo "==> Ingesting articles..."
railway run --service personal-ai-intelligence-tool-backend python -m scripts.ingest_full_articles

echo "==> Filter / score / cluster / summarize..."
railway run --service personal-ai-intelligence-tool-backend python -m scripts.filter_articles
railway run --service personal-ai-intelligence-tool-backend python -m scripts.score_articles
railway run --service personal-ai-intelligence-tool-backend python -m scripts.cluster_articles
railway run --service personal-ai-intelligence-tool-backend python -m scripts.summarize

echo ""
echo "==> All done! Your Railway service URL:"
railway status
echo ""
echo "==> FINAL STEP: Go to Vercel and update NEXT_PUBLIC_API_URL to the URL above."
echo "    https://vercel.com/fanyang-888s-projects/personal-ai-intelligence-tool/settings/environment-variables"
