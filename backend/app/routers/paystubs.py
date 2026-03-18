"""Paystub upload, parse, and CRUD router."""
import os
import shutil
from datetime import date, datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.paystub import Paystub
from app.models.user import User

router = APIRouter(prefix="/paystubs", tags=["paystubs"])

UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads" / "paystubs"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ── Schemas ────────────────────────────────────────────────────────────────────

class PaystubIn(BaseModel):
    employer: Optional[str] = None
    voucher_number: Optional[str] = None
    pay_date: str                     # ISO date string
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    gross_pay: float = 0.0
    regular_pay: float = 0.0
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
    model_config = {"from_attributes": True}


class ParsedPaystub(BaseModel):
    """Returned after parsing — user reviews before confirming."""
    parsed: dict
    parse_method: str
    raw_text_excerpt: Optional[str] = None


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

    # Save temporarily
    tmp_path = UPLOAD_DIR / f"tmp_{current_user.id}_{datetime.utcnow().timestamp()}{suffix}"
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        from app.services.paystub_parser import parse_paystub_pdf
        result = parse_paystub_pdf(str(tmp_path))
    except RuntimeError as e:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(422, str(e))
    finally:
        # Keep the file — will be moved to permanent location on confirm
        pass

    result["_tmp_path"] = str(tmp_path)
    return ParsedPaystub(
        parsed=result,
        parse_method=result.get("parse_method", "pdfplumber"),
        raw_text_excerpt=result.get("raw_text_excerpt"),
    )


@router.post("", response_model=PaystubOut, status_code=201)
def save_paystub(
    data: PaystubIn,
    raw_pdf_path: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a confirmed (reviewed) paystub to the database."""
    stub = Paystub(
        user_id=current_user.id,
        raw_pdf_path=raw_pdf_path,
        pay_date=date.fromisoformat(data.pay_date),
        period_start=date.fromisoformat(data.period_start) if data.period_start else None,
        period_end=date.fromisoformat(data.period_end) if data.period_end else None,
        **{k: v for k, v in data.model_dump().items()
           if k not in {"pay_date", "period_start", "period_end"}}
    )
    db.add(stub)
    db.commit()
    db.refresh(stub)
    return stub


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


@router.put("/{stub_id}", response_model=PaystubOut)
def update_paystub(
    stub_id: int,
    data: PaystubIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stub = db.query(Paystub).filter(Paystub.id == stub_id, Paystub.user_id == current_user.id).first()
    if not stub:
        raise HTTPException(404, "Paystub not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        if k in {"pay_date", "period_start", "period_end"}:
            setattr(stub, k, date.fromisoformat(v) if v else None)
        else:
            setattr(stub, k, v)
    db.commit()
    db.refresh(stub)
    return stub


@router.delete("/{stub_id}", status_code=204)
def delete_paystub(
    stub_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stub = db.query(Paystub).filter(Paystub.id == stub_id, Paystub.user_id == current_user.id).first()
    if stub:
        db.delete(stub)
        db.commit()
