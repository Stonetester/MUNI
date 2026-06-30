from typing import List, Optional, Dict

from pydantic import BaseModel, Field


class NetWorthBreakdownItem(BaseModel):
    account_id: int
    account_name: str
    account_type: str
    balance: float
    is_liability: bool = False
    source: str
    as_of: Optional[str] = None


class ForecastPoint(BaseModel):
    month: str  # YYYY-MM
    income: float
    expenses: float  # positive magnitude
    net: float  # income - expenses
    cash: float
    net_worth: float
    savings_total: float
    low_cash: float   # -variance on expenses
    high_cash: float  # +variance on expenses
    event_impact: float
    by_category: Optional[Dict[str, float]] = None
    net_worth_breakdown: List[NetWorthBreakdownItem] = Field(default_factory=list)
    calculation_method: str = "forecast"
    calculation_note: Optional[str] = None


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
    contribution_source: str = "none"  # "paystub" | "measured" | "manual_fallback" | "statement_parsed" | "statement_recent" | "holding" | "paycheck" | "profile" | "none"
    contribution_label: str = ""       # short human label, e.g. "measured avg (6 mo)"
    contribution_basis: str = ""       # one-line explanation for tooltip/footer
    # Informational only — the all-time average contribution from statements. Shown
    # alongside the forecast figure so the user can compare recent pace vs lifetime;
    # NOT used to project future balances. None when there's no statement data.
    lifetime_monthly_contribution: Optional[float] = None
    lifetime_contribution_basis: str = ""


class ForecastResponse(BaseModel):
    scenario_id: Optional[int]
    months: int
    points: List[ForecastPoint]
    starting_net_worth: float
    ending_net_worth: float
    total_income: float
    total_expenses: float  # positive magnitude
    account_forecasts: List[AccountForecast] = []
