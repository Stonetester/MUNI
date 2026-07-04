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


def _is_sheets_sourced(txn: Transaction) -> bool:
    # NULL import_source = legacy pre-tagging sheets rows (paystub/CSV rows tag themselves).
    return txn.import_source is None or txn.import_source.startswith("sheets:")


def _reject_if_paystub_managed(txn: Transaction) -> None:
    """Paystub-created income rows are owned by their paystub — the paystub's
    update/delete recreates/removes them, which would silently undo any direct
    edit here. Point the user at the paystub instead of desyncing."""
    if txn.import_source and txn.import_source.startswith("paystub:"):
        paystub_id = txn.import_source.split(":", 1)[1]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This transaction is managed by paystub #{paystub_id}. "
                "Edit or delete that paystub on the Paystubs page instead — "
                "direct changes here would be overwritten the next time the paystub is touched."
            ),
        )


def _tombstone(txn: Transaction, db: Session, reason: str) -> None:
    """Remember a deleted/renamed imported row so the 30-min Sheets sync can't
    re-import it from the sheet (which would silently undo the user's action)."""
    from app.models.import_tombstone import ImportTombstone
    from app.services.google_sheets_sync import _dedup_desc_key, _dedup_hash

    db.add(ImportTombstone(
        user_id=txn.user_id,
        dedup_hash=_dedup_hash(txn.date, txn.description, txn.amount),
        desc_key=_dedup_desc_key(txn.date, txn.description),
        date=txn.date,
        description=txn.description,
        amount=txn.amount,
        reason=reason,
    ))


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
    _reject_if_paystub_managed(txn)

    changes = txn_in.model_dump(exclude_unset=True)
    sheets_row = _is_sheets_sourced(txn)
    # If the row's identity (date/description/amount) changes, the original sheet
    # row would no longer match anything in the DB and the sync would re-import it
    # as a duplicate — tombstone the ORIGINAL identity before applying the edit.
    identity_changed = sheets_row and any(
        field in changes and changes[field] != getattr(txn, field)
        for field in ("date", "description", "amount")
    )
    anything_changed = any(changes.get(f) != getattr(txn, f) for f in changes)
    if identity_changed:
        _tombstone(txn, db, reason="edited")

    for field, value in changes.items():
        setattr(txn, field, value)
    # App edits take ownership: the Sheets sync will no longer clobber this row's
    # amount or category back to the sheet values.
    if sheets_row and anything_changed:
        txn.user_modified = True
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

    Bulk clear = "start over and resync": it also wipes the user's import
    tombstones so the next sync re-imports the whole sheet cleanly.
    """
    from app.models.import_tombstone import ImportTombstone

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
    db.query(ImportTombstone).filter(ImportTombstone.user_id == current_user.id).delete(
        synchronize_session=False
    )
    db.commit()
    return {"deleted": result}


@router.delete("/bulk/all", status_code=status.HTTP_200_OK)
def delete_all_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete ALL transactions for the current user (sheets + manual + CSV).
    Also wipes import tombstones — a full clear means a clean slate."""
    from app.models.import_tombstone import ImportTombstone

    result = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
        .delete(synchronize_session=False)
    )
    db.query(ImportTombstone).filter(ImportTombstone.user_id == current_user.id).delete(
        synchronize_session=False
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
    _reject_if_paystub_managed(txn)
    if _is_sheets_sourced(txn):
        _tombstone(txn, db, reason="deleted")
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
