from datetime import datetime, date as date_type
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class CompensationEvent(Base):
    __tablename__ = "compensation_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    event_type = Column(String, nullable=False)   # raise | bonus | spot_award | stipend | other
    effective_date = Column(Date, nullable=False)

    # Raise fields
    old_salary = Column(Float, nullable=True)
    new_salary = Column(Float, nullable=True)

    # Bonus / award / stipend fields
    gross_amount = Column(Float, nullable=True)
    net_amount = Column(Float, nullable=True)

    description = Column(String, nullable=True)   # "Q4 performance bonus", "spot award — Project X"
    notes = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
