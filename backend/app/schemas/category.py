from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel, model_validator


class CategoryBase(BaseModel):
    name: str
    parent_id: Optional[int] = None
    kind: str = "expense"  # income/expense/transfer/savings
    color: Optional[str] = "#6EE7B7"
    budget_amount: Optional[float] = None
    budget_period: Optional[str] = None  # monthly/annual


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    kind: Optional[str] = None
    color: Optional[str] = None
    budget_amount: Optional[float] = None
    budget_period: Optional[str] = None


class CategoryOut(CategoryBase):
    id: int
    user_id: int
    parent_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def extract_parent_name(cls, data: Any) -> Any:
        if hasattr(data, "parent") and data.parent is not None:
            data.__dict__["parent_name"] = data.parent.name
        return data
