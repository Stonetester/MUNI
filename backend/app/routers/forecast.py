from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.forecast import ForecastResponse
from app.services.forecasting import run_forecast

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.get("", response_model=ForecastResponse)
def get_forecast(
    scenario_id: Optional[int] = Query(default=None),
    months: int = Query(default=60, ge=1, le=360),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return run_forecast(user=current_user, db=db, scenario_id=scenario_id, months=months)
