from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.database import Base


class ChatSession(Base):
    """A saved finance-tutor chat conversation (Ask AI)."""
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False, default="New chat")
    # Provider/model summary for the session (e.g. "qwen3:14b", "qwen3:14b→claude").
    model_used = Column(String, nullable=True)
    # Whether the conversation was grounded in household (joint) numbers.
    is_joint = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User")
    messages = relationship(
        "ChatMessageRow",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessageRow.id",
    )


class ChatMessageRow(Base):
    """One message in a saved chat session."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False)          # "user" | "assistant"
    content = Column(Text, nullable=False)
    model_used = Column(String, nullable=True)     # which model produced an assistant message
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    session = relationship("ChatSession", back_populates="messages")


class FinancialPlan(Base):
    """A saved, auditable planning answer derived from an AI chat session."""
    __tablename__ = "financial_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String, nullable=False)
    objective = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    model_used = Column(String, nullable=True)
    is_joint = Column(Boolean, default=True, nullable=False)
    allocations_json = Column(Text, nullable=False, default="[]")
    monthly_income = Column(Integer, nullable=False, default=0)
    proposed_total = Column(Integer, nullable=False, default=0)
    validation_status = Column(String, nullable=False, default="needs_review")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User")
    session = relationship("ChatSession")
