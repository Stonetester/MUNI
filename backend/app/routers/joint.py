from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.auth import get_current_user
from app.database import get_db
from app.models.transaction import Transaction
from app.models.account import Account
from app.models.user import User
from app.schemas.transaction import TransactionOut, TransactionPage

router = APIRouter(prefix="/joint", tags=["joint"])


@router.get("/transactions", response_model=TransactionPage)
def joint_transactions(
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return transactions for all users (joint household view)."""
    query = db.query(Transaction).filter(Transaction.scenario_id.is_(None))
    total = query.count()
    items = query.order_by(Transaction.date.desc()).offset(offset).limit(limit).all()
    return TransactionPage(items=items, total=total, skip=offset, limit=limit)


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
    from datetime import date
    from app.models.account import Account as AccountModel

    all_accounts = db.query(AccountModel).filter(AccountModel.is_active == True).all()
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
