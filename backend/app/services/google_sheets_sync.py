"""
Google Sheets → Transactions sync service.

Reads monthly tab data from the user's spending Google Sheet and
imports new transactions, deduplicating by (date + description + amount).
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, date
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

# Maps category names from the sheet to canonical app category names
CATEGORY_NORMALIZE = {
    "car expense": "Car Expense",
    "car repair": "Car Repair",
    "eating out": "Eating Out",
    "going out": "Going Out",
    "discretionary": "Discretionary",
    "family": "Family",
    "rent/utilities": "Rent/Utilities",
    "medical": "Medical",
    "groceries": "Groceries",
    "subscriptions": "Subscriptions",
    "gas": "Gas",
    "required": "Required",
    "gifts": "Gifts",
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
    "tax": "Tax",
    "uncategorized": "Discretionary",
    "expense": "Discretionary",
}

PAYMENT_NORMALIZE = {
    "credit card": "credit_card",
    "debit card": "debit_card",
    "debit": "debit_card",
    "credit": "credit_card",
}

# Sheets tab name patterns that look like months (JUL24, JAN2025, MARCH2025, etc.)
MONTH_TAB_RE = re.compile(
    r"^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*\d{2,4}$",
    re.IGNORECASE,
)


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
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    # Excel serial date (float as string)
    try:
        serial = float(raw)
        from datetime import timedelta
        return (datetime(1899, 12, 30) + timedelta(days=serial)).date()
    except (ValueError, OverflowError):
        pass
    return None


def _dedup_hash(txn_date: date, description: str, amount: float) -> str:
    key = f"{txn_date}|{description.strip().lower()}|{round(amount, 2)}"
    return hashlib.sha256(key.encode()).hexdigest()


def sync_user_sheet(user_id: int, sheet_id: str, db: Session) -> dict:
    """
    Sync all monthly tabs from the given Google Sheet for the given user.
    Returns {"imported": N, "skipped": N, "errors": [...]}
    """
    try:
        service = _get_sheets_service()
    except (RuntimeError, FileNotFoundError) as e:
        return {"imported": 0, "skipped": 0, "errors": [str(e)]}

    # Get all tab names
    try:
        meta = service.spreadsheets().get(spreadsheetId=sheet_id).execute()
    except Exception as e:
        return {"imported": 0, "skipped": 0, "errors": [f"Cannot access sheet: {e}"]}

    tabs = [s["properties"]["title"] for s in meta.get("sheets", [])]
    month_tabs = [t for t in tabs if MONTH_TAB_RE.match(t.strip())]

    if not month_tabs:
        return {"imported": 0, "skipped": 0, "errors": ["No monthly tabs found (expected names like JUL24, JAN2025)"]}

    # Get user's categories and default checking account
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"imported": 0, "skipped": 0, "errors": ["User not found"]}

    categories = {c.name: c for c in db.query(Category).filter(Category.user_id == user_id).all()}
    default_cat = categories.get("Discretionary")

    # Find default checking account
    checking = (
        db.query(Account)
        .filter(Account.user_id == user_id, Account.account_type == "checking")
        .first()
    )

    # Load existing dedup hashes
    existing_hashes = set()
    existing_txns = db.query(Transaction.description, Transaction.date, Transaction.amount).filter(
        Transaction.user_id == user_id
    ).all()
    for t in existing_txns:
        existing_hashes.add(_dedup_hash(t.date, t.description, t.amount))

    imported = 0
    skipped = 0
    errors = []

    for tab in month_tabs:
        try:
            result = (
                service.spreadsheets()
                .values()
                .get(spreadsheetId=sheet_id, range=f"'{tab}'")
                .execute()
            )
            rows = result.get("values", [])
            if len(rows) < 2:
                continue

            # Find headers (first non-empty row)
            headers = [str(h).strip().lower() for h in rows[0]]

            # Map headers to canonical names
            col_map = {}
            ALIASES = {
                "expense": "description",
                "column 1": "description",
                "description": "description",
                "merchant": "description",
                "transaction date": "date",
                "date": "date",
                "type": "category",
                "category": "category",
                "price": "amount",
                "amount": "amount",
                "status": "payment_method",
            }
            for i, h in enumerate(headers):
                canonical = ALIASES.get(h)
                if canonical and canonical not in col_map:
                    col_map[canonical] = i

            if "date" not in col_map or "amount" not in col_map:
                errors.append(f"Tab '{tab}': missing required columns (date, amount)")
                continue

            for row in rows[1:]:
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

                    if not raw_date or not raw_amount:
                        skipped += 1
                        continue

                    txn_date = _parse_date(raw_date)
                    if not txn_date:
                        skipped += 1
                        continue

                    try:
                        amount = float(str(raw_amount).replace(",", "").replace("$", ""))
                    except ValueError:
                        skipped += 1
                        continue

                    # Spending sheet has positive amounts = expenses; negate
                    if amount > 0:
                        amount = -amount

                    h = _dedup_hash(txn_date, raw_desc, amount)
                    if h in existing_hashes:
                        skipped += 1
                        continue

                    cat_name = CATEGORY_NORMALIZE.get(raw_cat.strip().lower(), "Discretionary")
                    category = categories.get(cat_name) or default_cat

                    payment = PAYMENT_NORMALIZE.get(raw_pay.strip().lower(), "debit_card")

                    txn = Transaction(
                        user_id=user_id,
                        account_id=checking.id if checking else None,
                        category_id=category.id if category else None,
                        date=txn_date,
                        amount=amount,
                        description=raw_desc,
                        payment_method=payment,
                        is_verified=False,
                        import_source=f"Google Sheets:{tab}",
                    )
                    db.add(txn)
                    existing_hashes.add(h)
                    imported += 1

                except Exception as row_err:
                    skipped += 1
                    logger.debug(f"Row error in {tab}: {row_err}")

            db.commit()

        except Exception as tab_err:
            errors.append(f"Tab '{tab}': {tab_err}")
            db.rollback()

    return {"imported": imported, "skipped": skipped, "errors": errors}


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
                    cfg.last_sync_status = "success"
                    cfg.last_sync_message = f"Imported {result['imported']}, skipped {result['skipped']}"
                db.commit()
                logger.info(f"Sync user {cfg.user_id}: {cfg.last_sync_message}")
            except Exception as e:
                logger.error(f"Sync failed for user {cfg.user_id}: {e}")
                cfg.last_sync_status = "error"
                cfg.last_sync_message = str(e)
                db.commit()
    finally:
        db.close()
