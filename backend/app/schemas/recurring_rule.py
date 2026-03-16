from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class RecurringRuleBase(BaseModel):
    name: str
    amount: float
    frequency: str = "monthly"
    start_date: date
    end_date: Optional[date] = None
    next_date: Optional[date] = None
    description: Optional[str] = None
    is_active: bool = True
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    scenario_id: Optional[int] = None


class RecurringRuleCreate(RecurringRuleBase):
    pass


class RecurringRuleUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    frequency: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    next_date: Optional[date] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    scenario_id: Optional[int] = None


class RecurringRuleOut(RecurringRuleBase):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
