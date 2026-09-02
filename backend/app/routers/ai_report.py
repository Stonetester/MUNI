"""AI monthly financial report router."""
from datetime import date
import json
import re
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.chat_session import ChatSession, ChatMessageRow, FinancialPlan
from app.models.transaction import Transaction
from app.services.transaction_math import counts_as_income
from app.services.ai_report import generate_monthly_report, answer_chat_question, list_ollama_models

router = APIRouter(prefix="/ai-report", tags=["ai-report"])


def _make_title(message: str) -> str:
    """Derive a short session title from the first user message."""
    text = " ".join(message.strip().split())
    return (text[:57] + "…") if len(text) > 60 else (text or "New chat")


# Curated shortlist for the MUNI chat picker. Benchmarked 2026-08-27 on the V100:
# all three answer finance questions well and finish in ~13-28s. The 32b models are
# deliberately excluded — they can run past the browser/proxy timeout ("Network Error").
RECOMMENDED_OLLAMA_MODELS = [
    {"name": "qwen3.6:27b", "label": "Qwen3.6 27B — best reasoning (default)"},
    {"name": "gpt-oss:20b", "label": "GPT-OSS 20B — fastest, concise"},
    {"name": "mistral-small:24b", "label": "Mistral Small 24B — steady middle ground"},
]


@router.get("/ollama-models")
def get_ollama_models(current_user: User = Depends(get_current_user)):
    """Curated Local AI models for MUNI chat. Only the ones actually installed on Mongol
    are returned, so the list is empty when Mongol is asleep."""
    from app.config import settings
    default = settings.OLLAMA_CHAT_MODEL or "qwen3.6:27b"
    installed = {m["name"] for m in list_ollama_models()}
    models = [m for m in RECOMMENDED_OLLAMA_MODELS if m["name"] in installed]
    if default not in {m["name"] for m in models} and models:
        default = models[0]["name"]
    return {"default": default, "models": models}


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


# ── Saved Financial Plans ────────────────────────────────────────────

def _money(value: str) -> int:
    match = re.search(r"\$?\s*([0-9][0-9,]*(?:\.\d{1,2})?)", value or "")
    return int(round(float(match.group(1).replace(",", "")))) if match else 0


def _extract_allocations(markdown: str) -> list[dict]:
    """Extract the documented plan tables; Python performs the validation math."""
    rows: list[dict] = []
    section = ""
    for line in markdown.replace("\r", "").split("\n"):
        low = line.lower()
        if "recommended monthly plan" in low:
            section = "spending"
        elif "savings allocation" in low:
            section = "savings"
        if not (section and line.strip().startswith("|") and line.strip().endswith("|")):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 2 or set("".join(cells)) <= {"-", ":", " "}:
            continue
        if any(h in cells[0].lower() for h in ("category", "account or goal")):
            continue
        amount = _money(cells[1])
        if amount > 0:
            rows.append({"kind": section, "label": cells[0], "amount": amount, "funded_by": cells[2] if len(cells) > 2 else ""})
    return rows


def _plan_payload(plan: FinancialPlan) -> dict:
    return {
        "id": plan.id, "session_id": plan.session_id, "title": plan.title,
        "objective": plan.objective, "content": plan.content, "model_used": plan.model_used,
        "is_joint": plan.is_joint, "allocations": json.loads(plan.allocations_json or "[]"),
        "monthly_income": plan.monthly_income, "proposed_total": plan.proposed_total,
        "validation_status": plan.validation_status,
        "created_at": plan.created_at.isoformat(), "updated_at": plan.updated_at.isoformat(),
    }


class SavePlanRequest(BaseModel):
    title: Optional[str] = None


@router.post("/sessions/{session_id}/plans")
def save_financial_plan(
    session_id: int,
    body: SavePlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id).first()
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    user_msg = next((m for m in reversed(session.messages) if m.role == "user"), None)
    answer = next((m for m in reversed(session.messages) if m.role == "assistant"), None)
    if not user_msg or not answer:
        raise HTTPException(status_code=400, detail="The chat needs a completed answer before it can be saved as a plan")

    allocations = _extract_allocations(answer.content)
    proposed_total = sum(row["amount"] for row in allocations)
    users = db.query(User).all() if session.is_joint else [current_user]
    ids = [u.id for u in users]
    income = sum(
        t.amount for t in db.query(Transaction).filter(
            Transaction.user_id.in_(ids), Transaction.scenario_id.is_(None),
            Transaction.date >= date.today().replace(day=1), Transaction.date <= date.today(),
        ).all() if counts_as_income(t)
    )
    monthly_income = int(round(income))
    status = "balanced" if allocations and proposed_total <= monthly_income else ("over_income" if allocations else "needs_review")
    plan = FinancialPlan(
        user_id=current_user.id, session_id=session.id,
        title=(body.title or session.title or "Financial plan")[:120], objective=user_msg.content,
        content=answer.content, model_used=answer.model_used or session.model_used,
        is_joint=session.is_joint, allocations_json=json.dumps(allocations),
        monthly_income=monthly_income, proposed_total=proposed_total, validation_status=status,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return _plan_payload(plan)


@router.get("/plans")
def list_financial_plans(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plans = db.query(FinancialPlan).filter(FinancialPlan.user_id == current_user.id).order_by(FinancialPlan.updated_at.desc()).all()
    return [_plan_payload(p) for p in plans]


@router.delete("/plans/{plan_id}")
def delete_financial_plan(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = db.query(FinancialPlan).filter(FinancialPlan.id == plan_id, FinancialPlan.user_id == current_user.id).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Financial plan not found")
    db.delete(plan)
    db.commit()
    return {"ok": True}
