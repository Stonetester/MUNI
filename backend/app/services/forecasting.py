"""
Forecasting service.

For each future month:
1. Base income: sum all active RecurringRules with positive amounts for that period
2. Base expenses: sum all active RecurringRules with negative amounts for that period
3. Historical average: for each category, compute 3/6/12-month trailing averages
4. Category forecast: if category has recurring rule, use that; else use historical average
5. Life events: spread total_cost across monthly_breakdown entries
6. Scenario overrides: apply difference vs baseline recurring rules
7. Roll forward cash: prev_cash + income + expenses + event_impacts
8. Net worth: assets - liabilities using account balances + accumulated cash
9. Savings total: sum of savings/hysa/ira/401k account balances
10. Variance bands: ±15% based on historical spending variance
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime
from typing import Dict, List, Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.life_event import LifeEvent
from app.models.recurring_rule import RecurringRule
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.forecast import ForecastPoint, ForecastResponse

# Account type sets
ASSET_TYPES = {
    "checking", "savings", "hysa", "brokerage", "ira", "401k", "hsa", "other", "paycheck"
}
LIABILITY_TYPES = {"credit_card", "student_loan", "car_loan", "mortgage"}
SAVINGS_TYPES = {"savings", "hysa", "ira", "401k"}

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
        # Only applies in the month its start_date falls in
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

    # Accumulate by category and period
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
    Returns a fraction (e.g. 0.15 = 15% variance).  Clamped to [0.05, 0.30].
    """
    twelve_months_ago = reference_date - relativedelta(months=12)
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= twelve_months_ago,
            Transaction.date < reference_date,
            Transaction.amount < 0,  # expenses only
            Transaction.scenario_id.is_(None),
        )
        .all()
    )

    if not transactions:
        return 0.15  # default

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
            # Evenly distribute total_cost across the event's active months
            start = event.start_date
            end = event.end_date or start

            event_months = []
            cursor = start.replace(day=1)
            while cursor <= end:
                event_months.append(cursor.strftime("%Y-%m"))
                cursor = (cursor + relativedelta(months=1)).replace(day=1)

            if month_str in event_months and len(event_months) > 0:
                total += -(event.total_cost / len(event_months))  # cost = negative cash flow

    return total


def run_forecast(
    user: User,
    db: Session,
    scenario_id: Optional[int],
    months: int = 60,
) -> ForecastResponse:
    today = date.today()
    month_start = today.replace(day=1)

    # Load accounts
    accounts = (
        db.query(Account)
        .filter(Account.user_id == user.id, Account.is_active == True)
        .all()
    )

    # Starting balances
    account_balances: Dict[int, float] = {a.id: a.balance for a in accounts}

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

    # Current cash = sum of liquid accounts
    liquid_types = {"checking", "savings", "hysa", "paycheck"}
    current_cash = sum(a.balance for a in accounts if a.account_type in liquid_types)

    # Savings total
    savings_total = sum(a.balance for a in accounts if a.account_type in SAVINGS_TYPES)

    # Load recurring rules (baseline = no scenario filter + scenario-specific)
    base_rules = (
        db.query(RecurringRule)
        .filter(
            RecurringRule.user_id == user.id,
            RecurringRule.is_active == True,
            RecurringRule.scenario_id.is_(None),
        )
        .all()
    )

    scenario_rules: List[RecurringRule] = []
    if scenario_id is not None:
        scenario_rules = (
            db.query(RecurringRule)
            .filter(
                RecurringRule.user_id == user.id,
                RecurringRule.is_active == True,
                RecurringRule.scenario_id == scenario_id,
            )
            .all()
        )

    all_rules = base_rules + scenario_rules

    # Load life events
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

    # Historical averages
    hist_avgs = _get_historical_category_averages(user.id, db, today)
    variance_pct = _get_historical_variance(user.id, db, today)

    # Categories with recurring rules (use recurring, not historical)
    categories_with_rules = {r.category_id for r in all_rules if r.category_id is not None}

    points: List[ForecastPoint] = []
    total_income = 0.0
    total_expenses = 0.0
    running_cash = current_cash
    running_savings = savings_total
    # Track per-account deltas for net worth
    running_account_balances: Dict[int, float] = dict(account_balances)

    for i in range(months):
        ms = (month_start + relativedelta(months=i)).replace(day=1)
        import calendar
        last_day = calendar.monthrange(ms.year, ms.month)[1]
        me = ms.replace(day=last_day)
        month_str = ms.strftime("%Y-%m")

        month_income = 0.0
        month_expenses = 0.0
        by_category: Dict[str, float] = {}

        # Recurring rules contribution
        for rule in all_rules:
            if _rule_applies_to_month(rule, ms, me):
                amount = _rule_monthly_amount(rule, ms, me)
                if amount > 0:
                    month_income += amount
                else:
                    month_expenses += amount

        # Historical category averages (for categories without rules)
        for cat_id, avgs in hist_avgs.items():
            if cat_id in categories_with_rules:
                continue
            # Use weighted average (prefer shorter window for stability)
            hist_amount = (avgs["avg3"] * 0.5 + avgs["avg6"] * 0.3 + avgs["avg12"] * 0.2)
            if hist_amount < 0:
                month_expenses += hist_amount
            # Don't double-count income; recurring rules handle that

        # by_category: sum recurring rules by category
        for rule in all_rules:
            if _rule_applies_to_month(rule, ms, me):
                amount = _rule_monthly_amount(rule, ms, me)
                cat_key = str(rule.category_id) if rule.category_id else "Uncategorized"
                by_category[cat_key] = by_category.get(cat_key, 0.0) + amount

        # Life event impacts
        event_impact = _event_impact_for_month(all_events, month_str)

        net = month_income + month_expenses  # expenses are negative
        running_cash += net + event_impact

        # Accumulate into savings accounts (simplified: contributions from recurring rules
        # tagged to savings account types)
        savings_contribution = sum(
            _rule_monthly_amount(r, ms, me)
            for r in all_rules
            if _rule_applies_to_month(r, ms, me)
            and r.account_id is not None
            and any(a.id == r.account_id and a.account_type in SAVINGS_TYPES for a in accounts)
        )
        running_savings += savings_contribution

        # Net worth: starting + cumulative net flows
        asset_accounts_balance = sum(
            b for acc_id, b in running_account_balances.items()
            if any(a.id == acc_id and a.account_type in ASSET_TYPES for a in accounts)
        )
        liability_accounts_balance = sum(
            abs(b) for acc_id, b in running_account_balances.items()
            if any(a.id == acc_id and a.account_type in LIABILITY_TYPES for a in accounts)
        )
        # Adjust cash position into net worth
        current_net_worth = running_cash + running_savings + (
            asset_accounts_balance - sum(
                a.balance for a in accounts
                if a.account_type in liquid_types or a.account_type in SAVINGS_TYPES
            )
        ) - liability_accounts_balance

        # Variance bands ±variance_pct on expenses
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
                savings_total=round(running_savings, 2),
                low_cash=round(low_cash, 2),
                high_cash=round(high_cash, 2),
                event_impact=round(event_impact, 2),
                by_category=by_category,
            )
        )

    ending_net_worth = points[-1].net_worth if points else starting_net_worth

    return ForecastResponse(
        scenario_id=scenario_id,
        months=months,
        points=points,
        starting_net_worth=round(starting_net_worth, 2),
        ending_net_worth=round(ending_net_worth, 2),
        total_income=round(total_income, 2),
        total_expenses=round(total_expenses, 2),
    )
