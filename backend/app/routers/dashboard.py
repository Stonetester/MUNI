from datetime import date, datetime
from typing import Dict, List, Optional

from dateutil.relativedelta import relativedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.account import Account
from app.models.life_event import LifeEvent
from app.models.scenario import Scenario
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.dashboard import (
    AccountBalanceSummary,
    DashboardResponse,
    MonthSummary,
)
from app.schemas.forecast import ForecastPoint
from app.schemas.transaction import TransactionOut
from app.services.forecasting import run_forecast

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Account types that are assets vs liabilities
ASSET_TYPES = {
    "checking", "savings", "hysa", "brokerage", "ira", "401k", "hsa", "other", "paycheck"
}
LIABILITY_TYPES = {"credit_card", "student_loan", "car_loan", "mortgage"}


def _month_summary(transactions: List[Transaction], categories_map: dict) -> MonthSummary:
    income = 0.0
    spending = 0.0
    by_category: Dict[str, float] = {}

    for txn in transactions:
        if txn.amount > 0:
            income += txn.amount
        else:
            spending += abs(txn.amount)
            cat_name = categories_map.get(txn.category_id, "Uncategorized") if txn.category_id else "Uncategorized"
            by_category[cat_name] = by_category.get(cat_name, 0.0) + abs(txn.amount)

    savings = income - spending
    return MonthSummary(income=income, spending=spending, savings=savings, by_category=by_category)


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    this_month_start = today.replace(day=1)

    # Last month boundaries
    if today.month == 1:
        last_month_start = date(today.year - 1, 12, 1)
        last_month_end = date(today.year - 1, 12, 31)
    else:
        last_month_start = date(today.year, today.month - 1, 1)
        import calendar
        last_day = calendar.monthrange(today.year, today.month - 1)[1]
        last_month_end = date(today.year, today.month - 1, last_day)

    # Accounts
    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()

    total_assets = sum(a.balance for a in accounts if a.account_type in ASSET_TYPES and a.balance > 0)
    total_liabilities = sum(abs(a.balance) for a in accounts if a.account_type in LIABILITY_TYPES or a.balance < 0)
    net_worth = total_assets - total_liabilities

    # Group by type
    type_groups: Dict[str, list] = {}
    for acc in accounts:
        type_groups.setdefault(acc.account_type, []).append(
            {"id": acc.id, "name": acc.name, "balance": acc.balance, "institution": acc.institution}
        )
    balances_by_type = [
        AccountBalanceSummary(
            account_type=atype,
            total=sum(a["balance"] for a in accs),
            accounts=accs,
        )
        for atype, accs in type_groups.items()
    ]

    # Categories map
    from app.models.category import Category
    cats = db.query(Category).filter(Category.user_id == current_user.id).all()
    categories_map = {c.id: c.name for c in cats}

    # This month transactions
    this_month_txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.date >= this_month_start,
            Transaction.date <= today,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )

    # Last month transactions
    last_month_txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.date >= last_month_start,
            Transaction.date <= last_month_end,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )

    this_month = _month_summary(this_month_txns, categories_map)
    last_month = _month_summary(last_month_txns, categories_map)

    # Upcoming events (next 3 by start_date)
    upcoming_events = (
        db.query(LifeEvent)
        .filter(
            LifeEvent.user_id == current_user.id,
            LifeEvent.is_active == True,
            LifeEvent.start_date >= today,
        )
        .order_by(LifeEvent.start_date)
        .limit(3)
        .all()
    )

    # Forecast preview (6 bars: current month actual + 5 future forecast months)
    baseline = (
        db.query(Scenario)
        .filter(Scenario.user_id == current_user.id, Scenario.is_baseline == True)
        .first()
    )
    baseline_id = baseline.id if baseline else None
    forecast = run_forecast(user=current_user, db=db, scenario_id=baseline_id, months=7)

    # Replace month-0 (current month) with actual transaction data so paystub
    # income and real expenses appear in the Monthly Cash Flow chart.
    if forecast.points:
        p0 = forecast.points[0]
        actual_income_amt = sum(t.amount for t in this_month_txns if t.amount > 0)
        actual_expense_amt = sum(abs(t.amount) for t in this_month_txns if t.amount < 0)
        # Build by_category using names so the detail modal can display them
        actual_by_cat: Dict[str, float] = {}
        for txn in this_month_txns:
            if txn.amount == 0:
                continue
            cat_name = categories_map.get(txn.category_id, "Uncategorized") if txn.category_id else "Uncategorized"
            actual_by_cat[cat_name] = actual_by_cat.get(cat_name, 0.0) + txn.amount
        p0.income = round(actual_income_amt, 2)
        p0.expenses = round(actual_expense_amt, 2)
        p0.net = round(actual_income_amt - actual_expense_amt, 2)
        p0.by_category = actual_by_cat

    forecast_preview = forecast.points[:6]

    # Build flow_months: 6 past months (actual) + current actual + 5 future forecast
    past_flow: List[ForecastPoint] = []
    for i in range(6, 0, -1):
        pm_start = (this_month_start - relativedelta(months=i))
        import calendar as _cal
        last_day_pm = _cal.monthrange(pm_start.year, pm_start.month)[1]
        pm_end = pm_start.replace(day=last_day_pm)
        pm_key = pm_start.strftime("%Y-%m")

        pm_txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == current_user.id,
                Transaction.date >= pm_start,
                Transaction.date <= pm_end,
                Transaction.scenario_id.is_(None),
            )
            .all()
        )
        pm_income = sum(t.amount for t in pm_txns if t.amount > 0)
        pm_expenses = sum(abs(t.amount) for t in pm_txns if t.amount < 0)
        pm_by_cat: Dict[str, float] = {}
        for txn in pm_txns:
            if txn.amount == 0:
                continue
            cat_name = categories_map.get(txn.category_id, "Uncategorized") if txn.category_id else "Uncategorized"
            pm_by_cat[cat_name] = pm_by_cat.get(cat_name, 0.0) + txn.amount
        past_flow.append(ForecastPoint(
            month=pm_key,
            income=round(pm_income, 2),
            expenses=round(pm_expenses, 2),
            net=round(pm_income - pm_expenses, 2),
            cash=0.0, net_worth=0.0, savings_total=0.0,
            low_cash=0.0, high_cash=0.0, event_impact=0.0,
            by_category=pm_by_cat,
        ))

    # past 6 + current actual (forecast.points[0]) + 5 future = 12 bars
    flow_months = past_flow + forecast.points[:6]

    # Recent transactions (last 10)
    recent_transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(10)
        .all()
    )

    return DashboardResponse(
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        net_worth=net_worth,
        balances_by_type=balances_by_type,
        this_month=this_month,
        last_month=last_month,
        upcoming_events=upcoming_events,
        forecast_preview=forecast_preview,
        flow_months=flow_months,
        recent_transactions=recent_transactions,
    )
