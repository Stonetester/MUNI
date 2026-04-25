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
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.balance_snapshot import BalanceSnapshot
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


def _latest_snapshot_balances(account_ids: List[int], db: Session) -> Dict[int, float]:
    """Return {account_id: balance} from the most recent BalanceSnapshot for each account."""
    if not account_ids:
        return {}
    snapshots = (
        db.query(BalanceSnapshot)
        .filter(BalanceSnapshot.account_id.in_(account_ids))
        .order_by(BalanceSnapshot.date.desc())
        .all()
    )
    result: Dict[int, float] = {}
    for snap in snapshots:
        if snap.account_id not in result:
            result[snap.account_id] = float(snap.balance)
    return result


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


def _infer_pay_schedule(user_id: int, db: Session) -> Optional[Dict]:
    """
    Examine the last 12 regular (non-bonus) paystubs to detect pay frequency and
    the typical day-of-month pattern.

    Returns a dict with:
      - "net_pay": float — median net pay per paycheck
      - "frequency": str — "semi_monthly" | "biweekly" | "monthly"
      - "interval_days": int — calendar days between paychecks
      - "anchor_pay_date": date — most recent pay date in the DB
      - "pay_days_of_month": list[int] — for semi_monthly, the two DOM anchors (e.g. [1, 15])

    Returns None if fewer than 2 regular paystubs exist.
    """
    from app.models.paystub import Paystub
    import statistics

    stubs = (
        db.query(Paystub)
        .filter(
            Paystub.user_id == user_id,
            Paystub.pay_type != "bonus",
            Paystub.net_pay.isnot(None),
        )
        .order_by(Paystub.pay_date.desc())
        .limit(12)
        .all()
    )

    if len(stubs) < 2:
        return None

    pay_dates = sorted(s.pay_date for s in stubs)
    net_pays = [s.net_pay for s in stubs if s.net_pay]
    median_net = statistics.median(net_pays) if net_pays else 0.0

    # Compute gaps between consecutive pay dates
    gaps = [(pay_dates[i + 1] - pay_dates[i]).days for i in range(len(pay_dates) - 1)]
    median_gap = statistics.median(gaps)

    if median_gap <= 16:
        frequency = "biweekly"
        interval_days = 14
    elif median_gap <= 20:
        frequency = "semi_monthly"
        interval_days = 0  # not fixed-interval; use DOM pattern
    else:
        frequency = "monthly"
        interval_days = 30

    # For semi_monthly: extract the two consistent days-of-month
    pay_days_of_month: List[int] = []
    if frequency == "semi_monthly":
        dom_values = sorted({d.day for d in pay_dates})
        # Cluster: anything ≤ 16 is the "first half" pay, anything > 16 is "second half"
        first_half = [d for d in dom_values if d <= 16]
        second_half = [d for d in dom_values if d > 16]
        dom1 = round(statistics.median(first_half)) if first_half else 1
        dom2 = round(statistics.median(second_half)) if second_half else 15
        pay_days_of_month = sorted([dom1, dom2])

    return {
        "net_pay": round(median_net, 2),
        "frequency": frequency,
        "interval_days": interval_days,
        "anchor_pay_date": pay_dates[-1],  # most recent pay date
        "pay_days_of_month": pay_days_of_month,
    }


