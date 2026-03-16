from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class BalanceSnapshotBase(BaseModel):
    account_id: int
    date: date
    balance: float
    notes: Optional[str] = None


class BalanceSnapshotCreate(BalanceSnapshotBase):
    pass


class BalanceSnapshotOut(BalanceSnapshotBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}
