from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import mailer

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str | bool]:
    """Lightweight liveness check — no DB dependency so Railway healthcheck passes fast.

    "mail": whether this service can send email (RESEND_API_KEY). Sign-ups need it for their
    confirmation link; scripts/uptime.mjs fails when it's false."""
    return {"status": "ok", "mail": mailer.configured()}


@router.get("/health/db")
def health_db(db: Session = Depends(get_db)) -> dict[str, str]:
    """Full readiness check including database connectivity."""
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database connection failed: {type(e).__name__}: {e}",
        ) from None
    return {"status": "healthy"}
