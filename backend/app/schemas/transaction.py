from datetime import date, datetime
from typing import Optional, List

from pydantic import BaseModel


class TransactionBase(BaseModel):
    date: date
    amount: float
    description: str = ""
    merchant: Optional[str] = None
    notes: Optional[str] = None
    payment_method: Optional[str] = None
    is_verified: bool = False
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    scenario_id: Optional[int] = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    amount: Optional[float] = None
    description: Optional[str] = None
    merchant: Optional[str] = None
    notes: Optional[str] = None
    payment_method: Optional[str] = None
    is_verified: Optional[bool] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    scenario_id: Optional[int] = None


class TransactionOut(TransactionBase):
    id: int
    user_id: int
    import_source: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionPage(BaseModel):
    items: List[TransactionOut]
    total: int
    skip: int
    limit: int


class ImportResult(BaseModel):
    imported: int
    duplicates: int
    errors: List[str]
