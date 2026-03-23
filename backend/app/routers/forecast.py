from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.forecast import ForecastResponse, ForecastPoint
from app.services.forecasting import run_forecast

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.get("", response_model=ForecastResponse)
def get_forecast(
    scenario_id: Optional[int] = Query(default=None),
    months: int = Query(default=60, ge=1, le=360),
    past_months: int = Query(default=0, ge=0, le=60),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = run_forecast(user=current_user, db=db, scenario_id=scenario_id, months=months)

    if past_months > 0:
        from datetime import date
        from dateutil.relativedelta import relativedelta
        from sqlalchemy import func
        from app.models.transaction import Transaction

        today = date.today()
        historical_points: list[ForecastPoint] = []

        for i in range(past_months, 0, -1):
            month_start = (today.replace(day=1) - relativedelta(months=i))
            month_end = (month_start + relativedelta(months=1)) - relativedelta(days=1)
            month_key = month_start.strftime("%Y-%m")

            txns = db.query(Transaction).filter(
                Transaction.user_id == current_user.id,
                Transaction.date >= month_start,
                Transaction.date <= month_end,
                Transaction.scenario_id.is_(None),
            ).all()

            income = sum(
                t.amount for t in txns
                if t.amount > 0
                and not (t.import_source and t.import_source.startswith("paystub:") and t.description and "Employer 401k" in t.description)
            )
            expenses = sum(abs(t.amount) for t in txns if t.amount < 0)
            net = income - expenses

            historical_points.append(ForecastPoint(
                month=month_key,
                income=income,
                expenses=expenses,
                net=net,
                cash=0.0,
                net_worth=0.0,
                savings_total=0.0,
                low_cash=0.0,
                high_cash=0.0,
                event_impact=0.0,
            ))

        result.points = historical_points + result.points

    return result
