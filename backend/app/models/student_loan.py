from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class StudentLoan(Base):
    __tablename__ = "student_loans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    loan_name = Column(String, nullable=False)
    servicer = Column(String, nullable=True)
    original_balance = Column(Float, nullable=True)
    current_balance = Column(Float, nullable=False)
    interest_rate = Column(Float, nullable=False)     # e.g. 4.8 = 4.8%
    minimum_payment = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
