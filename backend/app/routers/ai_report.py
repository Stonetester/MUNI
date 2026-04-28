"""AI monthly financial report router."""
from datetime import date
from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.ai_report import generate_monthly_report, answer_chat_question

router = APIRouter(prefix="/ai-report", tags=["ai-report"])


@router.get("")
def get_ai_report(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    provider: str = Query(default="claude", description="AI provider: 'claude', 'openai', or 'ollama'"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    target_year = year or today.year
    target_month = month or today.month

    if year is None and month is None and today.day < 5:
        if today.month == 1:
            target_year = today.year - 1
            target_month = 12
        else:
            target_month = today.month - 1

    report = generate_monthly_report(current_user, db, target_year, target_month, provider=provider)
    return {
        "year": target_year,
        "month": target_month,
        "report": report,
        "provider": provider,
    }


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    provider: str = "claude"


@router.post("/chat")
def post_ai_chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reply = answer_chat_question(
        user=current_user,
        db=db,
        message=body.message,
        history=[{"role": m.role, "content": m.content} for m in body.history],
        provider=body.provider,
    )
    return {"reply": reply, "provider": body.provider}
