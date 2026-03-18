from collections import defaultdict
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.recurring_rule import RecurringRule
from app.models.transaction import Transaction
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


@router.get("/suggestions", tags=["recurring"])
def suggest_recurring_rules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Analyse the last 90 days of transactions to detect patterns that look recurring.
    Returns candidate rules grouped by description + approximate amount.
    Already-existing recurring rules with the same name are excluded.
    """
    cutoff = date.today() - timedelta(days=90)
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.date >= cutoff,
            Transaction.amount < 0,          # expenses only
            Transaction.scenario_id.is_(None),
        )
        .order_by(Transaction.date)
        .all()
    )

    # Group by normalised description + rounded amount bucket
    groups: dict = defaultdict(list)
    for t in txns:
        key = (t.description.strip().lower(), round(t.amount, 0))
        groups[key].append(t)

    # Existing rule names (to avoid re-suggesting)
    existing_names = {
        r.name.strip().lower()
        for r in db.query(RecurringRule).filter(RecurringRule.user_id == current_user.id).all()
    }

    suggestions = []
    for (desc, amt_bucket), group in groups.items():
        if len(group) < 2:
            continue
        if desc in existing_names:
            continue

        dates = sorted(t.date for t in group)
        # Estimate frequency from median gap
        gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        median_gap = sorted(gaps)[len(gaps) // 2]

        if median_gap <= 10:
            frequency = "weekly"
        elif median_gap <= 20:
            frequency = "biweekly"
        elif median_gap <= 35:
            frequency = "monthly"
        elif median_gap <= 65:
            frequency = "bimonthly"
        elif median_gap <= 100:
            frequency = "quarterly"
        else:
            frequency = "monthly"

        avg_amount = sum(t.amount for t in group) / len(group)
        representative = group[-1]

        suggestions.append({
            "description": representative.description,
            "amount": round(avg_amount, 2),
            "frequency": frequency,
            "occurrences": len(group),
            "last_date": str(representative.date),
            "category_id": representative.category_id,
            "account_id": representative.account_id,
            "median_gap_days": median_gap,
        })

    # Sort by occurrences descending
    suggestions.sort(key=lambda s: s["occurrences"], reverse=True)
    return suggestions[:20]
