import io
import csv
from datetime import date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transaction import (
    TransactionCreate,
    TransactionOut,
    TransactionUpdate,
    TransactionPage,
    ImportResult,
)
from app.services.import_service import import_transactions

router = APIRouter(prefix="/transactions", tags=["transactions"])


def get_transaction_or_404(txn_id: int, user: User, db: Session) -> Transaction:
    txn = (
        db.query(Transaction)
        .filter(Transaction.id == txn_id, Transaction.user_id == user.id)
        .first()
    )
    if not txn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    return txn


@router.get("", response_model=TransactionPage)
def list_transactions(
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    search: Optional[str] = None,
    scenario_id: Optional[int] = Query(default=None),
    limit: int = Query(default=50, le=2000),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction).filter(Transaction.user_id == current_user.id)

    if account_id is not None:
        query = query.filter(Transaction.account_id == account_id)
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if from_date is not None:
        query = query.filter(Transaction.date >= from_date)
    if to_date is not None:
        query = query.filter(Transaction.date <= to_date)
    if scenario_id is not None:
        query = query.filter(Transaction.scenario_id == scenario_id)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                Transaction.description.ilike(like),
                Transaction.merchant.ilike(like),
                Transaction.notes.ilike(like),
            )
        )

    total = query.count()
    items = query.order_by(Transaction.date.desc()).offset(offset).limit(limit).all()
    return TransactionPage(items=items, total=total, skip=offset, limit=limit)


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    txn_in: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    txn = Transaction(**txn_in.model_dump(), user_id=current_user.id)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@router.put("/{txn_id}", response_model=TransactionOut)
def update_transaction(
    txn_id: int,
    txn_in: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    txn = get_transaction_or_404(txn_id, current_user, db)
    for field, value in txn_in.model_dump(exclude_unset=True).items():
        setattr(txn, field, value)
    db.commit()
    db.refresh(txn)
    return txn


@router.delete("/bulk/sheets", status_code=status.HTTP_200_OK)
def delete_all_sheets_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete all transactions imported from Google Sheets for the current user.
    Matches rows tagged 'sheets:*' plus NULL import_source rows (legacy rows
    synced before tagging was introduced — paystubs tag themselves so NULL
    rows are safely assumed to be sheets imports).
    """
    result = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            or_(
                Transaction.import_source.like("sheets:%"),
                Transaction.import_source.is_(None),
            ),
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": result}


@router.delete("/bulk/all", status_code=status.HTTP_200_OK)
def delete_all_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete ALL transactions for the current user (sheets + manual + CSV)."""
    result = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": result}


@router.delete("/{txn_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    txn_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    txn = get_transaction_or_404(txn_id, current_user, db)
    db.delete(txn)
    db.commit()


@router.post("/import", response_model=ImportResult)
async def import_transactions_route(
    file: UploadFile = File(...),
    account_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if file.filename is None:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()
    filename = file.filename.lower()

    result = import_transactions(
        content=content,
        filename=filename,
        user=current_user,
        db=db,
        account_id=account_id,
    )
    return result


@router.get("/export")
def export_transactions(
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    scenario_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction).filter(Transaction.user_id == current_user.id)

    if account_id is not None:
        query = query.filter(Transaction.account_id == account_id)
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if from_date is not None:
        query = query.filter(Transaction.date >= from_date)
    if to_date is not None:
        query = query.filter(Transaction.date <= to_date)
    if scenario_id is not None:
        query = query.filter(Transaction.scenario_id == scenario_id)

    transactions = query.order_by(Transaction.date.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "date", "amount", "description", "merchant",
        "payment_method", "account_id", "category_id", "scenario_id",
        "is_verified", "notes", "import_source", "created_at"
    ])
    for txn in transactions:
        writer.writerow([
            txn.id, txn.date, txn.amount, txn.description, txn.merchant,
            txn.payment_method, txn.account_id, txn.category_id, txn.scenario_id,
            txn.is_verified, txn.notes, txn.import_source, txn.created_at
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )
