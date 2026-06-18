"""Savings-goal dashboard endpoint — per-person + joint progress toward a monthly goal."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.savings_goal import compute_savings_goals

router = APIRouter(prefix="/savings-goal", tags=["savings-goal"])


@router.get("")
def get_savings_goals(
    joint: bool = Query(default=False, description="Detail every household user, not just the current one"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Current-month savings vs goal for each person and the joint household."""
    return compute_savings_goals(db, current_user, joint=joint)
