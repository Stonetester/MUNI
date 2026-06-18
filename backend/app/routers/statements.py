"""Statement PDF upload and parse router.

POST /statements/parse  — upload a PDF, get back parsed institution/date/balance
The actual snapshot save goes through POST /balance-snapshots (existing endpoint).
"""
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/statements", tags=["statements"])


class ParsedStatementOut(BaseModel):
    institution: str
    account_type_hint: str
    account_label: str
    statement_date: Optional[str]   # ISO date string or None
    ending_balance: Optional[float]
    account_number_hint: Optional[str]


@router.post("/parse", response_model=ParsedStatementOut)
async def parse_statement(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # Write upload to a temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        from app.services.statement_parser import parse_statement as _parse
        result = _parse(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return _to_out(result)


class HoldingOut(BaseModel):
    ticker: str
    fund_name: str
    value: Optional[float]
    weight_percent: Optional[float]


class ParsedStatementFullOut(ParsedStatementOut):
    holdings: list[HoldingOut] = []
    personal_rate_of_return: Optional[float] = None


def _to_out(result) -> "ParsedStatementFullOut":
    return ParsedStatementFullOut(
        institution=result.institution,
        account_type_hint=result.account_type_hint,
        account_label=result.account_label,
        statement_date=result.statement_date.isoformat() if result.statement_date else None,
        ending_balance=result.ending_balance,
        account_number_hint=result.account_number_hint,
        holdings=[
            HoldingOut(ticker=h.ticker, fund_name=h.fund_name, value=h.value, weight_percent=h.weight_percent)
            for h in (result.holdings or [])
        ],
        personal_rate_of_return=result.personal_rate_of_return,
    )


@router.post("/parse-full", response_model=ParsedStatementFullOut)
async def parse_statement_full(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Same as /parse but also returns parsed holdings + stated rate of return."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        from app.services.statement_parser import parse_statement as _parse
        result = _parse(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)
    return _to_out(result)


class ApplyHoldingIn(BaseModel):
    ticker: str
    fund_name: Optional[str] = None
    value: float
    weight_percent: Optional[float] = None


class ApplyStatementIn(BaseModel):
    account_id: int
    statement_date: str            # ISO date
    ending_balance: Optional[float] = None
    holdings: list[ApplyHoldingIn] = []


@router.post("/apply")
def apply_statement(
    data: ApplyStatementIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Persist a parsed statement: create a balance snapshot and upsert holdings.

    - Snapshot: dedups by account+date, keeps Account.balance in sync (latest).
    - Holdings: matched by (account, ticker); value + weight updated, new ones created.
    """
    from app.services.statement_apply import apply_parsed_statement

    return apply_parsed_statement(
        db, current_user, data.account_id, data.statement_date,
        data.ending_balance, [h.model_dump() for h in data.holdings],
    )
