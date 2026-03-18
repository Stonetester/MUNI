from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Enum, Text
)
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class AccountType(str, enum.Enum):
    checking = "checking"
    savings = "savings"
    hysa = "hysa"
    brokerage = "brokerage"
    ira = "ira"
    retirement_401k = "401k"
    hsa = "hsa"
    credit_card = "credit_card"
    student_loan = "student_loan"
    car_loan = "car_loan"
    mortgage = "mortgage"
    paycheck = "paycheck"
    other = "other"


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    account_type = Column(String, nullable=False, default="checking")
    institution = Column(String, nullable=True)
    balance = Column(Float, default=0.0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    forecast_enabled = Column(Boolean, default=True, nullable=False)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Joint account support
    is_joint = Column(Boolean, default=False, nullable=False)
    joint_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    user = relationship("User", back_populates="accounts", foreign_keys="Account.user_id")
    joint_user = relationship("User", foreign_keys="Account.joint_user_id")
    transactions = relationship("Transaction", back_populates="account")
    balance_snapshots = relationship("BalanceSnapshot", back_populates="account", cascade="all, delete-orphan")
    recurring_rules = relationship("RecurringRule", back_populates="account")
