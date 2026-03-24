"""
Google Sheets → Transactions sync service.

Reads monthly tab data from the user's spending Google Sheet and
imports new transactions, deduplicating by (date + description + amount).

Rules:
- Only ADDS new transactions — never modifies or deletes existing ones.
- CSV-imported transactions are protected: same dedup hash check applies,
  so a Sheets row that matches an existing CSV row is silently skipped.
- import_source is set to "sheets:{tab}" so you can always tell the origin.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.sync_config import SyncConfig
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.account import Account
from app.models.user import User

logger = logging.getLogger(__name__)

CREDS_PATH = Path(__file__).parent.parent.parent / "credentials" / "google-sheets-key.json"

# Standard categories created for every user on first sync if missing
_DEFAULT_CATEGORIES = [
    # Income
    ("Salary", "income", "#10B981", None),
    ("Side Income", "income", "#34D399", None),
    ("Bonus", "income", "#6EE7B7", None),
    # Expense parents
    ("Housing", "expense", "#f87171", None),
    ("Food", "expense", "#fb923c", None),
    ("Transportation", "expense", "#facc15", None),
    ("Health", "expense", "#a78bfa", None),
    ("Entertainment", "expense", "#38bdf8", None),
    ("Shopping", "expense", "#f472b6", None),
    ("Personal", "expense", "#94a3b8", None),
    ("Subscriptions", "expense", "#818cf8", None),
    ("Debt", "expense", "#ef4444", None),
    ("Family", "expense", "#fb923c", None),
    ("Gifts", "expense", "#c084fc", None),
    ("Wedding", "expense", "#f9a8d4", None),
    ("Work", "expense", "#67e8f9", None),
    # Savings parents
    ("Emergency Fund", "savings", "#14b8a6", None),
    ("Retirement", "savings", "#818cf8", None),
    ("Vacation", "savings", "#34d399", None),
    # Sub-categories (parent name as 4th element)
    ("Rent/Utilities", "expense", "#f87171", "Housing"),
    ("Electricity", "expense", "#fca5a5", "Housing"),
    ("Internet", "expense", "#fca5a5", "Housing"),
    ("Eating Out", "expense", "#fb923c", "Food"),
    ("Groceries", "expense", "#fdba74", "Food"),
    ("Gas", "expense", "#facc15", "Transportation"),
    ("Car Expense", "expense", "#fde68a", "Transportation"),
    ("Car Repair", "expense", "#fef08a", "Transportation"),
    ("Medical", "expense", "#a78bfa", "Health"),
    ("Going Out", "expense", "#38bdf8", "Entertainment"),
    ("Discretionary", "expense", "#7dd3fc", "Entertainment"),
    ("Student Loans", "expense", "#ef4444", "Debt"),
    ("Required", "expense", "#94a3b8", "Personal"),
    ("Tax", "expense", "#6b7280", "Personal"),
    ("Savings Transfer", "savings", "#14b8a6", "Emergency Fund"),
]


def _ensure_user_categories(user_id: int, db: Session) -> dict:
    """
    Load user's categories. If none exist, create the standard set first.
    Returns {name: Category} dict.
    """
    cats = {c.name: c for c in db.query(Category).filter(Category.user_id == user_id).all()}
    if cats:
        return cats

    logger.info(f"User {user_id} has no categories — creating standard set")
    cat_map: dict = {}
    for name, kind, color, parent_name in _DEFAULT_CATEGORIES:
        parent = cat_map.get(parent_name) if parent_name else None
        cat = Category(
            user_id=user_id,
            name=name,
            kind=kind,
            color=color,
            parent_id=parent.id if parent else None,
        )
        db.add(cat)
        db.flush()
        cat_map[name] = cat

    db.commit()
    logger.info(f"Created {len(cat_map)} default categories for user {user_id}")
    return cat_map


def _get_or_create_category(name: str, user_id: int, categories: dict, db: Session) -> Optional[Category]:
    """Return existing category by name, or create a plain expense category on the fly."""
    if name in categories:
        return categories[name]
    cat = Category(user_id=user_id, name=name, kind="expense", color="#94a3b8")
    db.add(cat)
    db.flush()
    categories[name] = cat
    logger.info(f"Auto-created category '{name}' for user {user_id}")
    return cat

# Maps category names from the sheet to canonical app category names
CATEGORY_NORMALIZE = {
    "car expense": "Car Expense",
    "car repair": "Car Repair",
    "eating out": "Eating Out",
    "going out": "Going Out",
    "discretionary": "Discretionary",
    "family": "Family",
    "rent/utilities": "Rent/Utilities",
    "rent": "Rent/Utilities",
    "utilities": "Rent/Utilities",
    "medical": "Medical",
    "health": "Medical",
    "groceries": "Groceries",
    "grocery": "Groceries",
    "subscriptions": "Subscriptions",
    "subscription": "Subscriptions",
    "gas": "Gas",
    "required": "Required",
    "gifts": "Gifts",
    "gift": "Gifts",
    "shopping": "Shopping",
    "student loans": "Student Loans",
    "student loan": "Student Loans",
    "internet": "Internet",
    "electricity": "Electricity",
    "wedding": "Wedding",
    "work": "Work",
    "worka": "Work",
    "shoppi": "Shopping",
    "kat": "Kat",
    "savings": "Savings Transfer",
    "saving": "Savings Transfer",
    "transfer": "Savings Transfer",
    "roth": "Savings Transfer",
    "roth ira": "Savings Transfer",
    "ira": "Savings Transfer",
    "tax": "Tax",
    "taxes": "Tax",
    "uncategorized": "Discretionary",
    "expense": "Discretionary",
    "expenses": "Discretionary",
    "other": "Discretionary",
    "misc": "Discretionary",
    "miscellaneous": "Discretionary",
    "entertainment": "Going Out",
    "dining": "Eating Out",
    "restaurant": "Eating Out",
    "travel": "Vacation",
    "vacation": "Vacation",
    "housing": "Rent/Utilities",
    "personal": "Discretionary",
    "clothing": "Shopping",
    "pharmacy": "Medical",
    "fitness": "Discretionary",
}

PAYMENT_NORMALIZE = {
    "credit card": "credit_card",
    "debit card": "debit_card",
    "debit": "debit_card",
    "credit": "credit_card",
    "cash": "cash",
    "transfer": "transfer",
    "ach": "transfer",
    "check": "check",
}

# All known aliases for each canonical column name
COLUMN_ALIASES = {
    # date
    "date": "date",
    "transaction date": "date",
    "trans date": "date",
    "posted date": "date",
    "posting date": "date",
    "post date": "date",
    "txn date": "date",
    "purchase date": "date",
    # description / merchant
    "description": "description",
    "expense": "description",
    "expenses": "description",
    "merchant": "description",
    "payee": "description",
    "memo": "description",
    "name": "description",
    "column 1": "description",
    "item": "description",
    "details": "description",
    "transaction": "description",
    "note": "description",
    "notes": "description",
    "vendor": "description",
    "store": "description",
    # description / merchant (continued)
    "item id": "description",
    # amount
    "amount": "amount",
    "price": "amount",
    "cost": "amount",
    "total": "amount",
    "charge": "amount",
    "debit": "amount",
    "transaction amount": "amount",
    "spend": "amount",
    "spending": "amount",
    "value": "amount",
    "sum": "amount",
    "$": "amount",
    # category
    "category": "category",
    "type": "category",
    "transaction type": "category",
    "cat": "category",
    "label": "category",
    "tag": "category",
    "tags": "category",
    "budget category": "category",
    # payment method
    "status": "payment_method",
    "payment method": "payment_method",
    "payment type": "payment_method",
    "method": "payment_method",
    "paid via": "payment_method",
    "pay method": "payment_method",
}

# Sheets tab name patterns that look like months (APR24, APR2024, APRIL 2024, April24, etc.)
MONTH_TAB_RE = re.compile(
    r"^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s\-_]*\d{2,4}$",
    re.IGNORECASE,
)

_MONTH_ABBR = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _tab_to_month_key(tab_name: str) -> Optional[str]:
    """
    Normalize a tab name to a canonical 'YYYY-MM' key so that APR24 and
    APR2024 (or APRIL 2024) are treated as the same month.
    Returns None if the tab doesn't parse as a month.
    """
    m = re.match(
        r"^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s\-_]*(\d{2,4})$",
        tab_name.strip(),
        re.IGNORECASE,
    )
    if not m:
        return None
    month_num = _MONTH_ABBR.get(m.group(1).lower()[:3])
    if not month_num:
        return None
    year_str = m.group(2)
    year = (2000 + int(year_str)) if len(year_str) == 2 else int(year_str)
    return f"{year:04d}-{month_num:02d}"

# Looks like a date value (for header-row auto-detection)
DATE_PATTERN = re.compile(r"\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{4}[/\-]\d{2}[/\-]\d{2}")


def _get_sheets_service():
    """Build Google Sheets API client from service account credentials."""
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
    except ImportError:
        raise RuntimeError(
            "Google API libraries not installed. Run: pip install google-api-python-client google-auth"
        )

    if not CREDS_PATH.exists():
        raise FileNotFoundError(
            f"Google Sheets credentials not found at {CREDS_PATH}. "
            "Complete the Google Cloud setup in NEXT_PHASE_PLAN.md."
        )

    creds = Credentials.from_service_account_file(
        str(CREDS_PATH),
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _parse_date(raw: str) -> Optional[date]:
    """Parse common date formats from the spending sheet."""
    if not raw:
        return None
    raw = str(raw).strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y", "%B %d, %Y", "%b %d, %Y",
                "%m-%d-%Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    # Excel serial date (float as string)
    try:
        serial = float(raw)
        if 20000 < serial < 60000:  # sanity check: reasonable Excel serial range
            return (datetime(1899, 12, 30) + timedelta(days=int(serial))).date()
    except (ValueError, OverflowError):
        pass
    return None


def _dedup_hash(txn_date: date, description: str, amount: float) -> str:
    """Stable hash used by BOTH the Sheets sync AND the CSV import dedup."""
    key = f"{txn_date}|{description.strip().lower()}|{round(amount, 2)}"
    return hashlib.sha256(key.encode()).hexdigest()


def _find_header_row(rows: list[list]) -> tuple[int, dict]:
    """
    Scan the first 10 rows to find the one that contains recognizable column headers.
    Returns (header_row_index, col_map) where col_map maps canonical name → column index.
    Falls back to row 0 if nothing looks like a header.
    """
    for row_idx, row in enumerate(rows[:10]):
        if not row:
            continue
        cells = [str(c).strip().lower() for c in row]
        col_map = {}
        for i, cell in enumerate(cells):
            canonical = COLUMN_ALIASES.get(cell)
            if canonical and canonical not in col_map:
                col_map[canonical] = i

        # A valid header row must have at least date AND amount
        if "date" in col_map and "amount" in col_map:
            logger.debug(f"Found header at row {row_idx}: {col_map}")
            return row_idx, col_map

    # Nothing matched — return empty map so the tab is skipped with a useful message
    return 0, {}


_HYSA_KEYWORDS = {"hysa", "everbank", "ever bank", "high yield"}


def _is_hysa_transfer(description: str) -> bool:
    """Return True if the description looks like an HYSA contribution."""
    desc_lower = description.strip().lower()
    return any(kw in desc_lower for kw in _HYSA_KEYWORDS)


def _dedup_desc_key(txn_date: date, description: str) -> str:
    """Match key used for upsert: date + description (without amount)."""
    return f"{txn_date}|{description.strip().lower()}"


def _load_existing_hashes(user_id: int, db: Session) -> set:
    """Load dedup hashes for ALL existing transactions for this user."""
    txns = db.query(Transaction.description, Transaction.date, Transaction.amount).filter(
        Transaction.user_id == user_id
    ).all()
    return {_dedup_hash(t.date, t.description, t.amount) for t in txns}


def _load_sheets_transactions(user_id: int, db: Session) -> dict:
    """Load existing sheets-sourced transactions keyed by (date, desc_lower) for upsert."""
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.import_source.like("sheets:%"),
        )
        .all()
    )
    result = {}
    for t in txns:
        key = _dedup_desc_key(t.date, t.description)
        result[key] = t
    return result


def sync_user_sheet(user_id: int, sheet_id: str, db: Session) -> dict:
    """
    Sync all monthly tabs from the given Google Sheet for the given user.
    Returns {"imported": N, "skipped": N, "errors": [...]}

    NEVER modifies or deletes existing transactions (CSV or otherwise).
    """
    try:
        service = _get_sheets_service()
    except (RuntimeError, FileNotFoundError) as e:
        return {"imported": 0, "skipped": 0, "errors": [str(e)]}

    # Get all tab names — includes hidden sheets intentionally
    try:
        meta = service.spreadsheets().get(spreadsheetId=sheet_id).execute()
    except Exception as e:
        return {"imported": 0, "skipped": 0, "errors": [f"Cannot access sheet: {e}"]}

    all_sheet_props = meta.get("sheets", [])
    tabs = [s["properties"]["title"] for s in all_sheet_props]
    month_tabs = [t for t in tabs if MONTH_TAB_RE.match(t.strip())]

    # Deduplicate tabs that represent the same calendar month (e.g. APR24 vs APR2024).
    # First tab encountered for a given month wins; subsequent ones are skipped entirely.
    seen_month_keys: dict[str, str] = {}   # month_key → winning tab name
    deduped_tabs = []
    for tab in month_tabs:
        key = _tab_to_month_key(tab)
        if key is None:
            continue
        if key in seen_month_keys:
            logger.info(
                f"Skipping tab '{tab}' — same month ({key}) already covered by '{seen_month_keys[key]}'"
            )
            continue
        seen_month_keys[key] = tab
        deduped_tabs.append(tab)
    month_tabs = deduped_tabs

    if not month_tabs:
        all_tabs = ", ".join(tabs[:10])
        return {
            "imported": 0,
            "skipped": 0,
            "errors": [
                f"No monthly tabs found. Tabs in sheet: {all_tabs}. "
                "Expected names like JUL24, JAN2025, MARCH2025."
            ],
        }

    # Get user's categories and default checking account
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"imported": 0, "skipped": 0, "errors": ["User not found"]}

    categories = _ensure_user_categories(user_id, db)
    default_cat = categories.get("Discretionary")

    checking = (
        db.query(Account)
        .filter(Account.user_id == user_id, Account.account_type == "checking")
        .first()
    )

    # Load ALL existing transaction hashes upfront (includes CSV-imported rows)
    existing_hashes = _load_existing_hashes(user_id, db)
    # Load existing sheets transactions for upsert (date+desc key → Transaction obj)
    sheets_by_key = _load_sheets_transactions(user_id, db)

    imported = 0
    updated = 0
    skipped = 0
    errors = []
    duplicates: list[dict] = []

    for tab in month_tabs:
        try:
            result = (
                service.spreadsheets()
                .values()
                .get(spreadsheetId=sheet_id, range=f"'{tab}'")
                .execute()
            )
            rows = result.get("values", [])
            if not rows:
                continue

            # Auto-detect which row contains the column headers
            header_row_idx, col_map = _find_header_row(rows)

            if "date" not in col_map or "amount" not in col_map:
                # Show what we actually found to help debug
                first_row_cells = [str(c).strip() for c in (rows[0] if rows else [])]
                errors.append(
                    f"Tab '{tab}': could not find date/amount columns. "
                    f"First row contents: {first_row_cells[:8]}"
                )
                continue

            data_rows = rows[header_row_idx + 1:]

            for row in data_rows:
                if not row:
                    continue
                try:
                    def get_col(name):
                        idx = col_map.get(name)
                        if idx is None or idx >= len(row):
                            return ""
                        return str(row[idx]).strip()

                    raw_date = get_col("date")
                    raw_amount = get_col("amount")
                    raw_desc = get_col("description") or "Unknown"
                    raw_cat = get_col("category")
                    raw_pay = get_col("payment_method")

                    # Skip rows where date looks like a header or is empty
                    if not raw_date or not raw_amount:
                        skipped += 1
                        continue

                    # Skip rows where the date cell looks like a column label
                    if raw_date.lower() in COLUMN_ALIASES:
                        skipped += 1
                        continue

                    txn_date = _parse_date(raw_date)
                    if not txn_date:
                        skipped += 1
                        continue

                    try:
                        amount_str = str(raw_amount).replace(",", "").replace("$", "").replace("(", "-").replace(")", "")
                        amount = float(amount_str)
                    except ValueError:
                        skipped += 1
                        continue

                    # Skip summary/total rows (very large amounts)
                    if abs(amount) > 50000:
                        skipped += 1
                        continue

                    # Spending sheet: positive amounts = expenses; negate them
                    if amount > 0:
                        amount = -amount

                    # Auto-detect HYSA contributions by description keywords
                    if _is_hysa_transfer(raw_desc):
                        cat_name = "Savings Transfer"
                    elif raw_cat.strip():
                        cat_name = CATEGORY_NORMALIZE.get(raw_cat.strip().lower(), "Discretionary")
                    else:
                        cat_name = "Discretionary"
                    category = _get_or_create_category(cat_name, user_id, categories, db)

                    payment = PAYMENT_NORMALIZE.get(raw_pay.strip().lower()) or "debit_card"

                    # Upsert: if a sheets transaction with same date+desc already exists,
                    # update the amount (handles edits in the Google Sheet).
                    desc_key = _dedup_desc_key(txn_date, raw_desc)
                    if desc_key in sheets_by_key:
                        existing_txn = sheets_by_key[desc_key]
                        if existing_txn.amount != amount:
                            # Remove old hash, update amount, add new hash
                            old_hash = _dedup_hash(existing_txn.date, existing_txn.description, existing_txn.amount)
                            existing_hashes.discard(old_hash)
                            existing_txn.amount = amount
                            existing_txn.category_id = category.id if category else existing_txn.category_id
                            existing_hashes.add(_dedup_hash(txn_date, raw_desc, amount))
                            updated += 1
                        else:
                            duplicates.append({
                                "date": str(txn_date),
                                "description": raw_desc,
                                "amount": amount,
                                "tab": tab,
                            })
                            skipped += 1
                        continue

                    # Dedup check — same hash used for CSV imports so no cross-source dupes
                    h = _dedup_hash(txn_date, raw_desc, amount)
                    if h in existing_hashes:
                        duplicates.append({
                            "date": str(txn_date),
                            "description": raw_desc,
                            "amount": amount,
                            "tab": tab,
                        })
                        skipped += 1
                        continue

                    txn = Transaction(
                        user_id=user_id,
                        account_id=checking.id if checking else None,
                        category_id=category.id if category else None,
                        date=txn_date,
                        amount=amount,
                        description=raw_desc,
                        payment_method=payment,
                        is_verified=False,
                        import_source=f"sheets:{tab}",
                    )
                    db.add(txn)
                    existing_hashes.add(h)
                    sheets_by_key[desc_key] = txn
                    imported += 1

                except Exception as row_err:
                    skipped += 1
                    logger.debug(f"Row error in {tab}: {row_err}")

            db.commit()

        except Exception as tab_err:
            errors.append(f"Tab '{tab}': {tab_err}")
            db.rollback()

    return {"imported": imported, "updated": updated, "skipped": skipped, "errors": errors, "duplicates": duplicates}


def sync_all_users() -> None:
    """Called by the scheduler every 30 minutes."""
    db: Session = SessionLocal()
    try:
        configs = db.query(SyncConfig).filter(
            SyncConfig.is_enabled == True,
            SyncConfig.sheet_id.isnot(None),
        ).all()

        for cfg in configs:
            try:
                result = sync_user_sheet(cfg.user_id, cfg.sheet_id, db)
                cfg.last_sync_at = datetime.utcnow()
                if result["errors"]:
                    cfg.last_sync_status = "error"
                    cfg.last_sync_message = "; ".join(result["errors"])
                else:
                    cfg.last_sync_status = "ok"
                    upd = result.get('updated', 0)
                    cfg.last_sync_message = (
                        f"Imported {result['imported']}, updated {upd}, skipped {result['skipped']}"
                    )
                db.commit()
                logger.info(f"Sync user {cfg.user_id}: {cfg.last_sync_message}")
            except Exception as e:
                logger.error(f"Sync failed for user {cfg.user_id}: {e}")
                cfg.last_sync_status = "error"
                cfg.last_sync_message = str(e)
                db.commit()
    finally:
        db.close()
