"""Paystub upload, parse, and CRUD router.

When a paystub is confirmed (POST /paystubs), the router automatically
creates income transactions so the paystub shows up in transaction history:
  - One "Salary" (or "Bonus") income transaction for net_pay
  - One "Salary" transaction for employer_401k contribution (if > 0)

Transactions are linked to the user's first checking account (or any
non-loan, non-credit account if no checking exists).
"""
import shutil
from datetime import date, datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.account import Account, AccountType
from app.models.category import Category
from app.models.paystub import Paystub
from app.models.recurring_rule import RecurringRule
from app.models.transaction import Transaction
from app.models.user import User

router = APIRouter(prefix="/paystubs", tags=["paystubs"])

UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads" / "paystubs"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Account types that can receive paycheck deposits (in priority order)
_DEPOSIT_ACCOUNT_TYPES = [
    AccountType.checking,
    AccountType.savings,
    AccountType.hysa,
    AccountType.paycheck,
    AccountType.other,
]

# Account types that can receive 401k employer contributions (in priority order)
_401K_ACCOUNT_TYPES = [
    AccountType.retirement_401k,
    AccountType.brokerage,
]


# ── Schemas ────────────────────────────────────────────────────────────────────

class PaystubIn(BaseModel):
    employer: Optional[str] = None
    voucher_number: Optional[str] = None
    pay_date: date
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    pay_type: Optional[str] = "regular"   # "regular" | "bonus"
    gross_pay: float = 0.0
    regular_pay: float = 0.0
    bonus_pay: float = 0.0
    holiday_pay: float = 0.0
    overtime_pay: float = 0.0
    salary_per_period: float = 0.0
    fed_taxable_income: float = 0.0
    employer_401k: float = 0.0
    tax_federal: float = 0.0
    tax_state: float = 0.0
    tax_county: float = 0.0
    tax_social_security: float = 0.0
    tax_medicare: float = 0.0
    tax_total: float = 0.0
    deduction_401k: float = 0.0
    deduction_dental: float = 0.0
    deduction_vision: float = 0.0
    deduction_life_insurance: float = 0.0
    deduction_ad_and_d: float = 0.0
    deduction_std_ltd: float = 0.0
    deduction_total: float = 0.0
    net_pay: float = 0.0
    ytd_gross: float = 0.0
    ytd_net: float = 0.0
    ytd_401k_employee: float = 0.0
    ytd_401k_employer: float = 0.0
    ytd_federal_tax: float = 0.0
    ytd_state_tax: float = 0.0
    ytd_ss: float = 0.0
    ytd_medicare: float = 0.0
    ytd_taxes_total: float = 0.0
    parse_method: Optional[str] = "manual"
    notes: Optional[str] = None


class PaystubOut(PaystubIn):
    id: int
    user_id: int
    raw_pdf_path: Optional[str] = None
    created_at: datetime
    # Populated on save — tells the frontend what happened with the salary rule
    salary_rule_action: Optional[str] = None   # "created" | "updated_raise" | "updated_change" | "unchanged" | None
    salary_rule_amount: Optional[float] = None  # the monthly amount in the rule after save
    model_config = {"from_attributes": True}


class ParsedPaystub(BaseModel):
    """Returned after parsing — user reviews before confirming."""
    parsed: dict
    parse_method: str
    raw_text_excerpt: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _find_deposit_account(user_id: int, db: Session) -> Optional[Account]:
    """Return the best account to deposit a paycheck into."""
    for acct_type in _DEPOSIT_ACCOUNT_TYPES:
        acct = (
            db.query(Account)
            .filter(
                Account.user_id == user_id,
                Account.account_type == acct_type.value,
                Account.is_active == True,
            )
            .first()
        )
        if acct:
            return acct
    return None


def _find_401k_account(user_id: int, db: Session) -> Optional[Account]:
    """Return the user's 401k account (or brokerage as fallback) for employer contributions."""
    for acct_type in _401K_ACCOUNT_TYPES:
        acct = (
            db.query(Account)
            .filter(
                Account.user_id == user_id,
                Account.account_type == acct_type.value,
                Account.is_active == True,
            )
            .first()
        )
        if acct:
            return acct
    return None


def _find_category(db: Session, name: str, kind: str) -> Optional[Category]:
    """Find a category by name (case-insensitive) and kind."""
    return (
        db.query(Category)
        .filter(Category.name.ilike(name), Category.kind == kind)
        .first()
    )


