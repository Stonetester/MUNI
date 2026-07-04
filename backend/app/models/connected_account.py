"""Connected bank/card feed (SimpleFIN Bridge).

IMPORTANT ARCHITECTURE RULE: connected-account data is used ONLY for the
end-of-day spend digest and the "today's card activity" view. It is NEVER
written into the `transactions` table — Google Sheets (hand-entered by
Keaton and Katherine) remain the single source of truth for transactions.
Hand-entering is intentional friction: seeing each purchase is the point.
"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class SimplefinConnection(Base):
    """The single SimpleFIN Bridge connection for the household (one row)."""

    __tablename__ = "simplefin_connections"

    id = Column(Integer, primary_key=True, index=True)
    # Access URL returned by claiming a setup token — embeds basic-auth creds.
    access_url = Column(String, nullable=False)
    claimed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_synced_at = Column(DateTime, nullable=True)
    last_error = Column(String, nullable=True)
    # End-of-day Slack digest on/off (schedule lives in config).
    digest_enabled = Column(Boolean, default=True, nullable=False)
    # When the last digest went out — the next digest covers activity since then.
    last_digest_at = Column(DateTime, nullable=True)

    accounts = relationship(
        "ConnectedAccount", back_populates="connection", cascade="all, delete-orphan"
    )


class ConnectedAccount(Base):
    """One card/checking account visible through the SimpleFIN connection."""

    __tablename__ = "connected_accounts"

    id = Column(Integer, primary_key=True, index=True)
    connection_id = Column(
        Integer, ForeignKey("simplefin_connections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    simplefin_id = Column(String, nullable=False, unique=True, index=True)
    org_name = Column(String, nullable=True)
    name = Column(String, nullable=False)
    nickname = Column(String, nullable=True)
    # Owner for digest grouping: a user id, or NULL = joint/household.
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    balance = Column(String, nullable=True)  # SimpleFIN sends amounts as strings
    balance_date = Column(DateTime, nullable=True)
    currency = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    connection = relationship("SimplefinConnection", back_populates="accounts")
    user = relationship("User")
