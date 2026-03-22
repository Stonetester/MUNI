"""
Forecasting service.

For each future month:
1. Historical average: for each category, compute 3/6/12-month weighted trailing average
   from actual transactions (Google Sheets, paystubs, CSV imports).
   Income categories (positive avg) and expense categories (negative avg) both included.
2. Life events: spread total_cost across monthly_breakdown entries
3. Roll forward cash: prev_cash + projected_income + projected_expenses + event_impacts
4. Net worth: cash pool + compound-grown investment accounts - liabilities
5. Compound interest: investment accounts (401k, IRA, brokerage, HYSA) grow monthly
   using blended return from InvestmentHolding records or FinancialProfile APY
6. Variance bands: ±historical CV on expenses
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime
from typing import Dict, List, Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.category import Category
from app.models.life_event import LifeEvent
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.forecast import AccountForecast, ForecastPoint, ForecastResponse

# Account type sets
ASSET_TYPES = {
    "checking", "savings", "hysa", "brokerage", "ira", "401k", "hsa", "other", "paycheck"
}
LIABILITY_TYPES = {"credit_card", "student_loan", "car_loan", "mortgage"}
SAVINGS_TYPES = {"savings", "hysa", "ira", "401k"}

# Liquid types that act as the "cash pool" — no compound growth, absorb net income/expense
CASH_POOL_TYPES = {"checking", "paycheck"}

# Investment / savings types that grow with compound interest
COMPOUND_TYPES = {"savings", "hysa", "ira", "401k", "hsa", "brokerage"}

# Default annual returns by account type (if no holdings are configured)
DEFAULT_ANNUAL_RETURNS: Dict[str, float] = {
    "401k": 8.0,
    "ira": 7.0,
    "brokerage": 8.0,
    "hsa": 6.0,
    "savings": 3.0,
    "hysa": 3.9,   # overridden by FinancialProfile.hysa_apy if set
}

FREQUENCY_MONTHS: Dict[str, float] = {
    "weekly": 1 / 4.33,       # occurrences per month
    "biweekly": 2 / 4.33,
    "monthly": 1.0,
    "bimonthly": 0.5,
    "quarterly": 1 / 3,
    "annual": 1 / 12,
    "one_time": 0.0,           # handled separately
}


def _rule_applies_to_month(rule: RecurringRule, month_start: date, month_end: date) -> bool:
    """Return True if the rule is active during this month."""
    if not rule.is_active:
        return False
    if rule.start_date > month_end:
        return False
    if rule.end_date and rule.end_date < month_start:
        return False
    if rule.frequency == "one_time":
        return rule.start_date >= month_start and rule.start_date <= month_end
    return True


def _rule_monthly_amount(rule: RecurringRule, month_start: date, month_end: date) -> float:
    """Return the expected cash flow for this rule in the given month."""
    if rule.frequency == "one_time":
        if rule.start_date >= month_start and rule.start_date <= month_end:
            return rule.amount
        return 0.0
    multiplier = FREQUENCY_MONTHS.get(rule.frequency, 1.0)
    return rule.amount * multiplier


def _get_historical_category_averages(
    user_id: int,
    db: Session,
    reference_date: date,
) -> Dict[Optional[int], Dict[str, float]]:
    """
    Compute trailing 3-, 6-, and 12-month spending averages by category_id.
    Returns {category_id: {"avg3": x, "avg6": y, "avg12": z}}.
    """
    twelve_months_ago = reference_date - relativedelta(months=12)
    six_months_ago = reference_date - relativedelta(months=6)
    three_months_ago = reference_date - relativedelta(months=3)

    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= twelve_months_ago,
            Transaction.date < reference_date,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )

    sums_12: Dict[Optional[int], float] = defaultdict(float)
    sums_6: Dict[Optional[int], float] = defaultdict(float)
    sums_3: Dict[Optional[int], float] = defaultdict(float)

    for txn in transactions:
        sums_12[txn.category_id] += txn.amount
        if txn.date >= six_months_ago:
            sums_6[txn.category_id] += txn.amount
        if txn.date >= three_months_ago:
            sums_3[txn.category_id] += txn.amount

    all_cats = set(sums_12.keys()) | set(sums_6.keys()) | set(sums_3.keys())
    result = {}
    for cat_id in all_cats:
        result[cat_id] = {
            "avg3": sums_3.get(cat_id, 0.0) / 3,
            "avg6": sums_6.get(cat_id, 0.0) / 6,
            "avg12": sums_12.get(cat_id, 0.0) / 12,
        }
    return result


def _get_historical_variance(user_id: int, db: Session, reference_date: date) -> float:
    """
    Compute the coefficient of variation of monthly spending over the last 12 months.
    Returns a fraction (e.g. 0.15 = 15% variance). Clamped to [0.05, 0.30].
    """
    twelve_months_ago = reference_date - relativedelta(months=12)
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= twelve_months_ago,
            Transaction.date < reference_date,
            Transaction.amount < 0,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )

    if not transactions:
        return 0.15

    monthly: Dict[str, float] = defaultdict(float)
    for txn in transactions:
        key = txn.date.strftime("%Y-%m")
        monthly[key] += abs(txn.amount)

    values = list(monthly.values())
    if len(values) < 2:
        return 0.15

    mean = sum(values) / len(values)
    if mean == 0:
        return 0.15

    variance = sum((v - mean) ** 2 for v in values) / len(values)
    std_dev = math.sqrt(variance)
    cv = std_dev / mean
    return max(0.05, min(0.30, cv))


def _event_impact_for_month(events: List[LifeEvent], month_str: str) -> float:
    """Sum event costs that apply to the given YYYY-MM string."""
    total = 0.0
    for event in events:
        if not event.is_active:
            continue
        if event.monthly_breakdown:
            for entry in event.monthly_breakdown:
                if isinstance(entry, dict):
                    if entry.get("month") == month_str:
                        total += entry.get("amount", 0.0)
                else:
                    if getattr(entry, "month", None) == month_str:
                        total += getattr(entry, "amount", 0.0)
        else:
            start = event.start_date
            end = event.end_date or start

            event_months = []
            cursor = start.replace(day=1)
            while cursor <= end:
                event_months.append(cursor.strftime("%Y-%m"))
                cursor = (cursor + relativedelta(months=1)).replace(day=1)

            if month_str in event_months and len(event_months) > 0:
                total += -(event.total_cost / len(event_months))

    return total


def _build_compound_account_config(
    accounts: List[Account],
    db: Session,
    user_id: int,
) -> tuple[Dict[int, float], Dict[int, float]]:
    """
    Returns (monthly_rate_map, monthly_contrib_map) for each account.
    Pulls from InvestmentHolding records first, then FinancialProfile defaults.
    Uses DEFAULT_ANNUAL_RETURNS as the final fallback for compound-type accounts.
    """
    from app.models.investment_holding import InvestmentHolding
    from app.models.financial_profile import FinancialProfile

    account_ids = [a.id for a in accounts]
    holdings = (
        db.query(InvestmentHolding)
        .filter(InvestmentHolding.account_id.in_(account_ids))
        .all()
    )

    profile = (
        db.query(FinancialProfile)
        .filter(FinancialProfile.user_id == user_id)
        .first()
    )

    monthly_rate: Dict[int, float] = {}
    monthly_contrib: Dict[int, float] = {}

    # 1. Build from InvestmentHolding records (highest priority)
    for acc in accounts:
        acc_holdings = [h for h in holdings if h.account_id == acc.id]
        if acc_holdings:
            total_val = sum(h.current_value or 0.0 for h in acc_holdings) or 1.0
            # Value-weighted blended annual return
            blended_annual = sum(
                (h.assumed_annual_return or 0.0) * (h.current_value or 0.0) / total_val
                for h in acc_holdings
            )
            monthly_rate[acc.id] = blended_annual / 100.0 / 12.0
            monthly_contrib[acc.id] = sum(h.monthly_contribution or 0.0 for h in acc_holdings)

    # 2. FinancialProfile overrides for HYSA and IRA (if not already set by holdings)
    if profile:
        for acc in accounts:
            if acc.account_type == "hysa":
                if acc.id not in monthly_rate and (profile.hysa_apy or 0) > 0:
                    monthly_rate[acc.id] = (profile.hysa_apy or 0) / 100.0 / 12.0
                if acc.id not in monthly_contrib and (profile.hysa_monthly_contribution or 0) > 0:
                    monthly_contrib[acc.id] = profile.hysa_monthly_contribution or 0.0

        ira_without_holdings = [
            a for a in accounts
            if a.account_type == "ira" and a.id not in monthly_contrib
        ]
        if ira_without_holdings and (profile.ira_monthly_contribution or 0) > 0:
            per_acc = (profile.ira_monthly_contribution or 0.0) / len(ira_without_holdings)
            for acc in ira_without_holdings:
                monthly_contrib[acc.id] = per_acc

    # 3. Default annual returns for compound accounts with no other source
    for acc in accounts:
        if acc.account_type in COMPOUND_TYPES and acc.id not in monthly_rate:
            default_annual = DEFAULT_ANNUAL_RETURNS.get(acc.account_type, 5.0)
            monthly_rate[acc.id] = default_annual / 100.0 / 12.0

    return monthly_rate, monthly_contrib


def run_forecast(
    user: User,
    db: Session,
    scenario_id: Optional[int],
    months: int = 60,
) -> ForecastResponse:
    today = date.today()
    month_start = today.replace(day=1)

    # ── Accounts ──────────────────────────────────────────────────────────────
    accounts = (
        db.query(Account)
        .filter(Account.user_id == user.id, Account.is_active == True)
        .all()
    )

    # Categories map: id → name
    categories_map: Dict[Optional[int], str] = {
        c.id: c.name
        for c in db.query(Category).filter(Category.user_id == user.id).all()
    }

    # ── Compound interest config ───────────────────────────────────────────────
    account_monthly_rate, account_monthly_contrib = _build_compound_account_config(
        accounts, db, user.id
    )

    # ── Starting balances ─────────────────────────────────────────────────────
    account_balances: Dict[int, float] = {a.id: float(a.balance) for a in accounts}

    # Separate accounts into cash pool (no compound growth) vs compound accounts
    cash_pool_ids = {a.id for a in accounts if a.account_type in CASH_POOL_TYPES}
    compound_ids = {a.id for a in accounts if a.account_type in COMPOUND_TYPES}
    liability_ids = {a.id for a in accounts if a.account_type in LIABILITY_TYPES}

    # Starting net worth
    starting_assets = sum(
        a.balance for a in accounts
        if a.account_type in ASSET_TYPES and a.balance > 0
    )
    starting_liabilities = sum(
        abs(a.balance) for a in accounts
        if a.account_type in LIABILITY_TYPES or a.balance < 0
    )
    starting_net_worth = starting_assets - starting_liabilities

    # Running cash pool = checking + paycheck accounts
    running_cash = sum(a.balance for a in accounts if a.id in cash_pool_ids)

    # Running compound balances for investment/savings accounts
    running_compound: Dict[int, float] = {
        a.id: float(a.balance)
        for a in accounts if a.id in compound_ids
    }

    # For backward compat: savings_total starts as HYSA + savings + IRA + 401k balances
    savings_total = sum(a.balance for a in accounts if a.account_type in SAVINGS_TYPES)

    # Per-account balance history for account_forecasts output
    account_balance_history: Dict[int, List[float]] = {a.id: [] for a in accounts}

    # ── Life events ───────────────────────────────────────────────────────────
    all_events = (
        db.query(LifeEvent)
        .filter(
            LifeEvent.user_id == user.id,
            LifeEvent.is_active == True,
        )
        .filter(
            (LifeEvent.scenario_id.is_(None)) |
            (LifeEvent.scenario_id == scenario_id if scenario_id is not None else LifeEvent.scenario_id.is_(None))
        )
        .all()
    )

    # ── Historical averages ───────────────────────────────────────────────────
    hist_avgs = _get_historical_category_averages(user.id, db, today)
    variance_pct = _get_historical_variance(user.id, db, today)

    # ── Main forecast loop ────────────────────────────────────────────────────
    points: List[ForecastPoint] = []
    total_income = 0.0
    total_expenses = 0.0

    for i in range(months):
        ms = (month_start + relativedelta(months=i)).replace(day=1)
        import calendar
        last_day = calendar.monthrange(ms.year, ms.month)[1]
        me = ms.replace(day=last_day)
        month_str = ms.strftime("%Y-%m")

        month_income = 0.0
        month_expenses = 0.0
        by_category: Dict[str, float] = {}

        # All projections are based on weighted historical category averages
        # (3-month avg weighted 50%, 6-month 30%, 12-month 20%) from real transactions.
        # Income categories (positive avg) and expense categories (negative avg) both included.
        for cat_id, avgs in hist_avgs.items():
            hist_amount = avgs["avg3"] * 0.5 + avgs["avg6"] * 0.3 + avgs["avg12"] * 0.2
            if hist_amount < 0:
                month_expenses += hist_amount
            elif hist_amount > 0:
                month_income += hist_amount
            if hist_amount != 0:
                cat_key = categories_map.get(cat_id, "Uncategorized") if cat_id else "Uncategorized"
                by_category[cat_key] = by_category.get(cat_key, 0.0) + hist_amount

        # Life event impacts
        event_impact = _event_impact_for_month(all_events, month_str)

        net = month_income + month_expenses  # expenses are negative
        running_cash += net + event_impact

        # ── Compound growth on investment/savings accounts ─────────────────
        for acc_id in list(running_compound.keys()):
            rate = account_monthly_rate.get(acc_id, 0.0)
            contrib = account_monthly_contrib.get(acc_id, 0.0)
            # FV formula per month: balance = balance * (1 + r) + contribution
            running_compound[acc_id] = running_compound[acc_id] * (1.0 + rate) + contrib

        # Record per-account balances for account_forecasts
        for acc in accounts:
            if acc.id in cash_pool_ids:
                # Approximate: distribute running_cash proportionally to starting balance
                pool_total = sum(account_balances[aid] for aid in cash_pool_ids) or 1.0
                share = account_balances[acc.id] / pool_total
                account_balance_history[acc.id].append(round(running_cash * share, 2))
            elif acc.id in compound_ids:
                account_balance_history[acc.id].append(round(running_compound[acc.id], 2))
            else:
                # Liability or non-compound other — static for now
                account_balance_history[acc.id].append(round(account_balances[acc.id], 2))

        # ── Net worth ─────────────────────────────────────────────────────────
        # = liquid cash pool + compound investment balances - liabilities
        compound_total = sum(running_compound.values())
        liability_total = sum(
            abs(account_balances[acc_id]) for acc_id in liability_ids
        )
        current_net_worth = running_cash + compound_total - liability_total

        # savings_total = sum of savings-type compound balances (for savings_total field)
        current_savings_total = sum(
            running_compound[acc_id]
            for acc_id in compound_ids
            if any(a.id == acc_id and a.account_type in SAVINGS_TYPES for a in accounts)
        )

        # Variance bands on cash position
        low_cash = running_cash - abs(month_expenses) * variance_pct
        high_cash = running_cash + abs(month_expenses) * variance_pct

        total_income += month_income
        total_expenses += month_expenses

        points.append(
            ForecastPoint(
                month=month_str,
                income=round(month_income, 2),
                expenses=round(month_expenses, 2),
                net=round(net, 2),
                cash=round(running_cash, 2),
                net_worth=round(current_net_worth, 2),
                savings_total=round(current_savings_total, 2),
                low_cash=round(low_cash, 2),
                high_cash=round(high_cash, 2),
                event_impact=round(event_impact, 2),
                by_category=by_category,
            )
        )

    ending_net_worth = points[-1].net_worth if points else starting_net_worth

    # ── Build account_forecasts ───────────────────────────────────────────────
    account_forecasts: List[AccountForecast] = []
    for acc in accounts:
        if acc.account_type not in (ASSET_TYPES | LIABILITY_TYPES):
            continue
        history = account_balance_history[acc.id]
        annual_return = account_monthly_rate.get(acc.id, 0.0) * 12.0 * 100.0
        contrib = account_monthly_contrib.get(acc.id, 0.0)
        account_forecasts.append(
            AccountForecast(
                account_id=acc.id,
                account_name=acc.name,
                account_type=acc.account_type,
                starting_balance=account_balances[acc.id],
                ending_balance=history[-1] if history else account_balances[acc.id],
                monthly_balances=history,
                annual_return_pct=round(annual_return, 2),
                monthly_contribution=round(contrib, 2),
            )
        )

    return ForecastResponse(
        scenario_id=scenario_id,
        months=months,
        points=points,
        starting_net_worth=round(starting_net_worth, 2),
        ending_net_worth=round(ending_net_worth, 2),
        total_income=round(total_income, 2),
        total_expenses=round(total_expenses, 2),
        account_forecasts=account_forecasts,
    )
