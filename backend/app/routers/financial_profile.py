"""
Financial Profile — salary, 401k settings, HYSA, IRA, hidden sections.
Student loans and investment holdings have their own routers.
"""
import json
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.financial_profile import FinancialProfile
from app.models.paystub import Paystub
from app.models.student_loan import StudentLoan
from app.models.investment_holding import InvestmentHolding
from app.models.compensation_event import CompensationEvent
from app.models.user import User

router = APIRouter(prefix="/financial-profile", tags=["financial-profile"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class ProfileIn(BaseModel):
    gross_annual_salary: Optional[float] = None
    pay_frequency: Optional[str] = "semi_monthly"
    net_per_paycheck: Optional[float] = None
    employer_401k_percent: Optional[float] = None
    employee_401k_per_paycheck: Optional[float] = None
    hysa_apy: Optional[float] = None
    hysa_monthly_contribution: Optional[float] = None
    ira_monthly_contribution: Optional[float] = None
    hidden_sections: Optional[List[str]] = None


class ProfileOut(BaseModel):
    gross_annual_salary: Optional[float]
    pay_frequency: Optional[str]
    net_per_paycheck: Optional[float]
    employer_401k_percent: Optional[float]
    employee_401k_per_paycheck: Optional[float]
    hysa_apy: Optional[float]
    hysa_monthly_contribution: Optional[float]
    ira_monthly_contribution: Optional[float]
    hidden_sections: List[str]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class LoanIn(BaseModel):
    loan_name: str
    servicer: Optional[str] = None
    original_balance: Optional[float] = None
    current_balance: float
    interest_rate: float
    minimum_payment: Optional[float] = None
    is_active: bool = True


class LoanOut(LoanIn):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class HoldingIn(BaseModel):
    account_id: int
    ticker: str
    fund_name: Optional[str] = None
    current_value: float
    monthly_contribution: float = 0.0
    assumed_annual_return: Optional[float] = None
    weight_percent: Optional[float] = None


class HoldingOut(HoldingIn):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CompEventIn(BaseModel):
    event_type: str   # raise | bonus | spot_award | stipend | other
    effective_date: str   # ISO date string
    old_salary: Optional[float] = None
    new_salary: Optional[float] = None
    gross_amount: Optional[float] = None
    net_amount: Optional[float] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class CompEventOut(BaseModel):
    id: int
    user_id: int
    event_type: str
    effective_date: str
    old_salary: Optional[float]
    new_salary: Optional[float]
    gross_amount: Optional[float]
    net_amount: Optional[float]
    description: Optional[str]
    notes: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_or_create_profile(user_id: int, db: Session) -> FinancialProfile:
    p = db.query(FinancialProfile).filter(FinancialProfile.user_id == user_id).first()
    if not p:
        p = FinancialProfile(user_id=user_id, hidden_sections="[]")
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


def _profile_out(p: FinancialProfile) -> dict:
    d = {c.name: getattr(p, c.name) for c in p.__table__.columns}
    try:
        d["hidden_sections"] = json.loads(p.hidden_sections or "[]")
    except Exception:
        d["hidden_sections"] = []
    return d


# ── Financial Profile endpoints ────────────────────────────────────────────────

@router.get("", response_model=ProfileOut)
def get_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_or_create_profile(current_user.id, db)
    return _profile_out(p)


@router.get("/infer-salary")
def infer_salary_from_paystubs(
    limit: int = Query(default=6, ge=1, le=24, description="Max number of recent regular paystubs to average"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Infer salary figures by averaging recent regular (non-bonus) paystubs."""
    stubs = (
        db.query(Paystub)
        .filter(
            Paystub.user_id == current_user.id,
            Paystub.pay_type != "bonus",
        )
        .order_by(Paystub.pay_date.desc())
        .limit(limit)
        .all()
    )

    if not stubs:
        return {"found": 0, "avg_net_per_paycheck": None, "avg_gross_per_paycheck": None, "pay_frequency": None}

    avg_net = round(sum(s.net_pay for s in stubs) / len(stubs), 2)
    avg_gross = round(sum(s.gross_pay for s in stubs if s.gross_pay) / len(stubs), 2) if any(s.gross_pay for s in stubs) else None

    # Detect pay frequency from the most recent stub
    latest = stubs[0]
    pay_frequency = "semi_monthly"  # default
    if latest.period_start and latest.period_end:
        days = (latest.period_end - latest.period_start).days
        if days <= 8:
            pay_frequency = "weekly"
        elif days <= 16:
            pay_frequency = "bi_weekly"
        elif days <= 17:
            pay_frequency = "semi_monthly"
        else:
            pay_frequency = "monthly"

    periods_per_year = {"weekly": 52, "bi_weekly": 26, "semi_monthly": 24, "monthly": 12}.get(pay_frequency, 24)
    gross_annual = round(avg_gross * periods_per_year, 2) if avg_gross else None

    return {
        "found": len(stubs),
        "avg_net_per_paycheck": avg_net,
        "avg_gross_per_paycheck": avg_gross,
        "gross_annual_salary": gross_annual,
        "pay_frequency": pay_frequency,
        "periods_per_year": periods_per_year,
        "latest_pay_date": str(latest.pay_date),
    }


@router.put("", response_model=ProfileOut)
def update_profile(
    data: ProfileIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _get_or_create_profile(current_user.id, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "hidden_sections":
            setattr(p, field, json.dumps(value or []))
        elif value is not None:
            setattr(p, field, value)
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return _profile_out(p)


# ── Student Loans ──────────────────────────────────────────────────────────────

@router.get("/loans", response_model=List[LoanOut])
def list_loans(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(StudentLoan).filter(StudentLoan.user_id == current_user.id).all()


@router.post("/loans", response_model=LoanOut, status_code=201)
def create_loan(data: LoanIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loan = StudentLoan(**data.model_dump(), user_id=current_user.id)
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return loan


@router.put("/loans/{loan_id}", response_model=LoanOut)
def update_loan(loan_id: int, data: LoanIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loan = db.query(StudentLoan).filter(StudentLoan.id == loan_id, StudentLoan.user_id == current_user.id).first()
    if not loan:
        from fastapi import HTTPException
        raise HTTPException(404, "Loan not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(loan, k, v)
    loan.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(loan)
    return loan


@router.delete("/loans/{loan_id}", status_code=204)
def delete_loan(loan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loan = db.query(StudentLoan).filter(StudentLoan.id == loan_id, StudentLoan.user_id == current_user.id).first()
    if loan:
        db.delete(loan)
        db.commit()


# ── Investment Holdings ────────────────────────────────────────────────────────

@router.get("/holdings", response_model=List[HoldingOut])
def list_holdings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models.account import Account
    from sqlalchemy import or_
    user_account_ids = [
        a.id for a in db.query(Account).filter(
            or_(Account.user_id == current_user.id, Account.joint_user_id == current_user.id)
        ).all()
    ]
    return db.query(InvestmentHolding).filter(InvestmentHolding.account_id.in_(user_account_ids)).all()


@router.post("/holdings", response_model=HoldingOut, status_code=201)
def create_holding(data: HoldingIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    holding = InvestmentHolding(**data.model_dump())
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return holding


@router.put("/holdings/{holding_id}", response_model=HoldingOut)
def update_holding(holding_id: int, data: HoldingIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = db.query(InvestmentHolding).filter(InvestmentHolding.id == holding_id).first()
    if not h:
        from fastapi import HTTPException
        raise HTTPException(404, "Holding not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(h, k, v)
    h.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(h)
    return h


@router.delete("/holdings/{holding_id}", status_code=204)
def delete_holding(holding_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = db.query(InvestmentHolding).filter(InvestmentHolding.id == holding_id).first()
    if h:
        db.delete(h)
        db.commit()


# ── Compensation Events ────────────────────────────────────────────────────────

@router.get("/compensation", response_model=List[CompEventOut])
def list_compensation(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(CompensationEvent)
        .filter(CompensationEvent.user_id == current_user.id)
        .order_by(CompensationEvent.effective_date.desc())
        .all()
    )


@router.post("/compensation", response_model=CompEventOut, status_code=201)
def create_compensation(data: CompEventIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from datetime import date as date_type
    evt = CompensationEvent(
        user_id=current_user.id,
        event_type=data.event_type,
        effective_date=date_type.fromisoformat(data.effective_date),
        old_salary=data.old_salary,
        new_salary=data.new_salary,
        gross_amount=data.gross_amount,
        net_amount=data.net_amount,
        description=data.description,
        notes=data.notes,
    )
    db.add(evt)
    db.commit()
    db.refresh(evt)
    return evt


@router.put("/compensation/{evt_id}", response_model=CompEventOut)
def update_compensation(evt_id: int, data: CompEventIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    evt = db.query(CompensationEvent).filter(CompensationEvent.id == evt_id, CompensationEvent.user_id == current_user.id).first()
    if not evt:
        from fastapi import HTTPException
        raise HTTPException(404, "Event not found")
    from datetime import date as date_type
    evt.event_type = data.event_type
    evt.effective_date = date_type.fromisoformat(data.effective_date)
    evt.old_salary = data.old_salary
    evt.new_salary = data.new_salary
    evt.gross_amount = data.gross_amount
    evt.net_amount = data.net_amount
    evt.description = data.description
    evt.notes = data.notes
    db.commit()
    db.refresh(evt)
    return evt


@router.delete("/compensation/{evt_id}", status_code=204)
def delete_compensation(evt_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    evt = db.query(CompensationEvent).filter(CompensationEvent.id == evt_id, CompensationEvent.user_id == current_user.id).first()
    if evt:
        db.delete(evt)
        db.commit()
