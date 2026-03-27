"""Statement PDF upload and parse router.

POST /statements/parse  — upload a PDF, get back parsed institution/date/balance
The actual snapshot save goes through POST /balance-snapshots (existing endpoint).
"""
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional

from app.auth import get_current_user
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

    return ParsedStatementOut(
        institution=result.institution,
        account_type_hint=result.account_type_hint,
        account_label=result.account_label,
        statement_date=result.statement_date.isoformat() if result.statement_date else None,
        ending_balance=result.ending_balance,
        account_number_hint=result.account_number_hint,
    )
