"""
Savings-goal computation for the dashboard.

For each person (and the joint household) we surface, for the current month:
  - net cash saved this month  = income - spending  (the "savings" definition the
    dashboard already uses; savings/transfer categories are excluded from both sides,
    so money moved into savings stays counted as saved)
  - retirement/savings contributions = HYSA + IRA + 401k (employee + employer) per the
    financial profile — the deliberate, automatic side of saving
  - total saved this month = net cash saved + retirement contributions
  - a SUGGESTED monthly goal computed from history (so the app proposes a target first)
  - the user's own goal (FinancialProfile.monthly_savings_goal) when they've set one
  - whether they're on track this month

EverBank is a SHARED joint HYSA: each partner records ~half the contribution in their
own sheet, so per-person HYSA contributions already split it. The joint total is the
sum of both — no special-casing needed beyond not double-counting.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models.financial_profile import FinancialProfile
from app.models.transaction import Transaction
from app.models.user import User
from app.services.transaction_math import counts_as_expense, counts_as_income

# How many completed months to average when suggesting a goal.
SUGGEST_LOOKBACK_MONTHS = 6
# Suggest aiming slightly above the historical average so the goal stretches a little.
SUGGEST_STRETCH = 1.10


def _month_bounds(d: date) -> tuple[date, date]:
    start = d.replace(day=1)
    end = d.replace(day=monthrange(d.year, d.month)[1])
    return start, end


def _net_saved(db: Session, user_id: int, start: date, end: date) -> tuple[float, float, float]:
    """(income, spending, net_saved) for one user over [start, end]."""
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )
    income = sum(t.amount for t in txns if counts_as_income(t))
    spending = sum(abs(t.amount) for t in txns if counts_as_expense(t))
    return round(income, 2), round(spending, 2), round(income - spending, 2)


def _retirement_contributions(profile: Optional[FinancialProfile]) -> dict:
    """Monthly retirement/savings contributions from the financial profile."""
    if not profile:
        return {"hysa": 0.0, "ira": 0.0, "k401_employee": 0.0, "k401_employer": 0.0, "total": 0.0}

    hysa = profile.hysa_monthly_contribution or 0.0
    ira = profile.ira_monthly_contribution or 0.0

    # 401k: employee deferral is per-paycheck; convert to monthly.
    per_paycheck = profile.employee_401k_per_paycheck or 0.0
    periods_per_month = {
        "weekly": 52 / 12,
        "bi_weekly": 26 / 12,
        "biweekly": 26 / 12,
        "semi_monthly": 2.0,
        "monthly": 1.0,
    }.get(profile.pay_frequency or "semi_monthly", 2.0)
    k401_employee = round(per_paycheck * periods_per_month, 2)

    # Employer match: percent of gross salary, monthly.
    employer_pct = profile.employer_401k_percent or 0.0
    gross = profile.gross_annual_salary or 0.0
    k401_employer = round((employer_pct / 100.0) * gross / 12.0, 2)

    total = round(hysa + ira + k401_employee + k401_employer, 2)
    return {
        "hysa": round(hysa, 2),
        "ira": round(ira, 2),
        "k401_employee": k401_employee,
        "k401_employer": k401_employer,
        "total": total,
    }


def _suggested_goal(db: Session, user_id: int, today: date, contributions_total: float) -> float:
    """
    Suggest a monthly TOTAL-savings goal from the last N COMPLETED months.

    Basis = average total saved (net cash saved + retirement contributions) over the
    trailing completed months, nudged up by a small stretch factor. We only look at
    completed months so a partial current month doesn't drag the suggestion down.
    """
    totals: list[float] = []
    for i in range(1, SUGGEST_LOOKBACK_MONTHS + 1):
        m = today.replace(day=1) - relativedelta(months=i)
        start, end = _month_bounds(m)
        _, _, net = _net_saved(db, user_id, start, end)
        totals.append(net + contributions_total)

    positive = [t for t in totals if t > 0]
    if positive:
        avg = sum(positive) / len(positive)
    elif totals:
        avg = sum(totals) / len(totals)
    else:
        avg = contributions_total

    # Never suggest less than the automatic contributions already happening.
    suggestion = max(avg * SUGGEST_STRETCH, contributions_total)
    # Round to the nearest $25 for a clean target.
    return round(suggestion / 25.0) * 25.0


def _person_block(db: Session, user: User, today: date) -> dict:
    start, end = today.replace(day=1), today
    income, spending, net_saved = _net_saved(db, user.id, start, end)

    profile = (
        db.query(FinancialProfile)
        .filter(FinancialProfile.user_id == user.id)
        .first()
    )
    contributions = _retirement_contributions(profile)
    total_saved = round(net_saved + contributions["total"], 2)

    suggested = _suggested_goal(db, user.id, today, contributions["total"])
    user_goal = profile.monthly_savings_goal if profile else None
    goal = user_goal if user_goal is not None else suggested

    pct = round((total_saved / goal) * 100, 1) if goal > 0 else 0.0
    on_track = total_saved >= goal if goal > 0 else False

    return {
        "user_id": user.id,
        "name": (user.display_name or user.username or "").strip() or user.username,
        "income": income,
        "spending": spending,
        "net_saved": net_saved,
        "contributions": contributions,
        "total_saved": total_saved,
        "suggested_goal": suggested,
        "user_goal": round(user_goal, 2) if user_goal is not None else None,
        "goal": round(goal, 2),
        "using_suggestion": user_goal is None,
        "pct_of_goal": pct,
        "on_track": on_track,
        "remaining": round(max(0.0, goal - total_saved), 2),
    }


def compute_savings_goals(db: Session, current_user: User, joint: bool = False) -> dict:
    """
    Returns the per-person blocks plus a joint roll-up.

    - joint=False: only the current user's block is detailed, but the joint roll-up is
      still included so the dashboard can show the household target either way.
    - joint=True: every household user gets a block.
    """
    today = date.today()
    users = db.query(User).order_by(User.id).all()

    people = [_person_block(db, u, today) for u in users]

    # Joint roll-up: sum the parts. goal = sum of each person's effective goal (so a
    # household target is the sum of what each partner is aiming for).
    joint_total_saved = round(sum(p["total_saved"] for p in people), 2)
    joint_net_saved = round(sum(p["net_saved"] for p in people), 2)
    joint_contrib = round(sum(p["contributions"]["total"] for p in people), 2)
    joint_goal = round(sum(p["goal"] for p in people), 2)
    joint_suggested = round(sum(p["suggested_goal"] for p in people), 2)
    joint_pct = round((joint_total_saved / joint_goal) * 100, 1) if joint_goal > 0 else 0.0

    joint_block = {
        "name": "Joint",
        "net_saved": joint_net_saved,
        "contributions_total": joint_contrib,
        "total_saved": joint_total_saved,
        "suggested_goal": joint_suggested,
        "goal": joint_goal,
        "pct_of_goal": joint_pct,
        "on_track": joint_total_saved >= joint_goal if joint_goal > 0 else False,
        "remaining": round(max(0.0, joint_goal - joint_total_saved), 2),
    }

    return {
        "month": today.strftime("%Y-%m"),
        "people": people,
        "joint": joint_block,
        "current_user_id": current_user.id,
    }
