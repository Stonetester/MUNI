from typing import Optional
from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.auth import get_current_user
from app.database import get_db
from app.models.transaction import Transaction
from app.models.account import Account
from app.models.user import User
from app.models.category import Category
from app.models.life_event import LifeEvent
from app.schemas.transaction import TransactionOut, TransactionPage
from app.schemas.alert import AlertItem

router = APIRouter(prefix="/joint", tags=["joint"])


@router.get("/transactions")
def joint_transactions(
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return transactions for all users (joint household view), with owner username."""
    query = db.query(Transaction).filter(Transaction.scenario_id.is_(None))
    total = query.count()
    items = query.order_by(Transaction.date.desc()).offset(offset).limit(limit).all()

    user_map = {u.id: u.username for u in db.query(User).all()}

    result = []
    for item in items:
        t = TransactionOut.model_validate(item)
        t_dict = t.model_dump()
        t_dict["owner"] = user_map.get(item.user_id)
        result.append(t_dict)

    return {"items": result, "total": total, "skip": offset, "limit": limit}


@router.get("/accounts")
def joint_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return accounts for all users."""
    users = db.query(User).all()
    result = []
    for u in users:
        accs = db.query(Account).filter(Account.user_id == u.id, Account.is_active == True).all()
        for a in accs:
            result.append({
                "id": a.id, "name": a.name, "account_type": a.account_type,
                "balance": a.balance, "institution": a.institution,
                "owner": u.username, "is_active": a.is_active,
            })
    return result


@router.get("/summary")
def joint_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Net worth and monthly flow across all users."""
    all_accounts = db.query(Account).filter(Account.is_active == True).all()
    assets = sum(a.balance for a in all_accounts if a.account_type not in ('student_loan', 'car_loan', 'mortgage', 'credit_card'))
    liabilities = sum(abs(a.balance) for a in all_accounts if a.account_type in ('student_loan', 'car_loan', 'mortgage', 'credit_card'))

    today = date.today()
    month_start = today.replace(day=1)
    month_txns = db.query(Transaction).filter(
        Transaction.date >= month_start,
        Transaction.scenario_id.is_(None)
    ).all()

    income = sum(t.amount for t in month_txns if t.amount > 0)
    spending = sum(abs(t.amount) for t in month_txns if t.amount < 0)

    return {
        "net_worth": assets - liabilities,
        "total_assets": assets,
        "total_liabilities": liabilities,
        "this_month_income": income,
        "this_month_spending": spending,
    }


@router.get("/events")
def joint_events(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Life events for all household users."""
    users = db.query(User).all()
    user_map = {u.id: u.username for u in users}
    events = (
        db.query(LifeEvent)
        .filter(LifeEvent.scenario_id.is_(None))
        .order_by(LifeEvent.is_active.desc(), LifeEvent.start_date)
        .all()
    )
    result = []
    for e in events:
        result.append({
            "id": e.id,
            "name": e.name,
            "event_type": e.event_type,
            "start_date": str(e.start_date),
            "end_date": str(e.end_date) if e.end_date else None,
            "total_cost": e.total_cost,
            "monthly_breakdown": e.monthly_breakdown,
            "is_active": e.is_active,
            "notes": e.notes,
            "owner": user_map.get(e.user_id, "Unknown"),
        })
    return result


@router.get("/alerts")
def joint_alerts(
    month: Optional[str] = Query(None),
    lookahead_days: int = Query(30, ge=1, le=120),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Budget and event alerts for all household users."""
    from app.routers.alerts import get_alerts as _get_alerts
    users = db.query(User).all()
    combined: list[AlertItem] = []
    for u in users:
        alerts = _get_alerts(month=month, lookahead_days=lookahead_days, db=db, current_user=u)
        combined.extend(alerts)
    severity_rank = {"critical": 0, "warning": 1, "info": 2}
    combined.sort(key=lambda a: (severity_rank.get(a.severity, 3), str(a.due_date or "")))
    return combined


@router.get("/budget/summary")
def joint_budget_summary(
    month: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Combined budget vs actual for all users, merged by category name."""
    today = date.today()
    if month:
        year, mon = int(month[:4]), int(month[5:7])
    else:
        year, mon = today.year, today.month

    start = date(year, mon, 1)
    _, last_day = monthrange(year, mon)
    end = date(year, mon, last_day)

    users = db.query(User).all()
    # name -> {category_id, category_name, kind, color, budget_amount, actual_amount}
    cat_data: dict = {}

    for u in users:
        cats = (
            db.query(Category)
            .filter(Category.user_id == u.id, Category.kind.in_(["expense", "savings"]))
            .all()
        )
        spending = (
            db.query(Transaction.category_id, func.sum(Transaction.amount).label("total"))
            .filter(
                Transaction.user_id == u.id,
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.scenario_id.is_(None),
            )
            .group_by(Transaction.category_id)
            .all()
        )
        spend_map = {row.category_id: abs(row.total) for row in spending if row.total}

        for cat in cats:
            actual = spend_map.get(cat.id, 0.0)
            budget = cat.budget_amount or 0.0
            if cat.name in cat_data:
                cat_data[cat.name]["actual_amount"] += actual
                cat_data[cat.name]["budget_amount"] += budget
            else:
                cat_data[cat.name] = {
                    "category_id": cat.id,
                    "category_name": cat.name,
                    "kind": cat.kind,
                    "color": cat.color or "#10B981",
                    "budget_amount": budget,
                    "actual_amount": actual,
                }

    result = []
    for d in cat_data.values():
        actual = d["actual_amount"]
        budget = d["budget_amount"]
        remaining = budget - actual if budget > 0 else 0.0
        pct = (actual / budget * 100) if budget > 0 else 0.0
        result.append({**d, "remaining": remaining, "percentage": round(pct, 1)})

    result.sort(key=lambda x: (-(x["percentage"] if x["budget_amount"] > 0 else 0), -x["actual_amount"]))
    return result


@router.get("/forecast")
def joint_forecast(
    months: int = Query(default=60, ge=1, le=360),
    past_months: int = Query(default=0, ge=0, le=60),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Combined household forecast."""
    from app.services.forecasting import run_joint_forecast
    from app.schemas.forecast import ForecastPoint
    from dateutil.relativedelta import relativedelta

    result = run_joint_forecast(db=db, months=months)

    if past_months > 0:
        today = date.today()
        historical_points: list[ForecastPoint] = []
        users = db.query(User).all()

        for i in range(past_months, 0, -1):
            ms = (today.replace(day=1) - relativedelta(months=i))
            me = (ms + relativedelta(months=1)) - relativedelta(days=1)
            month_key = ms.strftime("%Y-%m")

            income = 0.0
            expenses = 0.0
            for u in users:
                txns = db.query(Transaction).filter(
                    Transaction.user_id == u.id,
                    Transaction.date >= ms,
                    Transaction.date <= me,
                    Transaction.scenario_id.is_(None),
                ).all()
                income += sum(
                    t.amount for t in txns
                    if t.amount > 0
                    and not (t.import_source and t.import_source.startswith("paystub:")
                             and t.description and "Employer 401k" in t.description)
                )
                expenses += sum(abs(t.amount) for t in txns if t.amount < 0)

            historical_points.append(ForecastPoint(
                month=month_key, income=income, expenses=expenses,
                net=income - expenses, cash=0.0, net_worth=0.0,
                savings_total=0.0, low_cash=0.0, high_cash=0.0, event_impact=0.0,
            ))

        result.points = historical_points + result.points

    return result
