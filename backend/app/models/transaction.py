from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Date, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True, index=True)

    date = Column(Date, nullable=False, index=True)
    amount = Column(Float, nullable=False)  # negative=expense, positive=income
    description = Column(String, nullable=False, default="")
    merchant = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    payment_method = Column(String, nullable=True)  # debit_card/credit_card/transfer/other
    is_verified = Column(Boolean, default=False, nullable=False)
    import_source = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="transactions")
    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    scenario = relationship("Scenario", back_populates="transactions")
