from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class EventLineItem(Base):
    __tablename__ = "event_line_items"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("life_events.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String, nullable=False)
    category = Column(String, nullable=True)       # grouping label (e.g. "Catering")
    estimated_cost = Column(Float, default=0.0, nullable=False)
    actual_cost = Column(Float, nullable=True)     # None = not yet paid/known
    notes = Column(String, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)

    event = relationship("LifeEvent", back_populates="line_items")
