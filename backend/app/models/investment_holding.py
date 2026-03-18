from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class InvestmentHolding(Base):
    """A single fund/stock holding inside an account (401k, IRA, brokerage)."""
    __tablename__ = "investment_holdings"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)

    ticker = Column(String, nullable=False)                # e.g. SWPPX, SWISX, FXAIX
    fund_name = Column(String, nullable=True)              # e.g. "Schwab S&P 500 Index"
    current_value = Column(Float, nullable=False, default=0.0)
    monthly_contribution = Column(Float, default=0.0)
    assumed_annual_return = Column(Float, nullable=True)   # e.g. 10.4 for 10.4%
    weight_percent = Column(Float, nullable=True)          # % of account in this fund

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    account = relationship("Account")
