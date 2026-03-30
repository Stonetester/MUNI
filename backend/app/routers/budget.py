from datetime import date
from typing import List, Optional
from calendar import monthrange

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User

router = APIRouter(prefix="/budget", tags=["budget"])


@router.get("/summary")
def get_budget_summary(
    month: Optional[str] = Query(None, description="YYYY-MM format, defaults to current month"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return budget vs actual for each expense category in a given month."""
    today = date.today()
    if month:
        year, mon = int(month[:4]), int(month[5:7])
    else:
        year, mon = today.year, today.month

    start = date(year, mon, 1)
    _, last_day = monthrange(year, mon)
    end = date(year, mon, last_day)

    # Get all expense/savings categories for this user
    categories = (
        db.query(Category)
        .filter(
            Category.user_id == current_user.id,
            Category.kind.in_(["expense", "savings"]),
        )
        .all()
    )

    # Actual spending per category this month
    spending = (
        db.query(Transaction.category_id, func.sum(Transaction.amount).label("total"))
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.scenario_id.is_(None),
        )
        .group_by(Transaction.category_id)
        .all()
    )
    spend_map = {row.category_id: abs(row.total) for row in spending if row.total}

    result = []
    for cat in categories:
        actual = spend_map.get(cat.id, 0.0)
        budget = cat.budget_amount or 0.0
        remaining = budget - actual if budget > 0 else 0.0
        pct = (actual / budget * 100) if budget > 0 else 0.0
        result.append({
            "category_id": cat.id,
            "category_name": cat.name,
            "kind": cat.kind,
            "color": cat.color or "#10B981",
            "budget_amount": budget,
            "actual_amount": actual,
            "remaining": remaining,
            "percentage": round(pct, 1),
        })

    # Sort: over-budget first, then by actual amount desc
    result.sort(key=lambda x: (-x["percentage"] if x["budget_amount"] > 0 else 0, -x["actual_amount"]))
    return result


@router.get("/estimates")
def get_spending_estimates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return weighted-average monthly spend per expense/savings category.
    Uses the same 50/30/20 weighting as the forecast engine:
      - 3-month avg × 0.50  (recent behaviour — highest weight)
      - 6-month avg × 0.30  (medium-term trend)
      - 12-month avg × 0.20 (seasonal baseline)
    This produces budget suggestions that react to recent changes while
    staying anchored to the full year of history.
    """
    today = date.today()
    period_end = today.replace(day=1)  # exclude current (partial) month
    start_12 = period_end - relativedelta(months=12)
    start_6  = period_end - relativedelta(months=6)
    start_3  = period_end - relativedelta(months=3)

    categories = (
        db.query(Category)
        .filter(
            Category.user_id == current_user.id,
            Category.kind.in_(["expense", "savings"]),
        )
        .all()
    )

    def _sum_for_period(period_start: date) -> dict:
        rows = (
            db.query(Transaction.category_id, func.sum(Transaction.amount).label("total"))
            .filter(
                Transaction.user_id == current_user.id,
                Transaction.date >= period_start,
                Transaction.date < period_end,
                Transaction.scenario_id.is_(None),
                Transaction.amount < 0,  # expenses only
            )
            .group_by(Transaction.category_id)
            .all()
        )
        return {r.category_id: abs(r.total) for r in rows if r.total}

    sums_12 = _sum_for_period(start_12)
    sums_6  = _sum_for_period(start_6)
    sums_3  = _sum_for_period(start_3)

    result = []
    for cat in categories:
        avg12 = sums_12.get(cat.id, 0.0) / 12
        avg6  = sums_6.get(cat.id, 0.0)  / 6
        avg3  = sums_3.get(cat.id, 0.0)  / 3

        # Weighted blend — same as forecast engine
        weighted = avg3 * 0.50 + avg6 * 0.30 + avg12 * 0.20

        # Fall back to whatever window has data if the full 12 months isn't available
        if weighted == 0:
            weighted = avg6 or avg3

        if weighted > 0:
            result.append({
                "category_id": cat.id,
                "category_name": cat.name,
                "avg_monthly": round(weighted, 2),
                "months_sampled": 12,
            })

    result.sort(key=lambda x: -x["avg_monthly"])
    return result