def _pay_dates_between(
    schedule: Dict,
    start: date,
    end: date,
) -> List[date]:
    """
    Return every expected pay date in (start, end] — exclusive of start, inclusive of end.
    Uses the inferred schedule from _infer_pay_schedule.
    """
    results: List[date] = []
    if schedule["frequency"] == "semi_monthly":
        dom1, dom2 = schedule["pay_days_of_month"]
        cursor = date(start.year, start.month, 1)
        while cursor <= end + relativedelta(months=1):
            for dom in [dom1, dom2]:
                import calendar as _cal
                last_day = _cal.monthrange(cursor.year, cursor.month)[1]
                actual_dom = min(dom, last_day)
                d = date(cursor.year, cursor.month, actual_dom)
                if start < d <= end:
                    results.append(d)
            cursor = (cursor + relativedelta(months=1)).replace(day=1)
    elif schedule["frequency"] == "biweekly":
        anchor = schedule["anchor_pay_date"]
        # Walk forward from anchor in 14-day steps
        d = anchor
        while d <= end:
            if d > start:
                results.append(d)
            d = d + relativedelta(days=14)
        # Also walk backward in case anchor is after start
        d = anchor - relativedelta(days=14)
        while d > start:
            if d <= end:
                results.append(d)
            d = d - relativedelta(days=14)
    else:  # monthly
        anchor = schedule["anchor_pay_date"]
        dom = anchor.day
        cursor = date(start.year, start.month, 1)
        while cursor <= end + relativedelta(months=1):
            import calendar as _cal
            last_day = _cal.monthrange(cursor.year, cursor.month)[1]
            d = date(cursor.year, cursor.month, min(dom, last_day))
            if start < d <= end:
                results.append(d)
            cursor = (cursor + relativedelta(months=1)).replace(day=1)

    return sorted(set(results))


def compute_estimated_balances(
    accounts: List[Account],
    db: Session,
    user_id: int,
) -> Dict[int, Dict[str, object]]:
    """
    For each account, compute an estimated current balance by forward-projecting
    from the most recent BalanceSnapshot (or Account.balance if no snapshot) to today.

    Compound accounts (HYSA, 401k, IRA, etc.) use FV compound-growth + contribution.
    Cash pool accounts (checking, savings) use paycheck schedule inference:
      estimated = anchor + (paychecks_landed × net_pay) - prorated_expenses
    Liabilities return a static balance.

    Returns {account_id: {
        "estimated": float,
        "actual": float|None,
        "last_snapshot_date": date|None,
        "monthly_contribution": float,
        "anchor_date": date,
        "next_pay_date": date|None,
        "paychecks_since_anchor": int,
    }}.
    """
    today = date.today()

    # Latest snapshot for each account
    account_ids = [a.id for a in accounts]
    all_snapshots = (
        db.query(BalanceSnapshot)
        .filter(BalanceSnapshot.account_id.in_(account_ids))
        .order_by(BalanceSnapshot.date.desc())
        .all()
    )
    latest_snapshot: Dict[int, BalanceSnapshot] = {}
    for snap in all_snapshots:
        if snap.account_id not in latest_snapshot:
            latest_snapshot[snap.account_id] = snap

    monthly_rate, monthly_contrib = _build_compound_account_config(accounts, db, user_id)

    # Infer pay schedule and historical expense rate once for this user
    pay_schedule = _infer_pay_schedule(user_id, db)

    # Monthly expense average (negative transactions, last 6 months)
    six_months_ago = today - relativedelta(months=6)
    expense_txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= six_months_ago,
            Transaction.date < today,
            Transaction.amount < 0,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )
    total_expenses_6mo = sum(abs(t.amount) for t in expense_txns)
    avg_monthly_expenses = total_expenses_6mo / 6.0 if total_expenses_6mo else 0.0

    # Compute next pay date after today (used in response)
    next_pay_date: Optional[date] = None
    if pay_schedule:
        future_dates = _pay_dates_between(pay_schedule, today, today + relativedelta(months=2))
        next_pay_date = future_dates[0] if future_dates else None

    results: Dict[int, Dict[str, object]] = {}
    for acc in accounts:
        snap = latest_snapshot.get(acc.id)

        actual_balance = float(snap.balance) if snap else None

        if snap:
            anchor_balance = float(snap.balance)
            anchor_date: date = snap.date
        else:
            anchor_balance = float(acc.balance)
            anchor_date = acc.created_at.date() if acc.created_at else today

        # ── Cash pool accounts: project using paycheck cadence ─────────────
        if acc.account_type in CASH_POOL_TYPES:
            paychecks_landed = 0
            if pay_schedule and anchor_date < today:
                landed = _pay_dates_between(pay_schedule, anchor_date, today)
                paychecks_landed = len(landed)

            # Days elapsed since anchor
            days_elapsed = max(0, (today - anchor_date).days)
            # Prorate expenses: daily rate × days elapsed
            daily_expense_rate = avg_monthly_expenses / 30.44
            prorated_expenses = daily_expense_rate * days_elapsed

            paycheck_income = paychecks_landed * (pay_schedule["net_pay"] if pay_schedule else 0.0)
            estimated = anchor_balance + paycheck_income - prorated_expenses

            results[acc.id] = {
                "estimated": round(estimated, 2),
                "actual": actual_balance,
                "last_snapshot_date": snap.date if snap else None,
                "monthly_contribution": round(pay_schedule["net_pay"] * (
                    2 if pay_schedule["frequency"] == "semi_monthly" else
                    (4.33 / 2 if pay_schedule["frequency"] == "biweekly" else 1)
                ), 2) if pay_schedule else 0.0,
                "anchor_date": anchor_date,
                "next_pay_date": next_pay_date,
                "paychecks_since_anchor": paychecks_landed,
            }
            continue

        # ── Liabilities and other non-compound accounts ─────────────────────
        if acc.account_type not in COMPOUND_TYPES:
            results[acc.id] = {
                "estimated": actual_balance if actual_balance is not None else float(acc.balance),
                "actual": actual_balance,
                "last_snapshot_date": snap.date if snap else None,
                "monthly_contribution": 0.0,
                "anchor_date": anchor_date,
                "next_pay_date": None,
                "paychecks_since_anchor": 0,
            }
            continue

        # ── Compound accounts: FV formula ────────────────────────────────────
        rate = monthly_rate.get(acc.id, 0.0)
        contrib = monthly_contrib.get(acc.id, 0.0)

        if anchor_date >= today:
            months_elapsed = 0
        else:
            months_elapsed = (
                (today.year - anchor_date.year) * 12
                + (today.month - anchor_date.month)
            )
            if today.day < anchor_date.day:
                months_elapsed = max(0, months_elapsed - 1)

        balance = anchor_balance
        if months_elapsed > 0:
            if rate > 0:
                growth_factor = (1.0 + rate) ** months_elapsed
                balance = anchor_balance * growth_factor + contrib * (growth_factor - 1.0) / rate
            else:
                balance = anchor_balance + contrib * months_elapsed

        results[acc.id] = {
            "estimated": round(balance, 2),
            "actual": actual_balance,
            "last_snapshot_date": snap.date if snap else None,
            "monthly_contribution": round(contrib, 2),
            "anchor_date": anchor_date,
            "next_pay_date": None,
            "paychecks_since_anchor": 0,
        }

    return results


