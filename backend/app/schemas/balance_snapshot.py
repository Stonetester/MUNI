from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class BalanceSnapshotBase(BaseModel):
    account_id: int
    date: date
    balance: float
    # Money added during this statement's period (deposits + employer). Persisting this
    # is what keeps the snapshot inside the XIRR return window — without it the return
    # math can't tell deposits from gains.
    contributions: Optional[float] = None
    # Employer-paid portion of `contributions` (subset), when the statement itemizes it.
    employer_contributions: Optional[float] = None
    notes: Optional[str] = None


class BalanceSnapshotCreate(BalanceSnapshotBase):
    pass


class BalanceSnapshotOut(BalanceSnapshotBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}
