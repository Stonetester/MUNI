from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Date, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class RecurringRule(Base):
    __tablename__ = "recurring_rules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True)

    name = Column(String, nullable=False)
    amount = Column(Float, nullable=False)  # negative=expense, positive=income
    frequency = Column(String, nullable=False, default="monthly")
    # weekly/biweekly/monthly/bimonthly/quarterly/annual/one_time
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    next_date = Column(Date, nullable=True)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="recurring_rules")
    account = relationship("Account", back_populates="recurring_rules")
    category = relationship("Category", back_populates="recurring_rules")
    scenario = relationship("Scenario", back_populates="recurring_rules")