def run_forecast(
    user: User,
    db: Session,
    scenario_id: Optional[int],
    months: int = 60,
) -> ForecastResponse:
    today = date.today()
    month_start = today.replace(day=1)

    # ── Accounts ──────────────────────────────────────────────────────────────
    # Include joint accounts so Katherine sees (and contributes to) the shared HYSA.
    accounts = (
        db.query(Account)
        .filter(
            Account.is_active == True,
            or_(
                Account.user_id == user.id,
                Account.joint_user_id == user.id,
                Account.is_joint == True,
            ),
        )
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
    # Seed from Account.balance, then override with the most recent BalanceSnapshot
    # so that uploaded statement PDFs (EverBank, JH, Schwab) are reflected correctly.
    account_balances: Dict[int, float] = {a.id: float(a.balance) for a in accounts}
    account_balances.update(_latest_snapshot_balances(list(account_balances.keys()), db))

    # Separate accounts into cash pool (no compound growth) vs compound accounts
    cash_pool_ids = {a.id for a in accounts if a.account_type in CASH_POOL_TYPES}
    compound_ids = {a.id for a in accounts if a.account_type in COMPOUND_TYPES}
    liability_ids = {a.id for a in accounts if a.account_type in LIABILITY_TYPES}

    # Starting net worth
    starting_assets = sum(
        account_balances[a.id] for a in accounts
        if a.account_type in ASSET_TYPES and account_balances[a.id] > 0
    )
    starting_liabilities = sum(
        abs(account_balances[a.id]) for a in accounts
        if a.account_type in LIABILITY_TYPES or account_balances[a.id] < 0
    )
    starting_net_worth = starting_assets - starting_liabilities

    # Running cash pool = checking + paycheck accounts
    running_cash = sum(account_balances[a.id] for a in accounts if a.id in cash_pool_ids)

    # Running compound balances for investment/savings accounts
    running_compound: Dict[int, float] = {
        a.id: account_balances[a.id]
        for a in accounts if a.id in compound_ids
    }

    # For backward compat: savings_total starts as HYSA + savings + IRA + 401k balances
    savings_total = sum(account_balances[a.id] for a in accounts if a.account_type in SAVINGS_TYPES)

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

    # For joint compound accounts that this user contributes to but doesn't own,
    # derive their monthly contribution from their Savings Transfer (savings-kind)
    # historical average. This correctly models Katherine contributing $1,700/month
    # to the shared HYSA: her cash decreases (Savings Transfer outflow) and the
    # joint HYSA compound balance grows by that amount each month.
    joint_non_owned = [
        a for a in accounts
        if a.id in compound_ids and a.user_id != user.id
    ]
    if joint_non_owned:
        savings_kind_ids = {
            c.id
            for c in db.query(Category).filter(
                Category.user_id == user.id,
                Category.kind == "savings",
            ).all()
        }
        partner_contrib = 0.0
        for cat_id, avgs in hist_avgs.items():
            if cat_id in savings_kind_ids:
                weighted = avgs["avg3"] * 0.5 + avgs["avg6"] * 0.3 + avgs["avg12"] * 0.2
                if weighted < 0:
                    partner_contrib += abs(weighted)
        for acc in joint_non_owned:
            if account_monthly_contrib.get(acc.id, 0.0) == 0.0 and partner_contrib > 0:
                account_monthly_contrib[acc.id] = partner_contrib

    # ── Recurring rules (supplement historical averages for missing categories) ──
    from app.models.recurring_rule import RecurringRule
    scenario_filter = (
        (RecurringRule.scenario_id.is_(None)) |
        (RecurringRule.scenario_id == scenario_id)
        if scenario_id is not None
        else RecurringRule.scenario_id.is_(None)
    )
    all_rules = (
        db.query(RecurringRule)
        .filter(
            RecurringRule.user_id == user.id,
            RecurringRule.is_active == True,
        )
        .filter(scenario_filter)
        .all()
    )
    # Category IDs already covered by historical data — avoid double-counting
    hist_covered_cats: set = {cat_id for cat_id in hist_avgs if hist_avgs[cat_id].get("avg6", 0) != 0}

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

        # Recurring rules supplement historical averages for categories with no history
        for rule in all_rules:
            if rule.category_id in hist_covered_cats:
                continue  # already covered by historical data
            if _rule_applies_to_month(rule, ms, me):
                rule_amount = _rule_monthly_amount(rule, ms, me)
                if rule_amount > 0:
                    month_income += rule_amount
                elif rule_amount < 0:
                    month_expenses += rule_amount
                if rule_amount != 0:
                    cat_key = categories_map.get(rule.category_id, "Uncategorized") if rule.category_id else "Uncategorized"
                    by_category[cat_key] = by_category.get(cat_key, 0.0) + rule_amount

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


def run_joint_forecast(
    db: Session,
    months: int = 60,
) -> ForecastResponse:
    """
    Combined household forecast across all users.
    Unique accounts only (joint accounts counted once under the owner).
    Monthly contributions to compound accounts are summed from all users.
    Savings-kind outflows from users who don't own a savings account are excluded
    from cash flow — they are captured as contributions to the joint compound account.
    """
    from app.models.user import User as UserModel
    from app.models.category import Category as CategoryModel

    today = date.today()
    month_start = today.replace(day=1)

    # ── All unique accounts across all users (owner's copy only for joint accounts) ──
    users = db.query(UserModel).all()
    seen_ids: set = set()
    all_accounts: List[Account] = []
    for u in users:
        for a in db.query(Account).filter(Account.user_id == u.id, Account.is_active == True).all():
            if a.id not in seen_ids:
                all_accounts.append(a)
                seen_ids.add(a.id)

    # ── Compound config: each user contributes to their owned accounts ──
    account_monthly_rate: Dict[int, float] = {}
    account_monthly_contrib: Dict[int, float] = {}

    for u in users:
        owned = [a for a in all_accounts if a.user_id == u.id]
        rate_map, contrib_map = _build_compound_account_config(owned, db, u.id)
        for acc_id, rate in rate_map.items():
            if acc_id not in account_monthly_rate:
                account_monthly_rate[acc_id] = rate
        for acc_id, contrib in contrib_map.items():
            account_monthly_contrib[acc_id] = account_monthly_contrib.get(acc_id, 0.0) + contrib

    # For users without their own savings account, add their savings-transfer avg
    # to the joint compound account (e.g. Katherine's $1,700 → joint HYSA).
    joint_compound_ids = {
        a.id for a in all_accounts
        if a.account_type in COMPOUND_TYPES and a.is_joint
    }
    for u in users:
        owned = [a for a in all_accounts if a.user_id == u.id]
        user_has_savings = any(a.account_type in ("hysa", "savings") for a in owned)
        if not user_has_savings and joint_compound_ids:
            user_hist = _get_historical_category_averages(u.id, db, today)
            savings_cats = {
                c.id for c in db.query(CategoryModel).filter(
                    CategoryModel.user_id == u.id,
                    CategoryModel.kind == "savings",
                ).all()
            }
            partner_contrib = 0.0
            for cat_id, avgs in user_hist.items():
                if cat_id in savings_cats:
                    w = avgs["avg3"] * 0.5 + avgs["avg6"] * 0.3 + avgs["avg12"] * 0.2
                    if w < 0:
                        partner_contrib += abs(w)
            for acc_id in joint_compound_ids:
                account_monthly_contrib[acc_id] = (
                    account_monthly_contrib.get(acc_id, 0.0) + partner_contrib
                )

    # Also apply DEFAULT_ANNUAL_RETURNS for any compound account with no rate yet
    for a in all_accounts:
        if a.account_type in COMPOUND_TYPES and a.id not in account_monthly_rate:
            default_annual = DEFAULT_ANNUAL_RETURNS.get(a.account_type, 5.0)
            account_monthly_rate[a.id] = default_annual / 100.0 / 12.0

    # ── Starting balances ──
    # Seed from Account.balance, then override with the most recent BalanceSnapshot
    # so that uploaded statement PDFs (EverBank, JH, Schwab) are reflected correctly.
    account_balances: Dict[int, float] = {a.id: float(a.balance) for a in all_accounts}
    account_balances.update(_latest_snapshot_balances(list(account_balances.keys()), db))

    cash_pool_ids = {a.id for a in all_accounts if a.account_type in CASH_POOL_TYPES}
    compound_ids = {a.id for a in all_accounts if a.account_type in COMPOUND_TYPES}
    liability_ids = {a.id for a in all_accounts if a.account_type in LIABILITY_TYPES}

    starting_assets = sum(
        account_balances[a.id] for a in all_accounts
        if a.account_type in ASSET_TYPES and account_balances[a.id] > 0
    )
    starting_liabilities = sum(
        abs(account_balances[a.id]) for a in all_accounts
        if a.account_type in LIABILITY_TYPES or account_balances[a.id] < 0
    )
    starting_net_worth = starting_assets - starting_liabilities

    running_cash = sum(account_balances[a.id] for a in all_accounts if a.id in cash_pool_ids)
    running_compound: Dict[int, float] = {
        a.id: account_balances[a.id] for a in all_accounts if a.id in compound_ids
    }

    # ── Combined historical averages (merged by category name across all users) ──
    combined_monthly: Dict[str, float] = {}

    for u in users:
        user_hist = _get_historical_category_averages(u.id, db, today)
        cats_map = {c.id: c for c in db.query(CategoryModel).filter(CategoryModel.user_id == u.id).all()}
        savings_cats = {c.id for c in cats_map.values() if c.kind == "savings"}
        user_has_savings = any(
            a.account_type in ("hysa", "savings") for a in all_accounts if a.user_id == u.id
        )

        for cat_id, avgs in user_hist.items():
            hist_amount = avgs["avg3"] * 0.5 + avgs["avg6"] * 0.3 + avgs["avg12"] * 0.2
            # Skip savings-kind outflows from non-owners — captured in HYSA contrib above
            if cat_id in savings_cats and not user_has_savings and hist_amount < 0:
                continue
            cat = cats_map.get(cat_id)
            label = cat.name if cat else "Uncategorized"
            combined_monthly[label] = combined_monthly.get(label, 0.0) + hist_amount

    # ── Life events from all users ──
    all_events = (
        db.query(LifeEvent)
        .filter(LifeEvent.is_active == True, LifeEvent.scenario_id.is_(None))
        .all()
    )

    # ── Main forecast loop ──
    account_balance_history: Dict[int, List[float]] = {a.id: [] for a in all_accounts}
    points: List[ForecastPoint] = []
    total_income = 0.0
    total_expenses = 0.0
    variance_pct = 0.15

    for i in range(months):
        ms = (month_start + relativedelta(months=i)).replace(day=1)
        import calendar as _cal
        month_str = ms.strftime("%Y-%m")

        month_income = 0.0
        month_expenses = 0.0
        by_category: Dict[str, float] = {}

        for label, hist_amount in combined_monthly.items():
            if hist_amount < 0:
                month_expenses += hist_amount
            elif hist_amount > 0:
                month_income += hist_amount
            if hist_amount != 0:
                by_category[label] = by_category.get(label, 0.0) + hist_amount

        event_impact = _event_impact_for_month(all_events, month_str)
        net = month_income + month_expenses
        running_cash += net + event_impact

        for acc_id in list(running_compound.keys()):
            rate = account_monthly_rate.get(acc_id, 0.0)
            contrib = account_monthly_contrib.get(acc_id, 0.0)
            running_compound[acc_id] = running_compound[acc_id] * (1.0 + rate) + contrib

        for a in all_accounts:
            if a.id in cash_pool_ids:
                pool_total = sum(account_balances[aid] for aid in cash_pool_ids) or 1.0
                share = account_balances[a.id] / pool_total
                account_balance_history[a.id].append(round(running_cash * share, 2))
            elif a.id in compound_ids:
                account_balance_history[a.id].append(round(running_compound[a.id], 2))
            else:
                account_balance_history[a.id].append(round(account_balances[a.id], 2))

        compound_total = sum(running_compound.values())
        liability_total = sum(abs(account_balances[acc_id]) for acc_id in liability_ids)
        current_net_worth = running_cash + compound_total - liability_total

        current_savings_total = sum(
            running_compound[acc_id]
            for acc_id in compound_ids
            if any(a.id == acc_id and a.account_type in SAVINGS_TYPES for a in all_accounts)
        )

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

    account_forecasts: List[AccountForecast] = []
    for a in all_accounts:
        if a.account_type not in (ASSET_TYPES | LIABILITY_TYPES):
            continue
        history = account_balance_history[a.id]
        annual_return = account_monthly_rate.get(a.id, 0.0) * 12.0 * 100.0
        contrib = account_monthly_contrib.get(a.id, 0.0)
        account_forecasts.append(
            AccountForecast(
                account_id=a.id,
                account_name=a.name,
                account_type=a.account_type,
                starting_balance=account_balances[a.id],
                ending_balance=history[-1] if history else account_balances[a.id],
                monthly_balances=history,
                annual_return_pct=round(annual_return, 2),
                monthly_contribution=round(contrib, 2),
            )
        )

    return ForecastResponse(
        scenario_id=None,
        months=months,
        points=points,
        starting_net_worth=round(starting_net_worth, 2),
        ending_net_worth=round(ending_net_worth, 2),
        total_income=round(total_income, 2),
        total_expenses=round(total_expenses, 2),
        account_forecasts=account_forecasts,
    )
