import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import Base, engine

# Import all models so that Base.metadata knows about them before create_all
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup
    Base.metadata.create_all(bind=engine)
    yield


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

# API routers – all under /api/v1
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
