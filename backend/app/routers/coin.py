"""Coin — local finance Q&A endpoint. Called by the OpenClaw orchestrator on Mongol."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.coin import answer_finance_query

router = APIRouter(prefix="/coin", tags=["coin"])


class CoinQuery(BaseModel):
    query: str


class CoinResponse(BaseModel):
    answer: str


@router.post("", response_model=CoinResponse)
def coin_query(
    body: CoinQuery,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Answer a natural language finance question using real MUNI data via Ollama."""
    answer = answer_finance_query(current_user, db, body.query)
    return CoinResponse(answer=answer)