def _create_income_transactions(stub: Paystub, db: Session) -> None:
    """
    Create income transactions from a saved paystub.

    - Net pay → "Salary" (regular) or "Bonus" (bonus pay_type) income category
    - Employer 401k → "Salary" category (it's additional compensation)

    Transactions are tagged import_source="paystub:{stub.id}" so they can be
    identified and aren't duplicated on re-saves.
    """
    account = _find_deposit_account(stub.user_id, db)

    # Pick income category based on pay type
    if stub.pay_type == "bonus":
        income_cat = (
            _find_category(db, "Bonus", "income")
            or _find_category(db, "Salary", "income")
        )
    else:
        income_cat = (
            _find_category(db, "Salary", "income")
            or _find_category(db, "Side Income", "income")
        )

    employer_label = f" — {stub.employer}" if stub.employer else ""
    source_tag = f"paystub:{stub.id}"

    # Net pay transaction
    if stub.net_pay and stub.net_pay > 0:
        if stub.pay_type == "bonus":
            desc = f"Bonus Paycheck{employer_label}"
        else:
            desc = f"Paycheck{employer_label}"

        txn = Transaction(
            user_id=stub.user_id,
            account_id=account.id if account else None,
            category_id=income_cat.id if income_cat else None,
            date=stub.pay_date,
            amount=stub.net_pay,
            description=desc,
            payment_method="direct_deposit",
            is_verified=True,
            import_source=source_tag,
        )
        db.add(txn)

    # Employer 401k contribution — goes directly into the 401k account, not checking
    if stub.employer_401k and stub.employer_401k > 0:
        employer_401k_cat = (
            _find_category(db, "Salary", "income")
            or income_cat
        )
        k401_account = _find_401k_account(stub.user_id, db)
        txn_401k = Transaction(
            user_id=stub.user_id,
            account_id=k401_account.id if k401_account else (account.id if account else None),
            category_id=employer_401k_cat.id if employer_401k_cat else None,
            date=stub.pay_date,
            amount=stub.employer_401k,
            description=f"Employer 401k Contribution{employer_label}",
            payment_method="direct_deposit",
            is_verified=True,
            import_source=source_tag,
        )
        db.add(txn_401k)


def _upsert_salary_rule(stub: Paystub, db: Session) -> dict:
    """
    After saving a regular (non-bonus) paystub, auto-create or update a
    Salary recurring rule so the forecast always has an income signal.

    - Monthly amount = net_pay * 2  (semi-monthly pay → monthly equivalent)
    - If no salary rule exists → creates one, returns action="created"
    - If one exists and amount differs by >3% → updates it, returns action="updated_raise"
      or "updated_change" depending on direction
    - If within 3% → no change, returns action="unchanged"
    - Bonus paystubs are skipped entirely → returns action=None
    """
    if stub.pay_type == "bonus" or not stub.net_pay or stub.net_pay <= 0:
        return {"action": None, "amount": None}

    monthly_amount = round(stub.net_pay * 2, 2)

    salary_cat = (
        db.query(Category)
        .filter(Category.name.ilike("salary"), Category.kind == "income")
        .first()
    )

    existing_rule = (
        db.query(RecurringRule)
        .filter(
            RecurringRule.user_id == stub.user_id,
            RecurringRule.scenario_id.is_(None),
            RecurringRule.name.ilike("salary"),
            RecurringRule.amount > 0,
        )
        .first()
    )

    if existing_rule is None:
        rule = RecurringRule(
            user_id=stub.user_id,
            category_id=salary_cat.id if salary_cat else None,
            name="Salary",
            amount=monthly_amount,
            frequency="monthly",
            start_date=stub.pay_date,
            is_active=True,
            description=f"Auto-created from paystub on {stub.pay_date}",
        )
        db.add(rule)
        return {"action": "created", "amount": monthly_amount}

    # Compare new monthly amount to existing rule
    pct_diff = (monthly_amount - existing_rule.amount) / abs(existing_rule.amount)
    if abs(pct_diff) < 0.03:
        return {"action": "unchanged", "amount": existing_rule.amount}

    action = "updated_raise" if pct_diff > 0 else "updated_change"
    existing_rule.amount = monthly_amount
    existing_rule.description = (
        f"Updated from paystub on {stub.pay_date} "
        f"({'raise' if pct_diff > 0 else 'change'}: {pct_diff:+.1%})"
    )
    return {"action": action, "amount": monthly_amount}


