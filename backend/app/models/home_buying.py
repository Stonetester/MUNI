from sqlalchemy import Column, Integer, Float, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.database import Base


class HomeBuyingGoal(Base):
    __tablename__ = "home_buying_goals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, default="Default")          # e.g. "Conservative", "Stretch", "2027 Plan"
    is_active = Column(Boolean, default=False)        # which profile is currently selected/viewed
    target_price_min = Column(Float, default=380000)
    target_price_max = Column(Float, default=500000)
    target_date = Column(String, default="2028-01-01")
    down_payment_target = Column(Float, default=75000)
    current_savings = Column(Float, default=0)
    monthly_savings_contribution = Column(Float, default=1600)
    mortgage_structure = Column(String, default="keaton_only")  # keaton_only | both | katherine_only
    keaton_income = Column(Float, default=130935)
    katherine_income = Column(Float, default=77000)
    notes = Column(String, nullable=True)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
