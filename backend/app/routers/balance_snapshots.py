from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.account import Account
from app.models.balance_snapshot import BalanceSnapshot
from app.models.user import User
from app.schemas.balance_snapshot import BalanceSnapshotCreate, BalanceSnapshotOut

router = APIRouter(prefix="/balance-snapshots", tags=["balance-snapshots"])


@router.get("", response_model=List[BalanceSnapshotOut])
def list_balance_snapshots(
    account_id: Optional[int] = Query(default=None),
    from_date: Optional[date] = Query(default=None),
    to_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Only allow access to own accounts
    user_account_ids = [
        a.id for a in db.query(Account).filter(Account.user_id == current_user.id).all()
    ]
    query = db.query(BalanceSnapshot).filter(BalanceSnapshot.account_id.in_(user_account_ids))

    if account_id is not None:
        if account_id not in user_account_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        query = query.filter(BalanceSnapshot.account_id == account_id)
    if from_date is not None:
        query = query.filter(BalanceSnapshot.date >= from_date)
    if to_date is not None:
        query = query.filter(BalanceSnapshot.date <= to_date)

    return query.order_by(BalanceSnapshot.date.desc()).all()


@router.post("", response_model=BalanceSnapshotOut, status_code=status.HTTP_201_CREATED)
def create_balance_snapshot(
    snapshot_in: BalanceSnapshotCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify account belongs to user
    account = (
        db.query(Account)
        .filter(Account.id == snapshot_in.account_id, Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    # Dedup: if a snapshot already exists for this account + date, return it unchanged
    existing = (
        db.query(BalanceSnapshot)
        .filter(
            BalanceSnapshot.account_id == snapshot_in.account_id,
            BalanceSnapshot.date == snapshot_in.date,
        )
        .first()
    )
    if existing:
        return existing

    snapshot = BalanceSnapshot(**snapshot_in.model_dump())
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


@router.delete("/{snapshot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_balance_snapshot(
    snapshot_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_account_ids = [
        a.id for a in db.query(Account).filter(Account.user_id == current_user.id).all()
    ]
    snapshot = (
        db.query(BalanceSnapshot)
        .filter(
            BalanceSnapshot.id == snapshot_id,
            BalanceSnapshot.account_id.in_(user_account_ids),
        )
        .first()
    )
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    db.delete(snapshot)
    db.commit()
