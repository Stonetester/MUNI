from datetime import date, datetime
from typing import Optional, List, Any

from pydantic import BaseModel


class MonthlyBreakdownEntry(BaseModel):
    month: str  # YYYY-MM
    amount: float


class LifeEventBase(BaseModel):
    name: str
    event_type: str = "other"
    start_date: date
    end_date: Optional[date] = None
    total_cost: float = 0.0
    description: Optional[str] = None
    is_active: bool = True
    scenario_id: Optional[int] = None
    monthly_breakdown: Optional[List[MonthlyBreakdownEntry]] = None


class LifeEventCreate(LifeEventBase):
    pass


class LifeEventUpdate(BaseModel):
    name: Optional[str] = None
    event_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    total_cost: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    scenario_id: Optional[int] = None
    monthly_breakdown: Optional[List[MonthlyBreakdownEntry]] = None


class LifeEventOut(LifeEventBase):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
