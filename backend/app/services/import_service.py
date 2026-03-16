"""
Import service for CSV and XLSX transaction files.

Supported formats:
1. Keaton's spending format:
   "Column 1" (description), "Transaction Date" (date),
   "Type" (category), "Price" (amount), "Status" (payment_method)

2. Generic bank CSV:
   Date, Description, Amount, Type

3. Credit card export:
   Transaction Date, Description, Amount, Category
"""

from __future__ import annotations

import io
import logging
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

import pandas as pd

from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transaction import ImportResult
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Column aliases → canonical column name
COLUMN_ALIASES: Dict[str, str] = {
    # date
    "transaction date": "date",
    "date": "date",
    "posted date": "date",
    "posting date": "date",
    # description
    "column 1": "description",
    "description": "description",
    "merchant": "description",
    "memo": "description",
    "payee": "description",
    "name": "description",
    # amount
    "price": "amount",
    "amount": "amount",
    "transaction amount": "amount",
    "debit": "amount",
    "credit": "amount",
    # category
    "type": "category",
    "category": "category",
    "transaction type": "category",
    # payment method
    "status": "payment_method",
    "payment method": "payment_method",
    "payment type": "payment_method",
}


def _normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename dataframe columns using the alias map."""
    rename_map = {}
    for col in df.columns:
        canonical = COLUMN_ALIASES.get(col.strip().lower())
        if canonical and canonical not in rename_map.values():
            rename_map[col] = canonical
    return df.rename(columns=rename_map)


def _parse_date(value) -> Optional[date]:
    if pd.isna(value):
        return None
    if isinstance(value, (date, datetime)):
        return value.date() if isinstance(value, datetime) else value
    s = str(value).strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y", "%d/%m/%Y", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(value) -> Optional[float]:
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace(",", "").replace("$", "").replace("(", "-").replace(")", "")
    try:
        return float(s)
    except ValueError:
        return None


def _is_summary_row(amount: Optional[float], all_amounts: List[float]) -> bool:
    """Detect totals/summary rows: amount is >= 3x the median absolute value."""
    if amount is None or not all_amounts:
        return False
    abs_amount = abs(amount)
    median = sorted([abs(a) for a in all_amounts])[len(all_amounts) // 2] or 1
    return abs_amount > median * 10


def _get_or_create_category(
    name: str,
    user: User,
    db: Session,
    cache: Dict[str, Category],
) -> Optional[Category]:
    if not name or pd.isna(name):
        return None
    name = str(name).strip()
    if not name:
        return None
    key = name.lower()
    if key in cache:
        return cache[key]

    cat = (
        db.query(Category)
        .filter(Category.user_id == user.id, Category.name == name)
        .first()
    )
    if not cat:
        cat = Category(user_id=user.id, name=name, kind="expense", color="#6EE7B7")
        db.add(cat)
        db.flush()

    cache[key] = cat
    return cat


def _check_duplicate(
    user_id: int,
    txn_date: date,
    amount: float,
    description: str,
    db: Session,
) -> bool:
    existing = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date == txn_date,
            Transaction.amount == amount,
            Transaction.description == description,
        )
        .first()
    )
    return existing is not None


def import_transactions(
    content: bytes,
    filename: str,
    user: User,
    db: Session,
    account_id: Optional[int] = None,
) -> ImportResult:
    errors: List[str] = []
    imported = 0
    duplicates = 0

    try:
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(content), dtype=str)
        else:
            # Try multiple encodings
            for encoding in ("utf-8-sig", "utf-8", "latin-1"):
                try:
                    df = pd.read_csv(io.BytesIO(content), dtype=str, encoding=encoding)
                    break
                except Exception:
                    continue
            else:
                return ImportResult(imported=0, duplicates=0, errors=["Could not decode file"])
    except Exception as exc:
        return ImportResult(imported=0, duplicates=0, errors=[f"Could not parse file: {exc}"])

    df = _normalise_columns(df)

    # Require at least date and amount
    if "date" not in df.columns:
        return ImportResult(imported=0, duplicates=0, errors=["No date column found"])
    if "amount" not in df.columns:
        return ImportResult(imported=0, duplicates=0, errors=["No amount column found"])

    # Parse amounts first to detect summary rows
    raw_amounts = [_parse_amount(v) for v in df["amount"]]
    valid_amounts = [a for a in raw_amounts if a is not None]

    category_cache: Dict[str, Category] = {}

    for idx, (_, row) in enumerate(df.iterrows()):
        row_num = idx + 2  # 1-indexed + header
        try:
            txn_date = _parse_date(row.get("date"))
            if txn_date is None:
                errors.append(f"Row {row_num}: invalid date '{row.get('date')}'")
                continue

            amount = _parse_amount(row.get("amount"))
            if amount is None:
                errors.append(f"Row {row_num}: invalid amount '{row.get('amount')}'")
                continue

            if _is_summary_row(amount, valid_amounts):
                logger.debug("Skipping summary row %d with amount %s", row_num, amount)
                continue

            description = str(row.get("description", "")).strip() if not pd.isna(row.get("description", "")) else ""
            merchant = description  # use description as merchant for now

            payment_method_raw = row.get("payment_method", "")
            payment_method: Optional[str] = None
            if payment_method_raw and not pd.isna(payment_method_raw):
                pm = str(payment_method_raw).strip().lower()
                if "debit" in pm:
                    payment_method = "debit_card"
                elif "credit" in pm:
                    payment_method = "credit_card"
                elif "transfer" in pm:
                    payment_method = "transfer"
                else:
                    payment_method = "other"

            # Category
            category_name = row.get("category", "")
            category: Optional[Category] = None
            if category_name and not (isinstance(category_name, float) and pd.isna(category_name)):
                category = _get_or_create_category(
                    str(category_name).strip(), user, db, category_cache
                )

            # Duplicate check
            if _check_duplicate(user.id, txn_date, amount, description, db):
                duplicates += 1
                continue

            txn = Transaction(
                user_id=user.id,
                account_id=account_id,
                category_id=category.id if category else None,
                date=txn_date,
                amount=amount,
                description=description,
                merchant=merchant,
                payment_method=payment_method,
                import_source=filename,
                is_verified=False,
            )
            db.add(txn)
            imported += 1

        except Exception as exc:
            errors.append(f"Row {row_num}: unexpected error - {exc}")
            continue

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        errors.append(f"Database commit failed: {exc}")
        imported = 0

    return ImportResult(imported=imported, duplicates=duplicates, errors=errors)
