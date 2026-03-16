from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AccountBase(BaseModel):
    name: str
    account_type: str = "checking"
    institution: Optional[str] = None
    balance: float = 0.0
    is_active: bool = True
    forecast_enabled: bool = True
    notes: Optional[str] = None


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[str] = None
    institution: Optional[str] = None
    balance: Optional[float] = None
    is_active: Optional[bool] = None
    forecast_enabled: Optional[bool] = None
    notes: Optional[str] = None


class AccountOut(AccountBase):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
