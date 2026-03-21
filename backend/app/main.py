import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import settings
from app.database import Base, engine, SessionLocal

# Import all models so Base.metadata knows about them before create_all
import app.models  # noqa: F401

from app.routers import (
    auth,
    accounts,
    transactions,
    categories,
    recurring,
    balance_snapshots,
    life_events,
    scenarios,
    forecast,
    import_data,
    dashboard,
    budget,
    alerts,
)
from app.routers import google_sheets, financial_profile, paystubs, joint
from app.routers import ai_report, notifications
from app.routers import home_buying

logger = logging.getLogger(__name__)


def _apply_migrations():
    """Safely add new columns to existing tables (SQLite-compatible)."""
    migrations = [
        "ALTER TABLE accounts ADD COLUMN is_joint BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE accounts ADD COLUMN joint_user_id INTEGER REFERENCES users(id)",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # Column already exists — safe to ignore


def _start_scheduler():
    """Start APScheduler background jobs."""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from app.services.google_sheets_sync import sync_all_users
        from app.services.email_service import send_weekly_digest_all

        scheduler = BackgroundScheduler()
        scheduler.add_job(sync_all_users, "interval", minutes=30, id="sheets_sync")
        # Weekly digest — every Monday at 8:00 AM
        scheduler.add_job(
            send_weekly_digest_all,
            "cron",
            day_of_week="mon",
            hour=8,
            minute=0,
            id="weekly_digest",
        )
        scheduler.start()
        logger.info("Scheduler started: Google Sheets sync (30 min) + weekly email digest (Mon 8am)")
        return scheduler
    except ImportError:
        logger.warning("APScheduler not installed — scheduled jobs disabled. Run: pip install apscheduler")
        return None


_scheduler = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    Base.metadata.create_all(bind=engine)
    _apply_migrations()
    _scheduler = _start_scheduler()
    yield
    if _scheduler:
        _scheduler.shutdown(wait=False)


app = FastAPI(
    title="FinanceTool API",
    description="Personal finance forecasting backend for Keaton & Katherine",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers — all under /api/v1
PREFIX = "/api/v1"

app.include_router(auth.router, prefix=PREFIX)
app.include_router(accounts.router, prefix=PREFIX)
app.include_router(transactions.router, prefix=PREFIX)
app.include_router(categories.router, prefix=PREFIX)
app.include_router(recurring.router, prefix=PREFIX)
app.include_router(balance_snapshots.router, prefix=PREFIX)
app.include_router(life_events.router, prefix=PREFIX)
app.include_router(scenarios.router, prefix=PREFIX)
app.include_router(forecast.router, prefix=PREFIX)
app.include_router(import_data.router, prefix=PREFIX)
app.include_router(dashboard.router, prefix=PREFIX)
app.include_router(budget.router, prefix=PREFIX)
app.include_router(alerts.router, prefix=PREFIX)
app.include_router(google_sheets.router, prefix=PREFIX)
app.include_router(financial_profile.router, prefix=PREFIX)
app.include_router(paystubs.router, prefix=PREFIX)
app.include_router(joint.router, prefix=PREFIX)
app.include_router(ai_report.router, prefix=PREFIX)
app.include_router(notifications.router, prefix=PREFIX)
app.include_router(home_buying.router, prefix=PREFIX)

# Serve Next.js static export if it exists
FRONTEND_BUILD = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "frontend",
    "out",
)
if os.path.isdir(FRONTEND_BUILD):
    app.mount("/", StaticFiles(directory=FRONTEND_BUILD, html=True), name="frontend")


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}
