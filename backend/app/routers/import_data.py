"""
Import router — standard CSV/XLSX import + wide-format (monthly summary) import.
"""
import hashlib
import logging
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transaction import ImportResult
from app.services.import_service import import_transactions
from app.services.wide_import_service import parse_wide_format

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/import", tags=["import"])


# ── Standard import ───────────────────────────────────────────────────────────

@router.post("", response_model=ImportResult)
async def import_file(
    file: UploadFile = File(...),
    account_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    filename = (file.filename or "upload.csv").lower()
    return import_transactions(
        content=content,
        filename=filename,
        user=current_user,
        db=db,
        account_id=account_id,
    )


# ── Wide-format (monthly summary) ─────────────────────────────────────────────

class WidePreviewRowOut(BaseModel):
    description: str
    date: str
    month_label: str
    amount: float
    inferred_kind: str   # "income" | "expense" | "unknown"


class WidePreviewResult(BaseModel):
    rows: List[WidePreviewRowOut]
    errors: List[str]


class WideCommitRow(BaseModel):
    description: str
    date: str            # ISO date
    amount: float        # already signed by frontend (income +, expense -)
    kind: str            # final kind after user confirmation


class WideCommitIn(BaseModel):
    transactions: List[WideCommitRow]
    account_id: Optional[int] = None


@router.post("/wide-preview", response_model=WidePreviewResult)
async def preview_wide_import(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Parse a wide-format CSV and return transaction previews (no DB writes)."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported for wide import")
    content = await file.read()
    rows, errors = parse_wide_format(content)
    return WidePreviewResult(
        rows=[WidePreviewRowOut(**r.__dict__) for r in rows],
        errors=errors,
    )


def _dedup_hash(txn_date: date, description: str, amount: float) -> str:
    key = f"{txn_date}|{description.strip().lower()}|{round(amount, 2)}"
    return hashlib.sha256(key.encode()).hexdigest()


@router.post("/wide-commit", response_model=ImportResult)
def commit_wide_import(
    data: WideCommitIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Commit wide-format preview rows as transactions."""
    errors: List[str] = []
    imported = 0
    duplicates = 0

    # Load existing hashes for dedup
    existing = db.query(Transaction.description, Transaction.date, Transaction.amount).filter(
        Transaction.user_id == current_user.id
    ).all()
    seen = {_dedup_hash(t.date, t.description, t.amount) for t in existing}

    # Category cache: find or create by (name, kind)
    cat_cache: dict[str, Category] = {}

    def get_category(name: str, kind: str) -> Optional[Category]:
        key = f"{name.lower()}:{kind}"
        if key in cat_cache:
            return cat_cache[key]
        cat = db.query(Category).filter(
            Category.user_id == current_user.id,
            Category.name == name,
        ).first()
        if not cat:
            cat = Category(
                user_id=current_user.id,
                name=name,
                kind=kind,
                color="#6EE7B7",
            )
            db.add(cat)
            db.flush()
        cat_cache[key] = cat
        return cat

    for row in data.transactions:
        try:
            txn_date = datetime.strptime(row.date, "%Y-%m-%d").date()
        except ValueError:
            errors.append(f"Invalid date '{row.date}' for '{row.description}'")
            continue

        # Determine category
        if row.kind == "income":
            cat = get_category("Side Income", "income")
        elif row.kind == "expense":
            cat = get_category(row.description, "expense")
        else:
            cat = get_category(row.description, "expense")

        h = _dedup_hash(txn_date, row.description, row.amount)
        if h in seen:
            duplicates += 1
            continue
        seen.add(h)

        txn = Transaction(
            user_id=current_user.id,
            account_id=data.account_id,
            category_id=cat.id if cat else None,
            date=txn_date,
            amount=row.amount,
            description=row.description,
            merchant=row.description,
            import_source="wide-csv",
            is_verified=False,
        )
        db.add(txn)
        imported += 1

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        return ImportResult(imported=0, duplicates=duplicates, errors=[f"Database error: {exc}"])

    return ImportResult(imported=imported, duplicates=duplicates, errors=errors)
