from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.forecast import ForecastResponse
from app.services.forecasting import run_forecast
from app.services.historical_forecast import build_historical_forecast_points

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
        historical_points = build_historical_forecast_points(
            db=db,
            user_ids=[current_user.id],
            account_ids=[account.account_id for account in result.account_forecasts],
            past_months=past_months,
        )
        result.points = historical_points + result.points

    return result
