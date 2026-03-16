from calendar import monthrange
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.category import Category
from app.models.life_event import LifeEvent
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.alert import AlertItem

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=List[AlertItem])
def get_alerts(
    month: Optional[str] = Query(None, description="YYYY-MM format, defaults to current month"),
    lookahead_days: int = Query(30, ge=1, le=120),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    if month:
        year, mon = int(month[:4]), int(month[5:7])
    else:
        year, mon = today.year, today.month

    start = date(year, mon, 1)
    _, last_day = monthrange(year, mon)
    end = date(year, mon, last_day)

    alerts: List[AlertItem] = []

    categories = (
        db.query(Category)
        .filter(
            Category.user_id == current_user.id,
            Category.kind.in_(["expense", "savings"]),
            Category.budget_amount.is_not(None),
            Category.budget_amount > 0,
        )
        .all()
    )

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

    for cat in categories:
        actual = spend_map.get(cat.id, 0.0)
        if actual <= cat.budget_amount:
            continue

        percentage = round((actual / cat.budget_amount) * 100, 1)
        overage = actual - cat.budget_amount
        severity = "critical" if percentage >= 120 else "warning"
        alerts.append(
            AlertItem(
                type="budget",
                severity=severity,
                title=f"{cat.name} is over budget",
                message=f"Spent ${actual:,.2f} vs ${cat.budget_amount:,.2f} budget ({percentage:.1f}% used).",
                amount=round(overage, 2),
                due_date=end,
                meta={"category_id": cat.id, "category_name": cat.name, "percentage": percentage},
            )
        )

    window_end = today.fromordinal(today.toordinal() + lookahead_days)
    events = (
        db.query(LifeEvent)
        .filter(
            LifeEvent.user_id == current_user.id,
            LifeEvent.is_active == True,
            LifeEvent.start_date <= window_end,
            func.coalesce(LifeEvent.end_date, LifeEvent.start_date) >= today,
        )
        .order_by(LifeEvent.start_date)
        .all()
    )

    current_period = int(f"{today.year}{today.month:02d}")
    for event in events:
        due_amount = 0.0
        due_label = event.start_date

        if event.monthly_breakdown:
            for item in event.monthly_breakdown:
                month_str = item.get("month")
                if not month_str:
                    continue
                month_num = int(month_str.replace("-", "")[:6])
                if current_period <= month_num <= int(f"{window_end.year}{window_end.month:02d}"):
                    due_amount += float(item.get("amount") or 0.0)
            if due_amount == 0:
                continue
        else:
            if today <= event.start_date <= window_end:
                due_amount = float(event.total_cost or 0.0)
            else:
                continue

        days_until = (due_label - today).days
        severity = "critical" if days_until <= 7 else "info"
        alerts.append(
            AlertItem(
                type="event",
                severity=severity,
                title=f"Upcoming payment: {event.name}",
                message=f"Estimated ${due_amount:,.2f} due in the next {lookahead_days} days.",
                amount=round(due_amount, 2),
                due_date=due_label,
                meta={"event_id": event.id, "event_type": event.event_type},
            )
        )

    severity_rank = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: (severity_rank.get(a.severity, 3), a.due_date or end))
    return alerts
