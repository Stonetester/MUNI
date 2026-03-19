"""AI monthly financial report router."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.ai_report import generate_monthly_report

router = APIRouter(prefix="/ai-report", tags=["ai-report"])


@router.get("")
def get_ai_report(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate an AI-powered monthly financial report for the current user."""
    today = date.today()
    target_year = year or today.year
    target_month = month or today.month

    # Default to last month if current month has very little data (before the 5th)
    if year is None and month is None and today.day < 5:
        if today.month == 1:
            target_year = today.year - 1
            target_month = 12
        else:
            target_month = today.month - 1

    report = generate_monthly_report(current_user, db, target_year, target_month)
    return {
        "year": target_year,
        "month": target_month,
        "report": report,
    }
