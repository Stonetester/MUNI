from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from app.database import get_db
from app.models.home_buying import HomeBuyingGoal
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/home-buying", tags=["home_buying"])


class HomeBuyingGoalSchema(BaseModel):
    id: Optional[int] = None
    name: str = "Default"
    is_active: bool = False
    target_price_min: float = 380000
    target_price_max: float = 500000
    target_date: str = "2028-01-01"
    down_payment_target: float = 75000
    current_savings: float = 0
    monthly_savings_contribution: float = 1600
    mortgage_structure: str = "keaton_only"
    keaton_income: float = 130935
    katherine_income: float = 77000
    notes: Optional[str] = None

    class Config:
        from_attributes = True


def _measured_defaults(db: Session) -> dict:
    """Seed a brand-new default profile from MEASURED data instead of the hardcoded
    schema constants (which froze March-2026 salaries): paystub-derived incomes, the
    real HYSA balance as current savings, and the measured HYSA deposit pace as the
    monthly contribution. Anything unmeasurable falls back to the model default."""
    from app.models.account import Account
    from app.models.paystub import Paystub
    from app.models.user import User as UserModel
    from app.services.forecasting import _infer_pay_schedule
    import statistics

    out: dict = {}
    try:
        users = db.query(UserModel).order_by(UserModel.id).all()
        ppy = {"weekly": 52, "biweekly": 26, "bi_weekly": 26, "semi_monthly": 24, "monthly": 12}
        for u in users:
            uname = (u.username or "").lower()
            field = "keaton_income" if "keaton" in uname else "katherine_income" if "katherine" in uname else None
            if not field:
                continue
            stubs = (
                db.query(Paystub)
                .filter(Paystub.user_id == u.id, Paystub.pay_type != "bonus", Paystub.gross_pay.isnot(None))
                .order_by(Paystub.pay_date.desc())
                .limit(6)
                .all()
            )
            sched = _infer_pay_schedule(u.id, db)
            if stubs and sched:
                gross = statistics.median([s.gross_pay for s in stubs])
                out[field] = round(gross * ppy.get(sched["frequency"], 24), 2)

        hysa = db.query(Account).filter(Account.account_type == "hysa").first()
        if hysa and (hysa.balance or 0) > 0:
            out["current_savings"] = round(hysa.balance, 2)

        from app.services.hysa_contributions import measured_hysa_contributions
        measured = measured_hysa_contributions(db, [u.id for u in users])
        if measured["has_data"] and measured["recent_avg_monthly"] > 0:
            out["monthly_savings_contribution"] = measured["recent_avg_monthly"]
    except Exception:
        # Seeding is best-effort — a brand-new empty DB must still get a default profile.
        pass
    return out


def _get_or_create_default(db: Session) -> HomeBuyingGoal:
    """Return the active profile, or create a default one if none exist."""
    # Prefer active profile
    goal = db.query(HomeBuyingGoal).filter(HomeBuyingGoal.is_active == True).first()
    if goal:
        return goal
    # Fall back to any existing profile
    goal = db.query(HomeBuyingGoal).first()
    if goal:
        goal.is_active = True
        db.commit()
        db.refresh(goal)
        return goal
    # Create initial default, seeded from measured data where available
    goal = HomeBuyingGoal(name="Default", is_active=True, **_measured_defaults(db))
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


# ── List all profiles ─────────────────────────────────────────────────────────

@router.get("/goals", response_model=List[HomeBuyingGoalSchema])
def list_goals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_or_create_default(db)  # ensure at least one exists
    return db.query(HomeBuyingGoal).order_by(HomeBuyingGoal.id).all()


# ── Get the active profile (legacy compat) ────────────────────────────────────

@router.get("/goal", response_model=HomeBuyingGoalSchema)
def get_goal(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_or_create_default(db)


# ── Create a new profile ──────────────────────────────────────────────────────

@router.post("/goals", response_model=HomeBuyingGoalSchema)
def create_goal(
    data: HomeBuyingGoalSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = HomeBuyingGoal(**{k: v for k, v in data.model_dump(exclude={"id"}).items()})
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


# ── Update a profile by id ────────────────────────────────────────────────────

@router.put("/goals/{goal_id}", response_model=HomeBuyingGoalSchema)
def update_goal(
    goal_id: int,
    data: HomeBuyingGoalSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = db.query(HomeBuyingGoal).filter(HomeBuyingGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    # exclude_unset: fields the caller didn't send must keep their stored values —
    # dumping schema defaults here silently reset them to hardcoded constants.
    for k, v in data.model_dump(exclude={"id"}, exclude_unset=True).items():
        setattr(goal, k, v)
    db.commit()
    db.refresh(goal)
    return goal


# ── Legacy PUT /goal — updates whichever profile is active ───────────────────

@router.put("/goal", response_model=HomeBuyingGoalSchema)
def update_active_goal(
    data: HomeBuyingGoalSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = _get_or_create_default(db)
    for k, v in data.model_dump(exclude={"id"}, exclude_unset=True).items():
        setattr(goal, k, v)
    db.commit()
    db.refresh(goal)
    return goal


# ── Set a profile as active ───────────────────────────────────────────────────

@router.post("/goals/{goal_id}/activate", response_model=HomeBuyingGoalSchema)
def activate_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = db.query(HomeBuyingGoal).filter(HomeBuyingGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    # Deactivate all others
    db.query(HomeBuyingGoal).update({"is_active": False})
    goal.is_active = True
    db.commit()
    db.refresh(goal)
    return goal


# ── Delete a profile ──────────────────────────────────────────────────────────

@router.delete("/goals/{goal_id}")
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = db.query(HomeBuyingGoal).filter(HomeBuyingGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    all_goals = db.query(HomeBuyingGoal).count()
    if all_goals <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last profile")
    was_active = goal.is_active
    db.delete(goal)
    db.flush()
    # Re-activate another profile if we deleted the active one
    if was_active:
        next_goal = db.query(HomeBuyingGoal).first()
        if next_goal:
            next_goal.is_active = True
    db.commit()
    return {"ok": True}
