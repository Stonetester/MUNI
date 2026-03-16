from datetime import date
from typing import List, Optional
from calendar import monthrange

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
