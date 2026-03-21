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
    low_cash: float   # -variance on expenses
    high_cash: float  # +variance on expenses
    event_impact: float
    by_category: Optional[Dict[str, float]] = None


class AccountForecast(BaseModel):
    """Per-account balance projection for the full forecast horizon."""
    account_id: int
    account_name: str
    account_type: str
    starting_balance: float
    ending_balance: float
    monthly_balances: List[float]      # one entry per forecast month
    annual_return_pct: float = 0.0    # blended annual return used (for display)
    monthly_contribution: float = 0.0  # monthly contribution applied


class ForecastResponse(BaseModel):
    scenario_id: Optional[int]
    months: int
    points: List[ForecastPoint]
    starting_net_worth: float
    ending_net_worth: float
    total_income: float
    total_expenses: float
    account_forecasts: List[AccountForecast] = []
