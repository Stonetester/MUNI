from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Scenario(Base):
    __tablename__ = "scenarios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_baseline = Column(Boolean, default=False, nullable=False)
    parent_id = Column(Integer, ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="scenarios")
    parent = relationship("Scenario", remote_side="Scenario.id", back_populates="children")
    children = relationship("Scenario", back_populates="parent")
    transactions = relationship("Transaction", back_populates="scenario")
    recurring_rules = relationship("RecurringRule", back_populates="scenario")
    life_events = relationship("LifeEvent", back_populates="scenario")
