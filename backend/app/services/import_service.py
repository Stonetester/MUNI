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

Deduplication:
  Uses the same SHA-256 hash of (date|description|amount) as the Google Sheets
  sync service, so re-importing a CSV or syncing the same data from Sheets will
  never create duplicate transactions regardless of which source came first.
"""

from __future__ import annotations

import hashlib
import io
import logging
from datetime import date, datetime
from typing import Dict, List, Optional, Set

import pandas as pd

from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transaction import ImportResult
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _dedup_hash(txn_date: date, description: str, amount: float) -> str:
    """Must stay in sync with google_sheets_sync._dedup_hash."""
    key = f"{txn_date}|{description.strip().lower()}|{round(amount, 2)}"
    return hashlib.sha256(key.encode()).hexdigest()


def _load_existing_hashes(user_id: int, db: Session) -> Set[str]:
    """Load dedup hashes for all existing transactions for this user."""
    txns = db.query(Transaction.description, Transaction.date, Transaction.amount).filter(
        Transaction.user_id == user_id
    ).all()
    return {_dedup_hash(t.date, t.description, t.amount) for t in txns}

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


# Keyword → category name rules (case-insensitive substring match).
# Listed from most-specific to least-specific; first match wins.
AUTO_CATEGORY_RULES: List[tuple[str, str]] = [
    # Income
    ("payroll", "Paycheck"),
    ("direct dep", "Paycheck"),
    ("ach credit", "Paycheck"),
    # Housing
    ("rent", "Rent"),
    ("mortgage", "Mortgage"),
    ("hoa", "HOA"),
    # Groceries
    ("whole foods", "Groceries"),
    ("trader joe", "Groceries"),
    ("kroger", "Groceries"),
    ("safeway", "Groceries"),
    ("aldi", "Groceries"),
    ("publix", "Groceries"),
    ("wegmans", "Groceries"),
    ("sprouts", "Groceries"),
    ("market", "Groceries"),
    ("grocery", "Groceries"),
    # Dining
    ("doordash", "Dining"),
    ("uber eats", "Dining"),
    ("grubhub", "Dining"),
    ("instacart", "Dining"),
    ("chipotle", "Dining"),
    ("mcdonald", "Dining"),
    ("starbucks", "Dining"),
    ("chick-fil", "Dining"),
    ("panera", "Dining"),
    ("domino", "Dining"),
    ("pizza", "Dining"),
    ("restaurant", "Dining"),
    ("cafe", "Dining"),
    # Transportation
    ("uber", "Transportation"),
    ("lyft", "Transportation"),
    ("gas station", "Transportation"),
    ("shell", "Transportation"),
    ("bp ", "Transportation"),
    ("chevron", "Transportation"),
    ("exxon", "Transportation"),
    ("sunoco", "Transportation"),
    ("speedway", "Transportation"),
    ("wawa", "Transportation"),
    ("parking", "Transportation"),
    ("toll", "Transportation"),
    ("metro", "Transportation"),
    ("mta ", "Transportation"),
    # Shopping
    ("amazon", "Shopping"),
    ("walmart", "Shopping"),
    ("target", "Shopping"),
    ("costco", "Shopping"),
    ("best buy", "Shopping"),
    ("apple.com", "Shopping"),
    ("ebay", "Shopping"),
    ("etsy", "Shopping"),
    # Subscriptions / Entertainment
    ("netflix", "Subscriptions"),
    ("spotify", "Subscriptions"),
    ("hulu", "Subscriptions"),
    ("disney+", "Subscriptions"),
    ("apple one", "Subscriptions"),
    ("amazon prime", "Subscriptions"),
    ("youtube premium", "Subscriptions"),
    ("hbo", "Subscriptions"),
    ("peacock", "Subscriptions"),
    ("paramount", "Subscriptions"),
    # Health / Medical
    ("cvs", "Health"),
    ("walgreens", "Health"),
    ("pharmacy", "Health"),
    ("doctor", "Health"),
    ("dental", "Health"),
    ("vision", "Health"),
    ("hospital", "Health"),
    ("medical", "Health"),
    ("health ins", "Health"),
    # Utilities
    ("electric", "Utilities"),
    ("water bill", "Utilities"),
    ("gas bill", "Utilities"),
    ("internet", "Utilities"),
    ("comcast", "Utilities"),
    ("verizon", "Utilities"),
    ("at&t", "Utilities"),
    ("t-mobile", "Utilities"),
    ("phone", "Utilities"),
    # Insurance
    ("insurance", "Insurance"),
    ("geico", "Insurance"),
    ("state farm", "Insurance"),
    ("allstate", "Insurance"),
    # Student loans / Education
    ("student loan", "Student Loans"),
    ("sallie mae", "Student Loans"),
    ("mohela", "Student Loans"),
    ("navient", "Student Loans"),
    ("nelnet", "Student Loans"),
    ("tuition", "Education"),
    # Investments / Savings
    ("fidelity", "Investments"),
    ("vanguard", "Investments"),
    ("charles schwab", "Investments"),
    ("robinhood", "Investments"),
    ("coinbase", "Investments"),
    ("betterment", "Investments"),
    ("401k", "Investments"),
    ("ira contrib", "Investments"),
    # Travel
    ("airbnb", "Travel"),
    ("hotel", "Travel"),
    ("marriott", "Travel"),
    ("hilton", "Travel"),
    ("expedia", "Travel"),
    ("delta", "Travel"),
    ("united air", "Travel"),
    ("southwest", "Travel"),
    ("american air", "Travel"),
    ("airline", "Travel"),
    # Personal Care
    ("haircut", "Personal Care"),
    ("salon", "Personal Care"),
    ("spa", "Personal Care"),
    ("barber", "Personal Care"),
    # Transfers
    ("zelle", "Transfer"),
    ("venmo", "Transfer"),
    ("paypal", "Transfer"),
    ("cash app", "Transfer"),
    ("transfer", "Transfer"),
    ("wire", "Transfer"),
]


def _auto_categorize(description: str) -> Optional[str]:
    """Return a category name for description based on keyword rules, or None."""
    desc_lower = description.strip().lower()
    for keyword, category_name in AUTO_CATEGORY_RULES:
        if keyword in desc_lower:
            return category_name
    return None


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

    # Load all existing hashes upfront — one query instead of one per row.
    # Uses the same hash as the Sheets sync, so CSV ↔ Sheets dedup works both ways.
    existing_hashes: Set[str] = _load_existing_hashes(user.id, db)

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

            # Category — use CSV column first, fall back to keyword auto-detection
            category_name = row.get("category", "")
            category: Optional[Category] = None
            if category_name and not (isinstance(category_name, float) and pd.isna(category_name)):
                category = _get_or_create_category(
                    str(category_name).strip(), user, db, category_cache
                )
            elif description:
                auto_name = _auto_categorize(description)
                if auto_name:
                    category = _get_or_create_category(auto_name, user, db, category_cache)

            # Duplicate check — same hash as Sheets sync; catches cross-source dupes
            h = _dedup_hash(txn_date, description, amount)
            if h in existing_hashes:
                duplicates += 1
                continue
            existing_hashes.add(h)

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
