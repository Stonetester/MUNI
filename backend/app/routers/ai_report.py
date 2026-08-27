"""AI monthly financial report router."""
from datetime import date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.chat_session import ChatSession, ChatMessageRow
from app.services.ai_report import generate_monthly_report, answer_chat_question, list_ollama_models

router = APIRouter(prefix="/ai-report", tags=["ai-report"])


def _make_title(message: str) -> str:
    """Derive a short session title from the first user message."""
    text = " ".join(message.strip().split())
    return (text[:57] + "…") if len(text) > 60 else (text or "New chat")


@router.get("/ollama-models")
def get_ollama_models(current_user: User = Depends(get_current_user)):
    """Local AI models available on Mongol (Ollama). Empty if Mongol is asleep."""
    from app.config import settings
    default = settings.OLLAMA_CHAT_MODEL or "qwen3:14b"
    return {"default": default, "models": list_ollama_models()}


@router.get("/types")
def get_report_types():
    """Report types the frontend can offer."""
    from app.services.ai_report import REPORT_TYPES
    return [{"id": k, "label": v} for k, v in REPORT_TYPES.items()]


@router.get("")
def get_ai_report(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    provider: str = Query(default="claude", description="AI provider: 'claude', 'openai', or 'ollama'"),
    report_type: str = Query(default="monthly", description="monthly | spending | investments | goals | year"),
    joint: bool = Query(default=True, description="Household report (both partners) vs just the current user"),
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

    report = generate_monthly_report(
        current_user, db, target_year, target_month,
        provider=provider, report_type=report_type, joint=joint,
    )
    return {
        "year": target_year,
        "month": target_month,
        "report": report,
        "provider": provider,
        "report_type": report_type,
        "joint": joint,
    }


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    provider: str = "ollama"
    model: Optional[str] = None
    escalate: bool = False
    joint: bool = False
    session_id: Optional[int] = None  # append to an existing saved session, or start a new one


@router.post("/chat")
def post_ai_chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reply, model_used = answer_chat_question(
        user=current_user,
        db=db,
        message=body.message,
        history=[{"role": m.role, "content": m.content} for m in body.history],
        provider=body.provider,
        model=body.model,
        escalate=body.escalate,
        joint=body.joint,
    )

    # Persist the turn into a chat session (auto-create + auto-title on the first message).
    session = None
    if body.session_id is not None:
        session = (
            db.query(ChatSession)
            .filter(ChatSession.id == body.session_id, ChatSession.user_id == current_user.id)
            .first()
        )
    if session is None:
        session = ChatSession(
            user_id=current_user.id,
            title=_make_title(body.message),
            is_joint=body.joint,
        )
        db.add(session)
        db.flush()

    session.model_used = model_used
    session.is_joint = body.joint
    db.add(ChatMessageRow(session_id=session.id, role="user", content=body.message))
    db.add(ChatMessageRow(session_id=session.id, role="assistant", content=reply, model_used=model_used))
    db.commit()
    db.refresh(session)

    return {
        "reply": reply,
        "provider": body.provider,
        "model_used": model_used,
        "session_id": session.id,
        "session_title": session.title,
    }


# ── Saved chat sessions ──────────────────────────────────────────────

@router.get("/sessions")
def list_chat_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Past chat sessions for the current user, newest first."""
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "title": s.title,
            "model_used": s.model_used,
            "is_joint": s.is_joint,
            "message_count": len(s.messages),
            "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat(),
        }
        for s in sessions
    ]


@router.get("/sessions/{session_id}")
def get_chat_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full transcript of one saved session."""
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return {
        "id": session.id,
        "title": session.title,
        "model_used": session.model_used,
        "is_joint": session.is_joint,
        "created_at": session.created_at.isoformat(),
        "updated_at": session.updated_at.isoformat(),
        "messages": [
            {"role": m.role, "content": m.content, "model_used": m.model_used}
            for m in session.messages
        ],
    }


class RenameRequest(BaseModel):
    title: str


@router.patch("/sessions/{session_id}")
def rename_chat_session(
    session_id: int,
    body: RenameRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    session.title = (body.title.strip() or session.title)[:120]
    db.commit()
    return {"id": session.id, "title": session.title}


@router.delete("/sessions/{session_id}")
def delete_chat_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    db.delete(session)
    db.commit()
    return {"ok": True}
