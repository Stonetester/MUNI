from typing import List, Optional, Dict

from pydantic import BaseModel


class ForecastPoint(BaseModel):
    month: str  # YYYY-MM
    income: float
    expenses: float
    net: float
    cash: float
    net_worth: float
    savings_total: float
    low_cash: float   # -15% variance
    high_cash: float  # +15% variance
    event_impact: float
    by_category: Optional[Dict[str, float]] = None


class ForecastResponse(BaseModel):
    scenario_id: Optional[int]
    months: int
    points: List[ForecastPoint]
    starting_net_worth: float
    ending_net_worth: float
    total_income: float
    total_expenses: float
