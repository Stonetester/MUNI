"""Coin — local finance Q&A endpoint. Called by the OpenClaw orchestrator on Mongol."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List

from app.auth import get_current_user
from app.database import get_db
from app.models.account import Account
from app.models.user import User
from app.services.coin import answer_finance_query

router = APIRouter(prefix="/coin", tags=["coin"])


class CoinQuery(BaseModel):
    query: str


class CoinResponse(BaseModel):
    answer: str


class InstitutionsResponse(BaseModel):
    institutions: List[str]


@router.post("", response_model=CoinResponse)
def coin_query(
    body: CoinQuery,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Answer a natural language finance question using real MUNI data via Ollama."""
    answer = answer_finance_query(current_user, db, body.query)
    return CoinResponse(answer=answer)


@router.get("/institutions", response_model=InstitutionsResponse)
def get_institutions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return distinct institution names for the user's active accounts."""
    accounts = db.query(Account).filter(
        Account.user_id == current_user.id,
        Account.is_active == True,
        Account.institution.isnot(None),
    ).all()
    institutions = sorted({a.institution.strip() for a in accounts if a.institution and a.institution.strip()})
    return InstitutionsResponse(institutions=institutions)
