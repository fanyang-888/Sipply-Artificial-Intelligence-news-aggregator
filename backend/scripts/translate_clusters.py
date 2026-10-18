"""Translate cluster summaries from English to Chinese (Simplified).

Runs after summarize.py.  For each cluster that has English summaries but
no Chinese translation yet, calls GPT-4o-mini once to produce all zh fields
in a single JSON response.

Usage:
    cd backend/
    python -m scripts.translate_clusters [--batch-size N]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.logging_config import configure_logging
from app.models.cluster import Cluster
from app.services.headlines import valid_headline

configure_logging()
logger = logging.getLogger(__name__)

MODEL = "gpt-4o-mini"

_SYSTEM = """You are a professional translator specializing in AI/tech content.
Translate the following English cluster summary fields into Simplified Chinese (简体中文).
Keep technical terms (model names, company names, benchmark names) in English.
Be concise and accurate — do not add opinions or extra content.

Return JSON with exactly these keys:
{
  "title_zh": "translated cluster title",
  "headline_zh": "translated Sipply headline (an empty string when no headline is given)",
  "summary_zh": "translated summary",
  "takeaways_zh": ["takeaway 1", "takeaway 2", "takeaway 3"],
  "why_it_matters_zh": "translated general why it matters",
  "why_it_matters_pm_zh": "translated PM-specific why it matters",
  "why_it_matters_dev_zh": "translated developer-specific why it matters",
  "why_it_matters_students_zh": "translated student/job-seeker why it matters"
}
JSON only."""


def _translate_cluster(client, cluster: Cluster) -> dict:
    takeaways = cluster.takeaways or []
    headline = f"Headline: {cluster.headline}\n" if getattr(cluster, "headline", None) else ""
    user = (
        f"Title: {cluster.representative_title}\n"
        f"{headline}\n"
        f"Summary:\n{cluster.summary or ''}\n\n"
        f"Takeaways:\n" + "\n".join(f"- {t}" for t in takeaways) + "\n\n"
        f"Why it matters (general): {cluster.why_it_matters or ''}\n"
        f"Why it matters (PM): {cluster.why_it_matters_pm or ''}\n"
        f"Why it matters (developer): {cluster.why_it_matters_dev or ''}\n"
        f"Why it matters (student/job-seeker): {cluster.why_it_matters_students or ''}"
    )
    response = client.chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": user},
        ],
        temperature=0.2,
        max_tokens=1200,
    )
    raw = response.choices[0].message.content or "{}"
    return json.loads(raw)


def apply_translation(cluster, data: dict) -> None:
    """Store a translation; the headline's only when the story has a Sipply headline."""
    cluster.representative_title_zh = (data.get("title_zh") or "").strip() or None
    cluster.headline_zh = valid_headline(data.get("headline_zh")) if getattr(cluster, "headline", None) else None
    cluster.summary_zh = (data.get("summary_zh") or "").strip() or None
    cluster.takeaways_zh = data.get("takeaways_zh") or []
    cluster.why_it_matters_zh = (data.get("why_it_matters_zh") or "").strip() or None
    cluster.why_it_matters_pm_zh = (data.get("why_it_matters_pm_zh") or "").strip() or None
    cluster.why_it_matters_dev_zh = (data.get("why_it_matters_dev_zh") or "").strip() or None
    cluster.why_it_matters_students_zh = (data.get("why_it_matters_students_zh") or "").strip() or None
    cluster.translated_at = datetime.now(timezone.utc)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Translate cluster summaries to Chinese")
    parser.add_argument("--batch-size", type=int, default=20)
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    key = settings.openai_api_key
    if not key:
        logger.warning("translate_clusters skipped: OPENAI_API_KEY not set")
        return 0

    from openai import OpenAI
    client = OpenAI(api_key=key.get_secret_value(), timeout=60.0)

    with SessionLocal() as db:
        clusters = list(
            db.execute(
                select(Cluster).where(
                    Cluster.summarized_at.is_not(None),
                    Cluster.translated_at.is_(None),
                ).limit(args.batch_size)
            ).scalars().all()
        )

        if not clusters:
            logger.info("translate_clusters: nothing to translate")
            return 0

        processed = skipped = 0
        for cluster in clusters:
            try:
                data = _translate_cluster(client, cluster)
                apply_translation(cluster, data)
                processed += 1
                logger.info("translated cluster id=%s title=%.60s", cluster.id, cluster.representative_title)
            except Exception:
                logger.exception("failed to translate cluster id=%s", cluster.id)
                skipped += 1

        if processed:
            db.commit()

    logger.info("translate_clusters done: processed=%d skipped=%d", processed, skipped)
    return 0 if skipped == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
