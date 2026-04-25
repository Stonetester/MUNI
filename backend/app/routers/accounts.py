from datetime import date
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.account import Account
from app.models.user import User
from app.schemas.account import AccountCreate, AccountOut, AccountUpdate

router = APIRouter(prefix="/accounts", tags=["accounts"])


class AccountBalanceDetail(BaseModel):
    account_id: int
    estimated_balance: float
    actual_balance: Optional[float]
    last_snapshot_date: Optional[date]
    monthly_contribution: float
    next_pay_date: Optional[date] = None
    paychecks_since_anchor: int = 0


def get_account_or_404(account_id: int, user: User, db: Session) -> Account:
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


@router.get("", response_model=List[AccountOut])
def list_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Return own accounts + any joint account (is_joint=True) regardless of whether
    # joint_user_id was explicitly set.  In a household app all joint accounts
    # should be visible to every member of the household.
    return (
        db.query(Account)
        .filter(
            or_(
                Account.user_id == current_user.id,
                Account.joint_user_id == current_user.id,
                Account.is_joint == True,
            )
        )
        .order_by(Account.name)
        .all()
    )


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(
    account_in: AccountCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = Account(**account_in.model_dump(), user_id=current_user.id)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.get("/balances", response_model=List[AccountBalanceDetail])
def get_account_balances(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns estimated and actual balance for every active account belonging to the
    current user.  Estimated is forward-projected from the last snapshot; actual is
    the last snapshot balance (None if no snapshot has been recorded).
    """
    from app.services.forecasting import compute_estimated_balances

    accounts = (
        db.query(Account)
        .filter(Account.user_id == current_user.id, Account.is_active == True)
        .all()
    )
    balance_data = compute_estimated_balances(accounts, db, current_user.id)

    return [
        AccountBalanceDetail(
            account_id=acc_id,
            estimated_balance=data["estimated"],
            actual_balance=data["actual"],
            last_snapshot_date=data["last_snapshot_date"],
            monthly_contribution=data["monthly_contribution"],
            next_pay_date=data.get("next_pay_date"),
            paychecks_since_anchor=data.get("paychecks_since_anchor", 0),
        )
        for acc_id, data in balance_data.items()
    ]


@router.get("/{account_id}", response_model=AccountOut)
def get_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_account_or_404(account_id, current_user, db)


@router.put("/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int,
    account_in: AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = get_account_or_404(account_id, current_user, db)
    for field, value in account_in.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = get_account_or_404(account_id, current_user, db)
    db.delete(account)
    db.commit()
