from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.recurring_rule import RecurringRule
from app.models.user import User
from app.schemas.recurring_rule import RecurringRuleCreate, RecurringRuleOut, RecurringRuleUpdate

router = APIRouter(prefix="/recurring", tags=["recurring"])


def get_rule_or_404(rule_id: int, user: User, db: Session) -> RecurringRule:
    rule = (
        db.query(RecurringRule)
        .filter(RecurringRule.id == rule_id, RecurringRule.user_id == user.id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring rule not found")
    return rule


@router.get("", response_model=List[RecurringRuleOut])
def list_recurring_rules(
    scenario_id: Optional[int] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(RecurringRule).filter(RecurringRule.user_id == current_user.id)
    if scenario_id is not None:
        query = query.filter(RecurringRule.scenario_id == scenario_id)
    if is_active is not None:
        query = query.filter(RecurringRule.is_active == is_active)
    return query.order_by(RecurringRule.name).all()


@router.post("", response_model=RecurringRuleOut, status_code=status.HTTP_201_CREATED)
def create_recurring_rule(
    rule_in: RecurringRuleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = RecurringRule(**rule_in.model_dump(), user_id=current_user.id)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/{rule_id}", response_model=RecurringRuleOut)
def update_recurring_rule(
    rule_id: int,
    rule_in: RecurringRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = get_rule_or_404(rule_id, current_user, db)
    for field, value in rule_in.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = get_rule_or_404(rule_id, current_user, db)
    db.delete(rule)
    db.commit()
