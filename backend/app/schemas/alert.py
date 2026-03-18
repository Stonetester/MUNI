from datetime import date
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


class AlertItem(BaseModel):
    type: Literal["budget", "event"]
    severity: Literal["critical", "warning", "info"]
    title: str
    message: str
    amount: Optional[float] = None
    due_date: Optional[date] = None
    meta: Dict[str, Any] = Field(default_factory=dict)
