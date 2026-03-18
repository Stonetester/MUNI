from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class FinancialProfile(Base):
    __tablename__ = "financial_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Salary
    gross_annual_salary = Column(Float, nullable=True)
    pay_frequency = Column(String, default="semi_monthly")  # semi_monthly | biweekly | monthly
    net_per_paycheck = Column(Float, nullable=True)

    # 401k
    employer_401k_percent = Column(Float, nullable=True)       # e.g. 6.0
    employee_401k_per_paycheck = Column(Float, nullable=True)

    # HYSA
    hysa_apy = Column(Float, nullable=True)
    hysa_monthly_contribution = Column(Float, nullable=True)

    # IRA
    ira_monthly_contribution = Column(Float, nullable=True)

    # Hidden sections — JSON array of section keys to hide in UI
    # e.g. '["student_loans", "ira"]'
    hidden_sections = Column(String, nullable=True, default="[]")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