def _delete_paystub_transactions(stub_id: int, user_id: int, db: Session) -> None:
    """Remove income transactions previously created from this paystub."""
    db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.import_source == f"paystub:{stub_id}",
    ).delete()


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/parse", response_model=ParsedPaystub)
async def parse_paystub(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a PDF and get back the parsed fields for review."""
    suffix = Path(file.filename or "stub.pdf").suffix.lower()
    if suffix not in {".pdf", ".png", ".jpg", ".jpeg"}:
        raise HTTPException(400, "Only PDF, PNG, and JPEG files are supported.")

    tmp_path = UPLOAD_DIR / f"tmp_{current_user.id}_{datetime.utcnow().timestamp()}{suffix}"
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        from app.services.paystub_parser import parse_paystub_pdf
        result = parse_paystub_pdf(str(tmp_path))
    except RuntimeError as e:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(422, str(e))

    result["_tmp_path"] = str(tmp_path)
    return ParsedPaystub(
        parsed=result,
        parse_method=result.get("parse_method", "pdfplumber"),
        raw_text_excerpt=result.get("raw_text_excerpt"),
    )


@router.delete("", status_code=204)
def delete_all_paystubs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete every paystub and all linked income transactions for the current user."""
    # Bulk-delete all transactions sourced from any paystub (import_source = "paystub:N")
    db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.import_source.like("paystub:%"),
    ).delete(synchronize_session=False)
    # Bulk-delete all paystub records
    db.query(Paystub).filter(
        Paystub.user_id == current_user.id,
    ).delete(synchronize_session=False)
    db.commit()


@router.post("", response_model=PaystubOut, status_code=201)
def save_paystub(
    data: PaystubIn,
    raw_pdf_path: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a confirmed (reviewed) paystub and auto-create income transactions."""
    # Duplicate guard: one paystub per pay_date per user
    existing = db.query(Paystub).filter(
        Paystub.user_id == current_user.id,
        Paystub.pay_date == data.pay_date,
    ).first()
    if existing:
        raise HTTPException(
            409,
            f"A paystub for {data.pay_date} already exists (id {existing.id}). "
            "Delete the existing one first, or correct the pay date.",
        )

    stub = Paystub(
        user_id=current_user.id,
        raw_pdf_path=raw_pdf_path,
        **data.model_dump()
    )
    db.add(stub)
    db.flush()  # get stub.id before creating transactions

    _create_income_transactions(stub, db)
    rule_result = _upsert_salary_rule(stub, db)

    db.commit()
    db.refresh(stub)

    # Attach rule info to the response (not a DB column — set as instance attrs)
    out = PaystubOut.model_validate(stub)
    out.salary_rule_action = rule_result["action"]
    out.salary_rule_amount = rule_result["amount"]
    return out


@router.get("", response_model=List[PaystubOut])
def list_paystubs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Paystub)
        .filter(Paystub.user_id == current_user.id)
        .order_by(Paystub.pay_date.desc())
        .all()
    )


@router.get("/{stub_id}", response_model=PaystubOut)
def get_paystub(
    stub_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stub = db.query(Paystub).filter(Paystub.id == stub_id, Paystub.user_id == current_user.id).first()
    if not stub:
        raise HTTPException(404, "Paystub not found")
    return stub


@router.put("/{stub_id}", response_model=PaystubOut)
def update_paystub(
    stub_id: int,
    data: PaystubIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a paystub and regenerate its income transactions."""
    stub = db.query(Paystub).filter(Paystub.id == stub_id, Paystub.user_id == current_user.id).first()
    if not stub:
        raise HTTPException(404, "Paystub not found")

    # Remove old transactions then rebuild from updated data
    _delete_paystub_transactions(stub_id, current_user.id, db)

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(stub, k, v)

    _create_income_transactions(stub, db)

    db.commit()
    db.refresh(stub)
    return stub


@router.delete("/{stub_id}", status_code=204)
def delete_paystub(
    stub_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a paystub and its associated income transactions."""
    stub = db.query(Paystub).filter(Paystub.id == stub_id, Paystub.user_id == current_user.id).first()
    if stub:
        _delete_paystub_transactions(stub_id, current_user.id, db)
        db.delete(stub)
        db.commit()
