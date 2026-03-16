from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Date, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class LifeEvent(Base):
    __tablename__ = "life_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True)

    name = Column(String, nullable=False)
    event_type = Column(String, nullable=False, default="other")
    # wedding/marriage/move/new_job/baby/home_purchase/vacation/loan_payoff/other
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    total_cost = Column(Float, nullable=False, default=0.0)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    monthly_breakdown = Column(JSON, nullable=True)
    # list of {month: "YYYY-MM", amount: float}
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="life_events")
    scenario = relationship("Scenario", back_populates="life_events")
