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
    # ── Full provenance so every projected balance is explainable in the UI ──
    rate_source: str = "none"          # "measured_xirr" | "holdings_assumed" | "profile_apy" | "type_default" | "none"
    rate_basis: str = ""               # plain-language: where the growth rate came from + the math
    starting_balance_source: str = ""  # "latest statement snapshot (date)" vs "manually set account balance"
    projection_formula: str = ""       # the exact month-step formula applied to this account


class SpendingModelRow(BaseModel):
    """One category of the projected-spending model — the exact inputs behind every
    forecast month's income/expense lines, so 'predicted spending' is auditable."""
    category: str
    kind: str            # "income" | "expense" | "savings" (cash-rolled, not shown as spending) | "excluded"
    avg3: float = 0.0    # trailing 3-month average (per month)
    avg6: float = 0.0
    avg12: float = 0.0
    monthly: float = 0.0  # the number actually projected = avg3*0.5 + avg6*0.3 + avg12*0.2
    note: str = ""


class ForecastResponse(BaseModel):
    scenario_id: Optional[int]
    months: int
    points: List[ForecastPoint]
    starting_net_worth: float
    ending_net_worth: float
    total_income: float
    total_expenses: float  # positive magnitude
    account_forecasts: List[AccountForecast] = []
    # The spending/income model behind every projected month, with the blend math.
    spending_model: List[SpendingModelRow] = []
    spending_model_formula: str = "projected monthly amount = 3-mo avg × 50% + 6-mo avg × 30% + 12-mo avg × 20% (from real transactions)"
    variance_pct: float = 0.0
    variance_basis: str = ""
