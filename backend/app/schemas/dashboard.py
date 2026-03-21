from typing import List, Dict, Optional

from pydantic import BaseModel

from app.schemas.forecast import ForecastPoint
from app.schemas.transaction import TransactionOut
from app.schemas.life_event import LifeEventOut


class MonthSummary(BaseModel):
    income: float
    spending: float
    savings: float
    by_category: Dict[str, float]


class AccountBalanceSummary(BaseModel):
    account_type: str
    total: float
    accounts: List[Dict]


class DashboardResponse(BaseModel):
    total_assets: float
    total_liabilities: float
    net_worth: float
    balances_by_type: List[AccountBalanceSummary]
    this_month: MonthSummary
    last_month: MonthSummary
    upcoming_events: List[LifeEventOut]
    forecast_preview: List[ForecastPoint]   # 6 forward months (for net-worth chart)
    flow_months: List[ForecastPoint]         # 12 months: 6 past actual + current + 5 future
    recent_transactions: List[TransactionOut]
