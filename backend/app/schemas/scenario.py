from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ScenarioBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_baseline: bool = False
    parent_id: Optional[int] = None


class ScenarioCreate(ScenarioBase):
    pass


class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_baseline: Optional[bool] = None
    parent_id: Optional[int] = None


class ScenarioOut(ScenarioBase):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ScenarioCompare(BaseModel):
    baseline_id: int
    scenario_id: int
    months: int = 60
    baseline_net_worth_end: float
    scenario_net_worth_end: float
    delta_net_worth: float
    baseline_cash_end: float
    scenario_cash_end: float
    delta_cash: float
    monthly_deltas: list
