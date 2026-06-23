"""
Savings-goal computation for the dashboard.

The MAIN savings goal is measured against NET CASH SAVINGS only:
    net cash saved = income - spending   (savings/transfer categories excluded from both
    sides, so moving cash into savings is not counted as spending)
This is the number the user actively controls and holds themselves to.

Retirement/savings-account contributions (401k + IRA + HYSA) are tracked SEPARATELY as an
informational section — they are the steady, expected, automatic side of saving, NOT part
of the goal. We surface them for awareness plus a short month-by-month history so the user
can see whether their contribution pace is holding up over time.

For each person (and the joint household) we surface, for the current month:
  - income, spending, net_saved (= income - spending)  ← the GOAL is measured vs net_saved
  - contributions = HYSA + IRA + 401k (employee + employer)  ← informational, separate
  - total_saved = net_saved + contributions  ← kept for display, NOT the goal denominator
  - contributions_history = last N completed months of contributions (pace check)
  - a SUGGESTED monthly goal computed from the trailing NET-CASH history
  - the user's own goal (FinancialProfile.monthly_savings_goal) when they've set one
  - whether net_saved is on track vs the goal this month

EverBank is a SHARED JOINT HYSA. Its monthly contribution is MEASURED once from both
partners' real deposits (services.hysa_contributions) and split evenly per contributing
person, so the joint total equals the measured combined value with no double-counting.
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
from app.services.hysa_contributions import measured_hysa_contributions
from app.services.transaction_math import counts_as_expense, counts_as_income

# How many completed months to average when suggesting a goal.
SUGGEST_LOOKBACK_MONTHS = 6
# Suggest aiming slightly above the historical average so the goal stretches a little.
SUGGEST_STRETCH = 1.10
# How many completed months of contribution history to surface for the pace check.
CONTRIB_HISTORY_MONTHS = 6


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


def _k401_monthly(profile: Optional[FinancialProfile]) -> tuple[float, float]:
    """(employee, employer) monthly 401k contribution from the profile."""
    if not profile:
        return 0.0, 0.0
    per_paycheck = profile.employee_401k_per_paycheck or 0.0
    periods_per_month = {
        "weekly": 52 / 12,
        "bi_weekly": 26 / 12,
        "biweekly": 26 / 12,
        "semi_monthly": 2.0,
        "monthly": 1.0,
    }.get(profile.pay_frequency or "semi_monthly", 2.0)
    k401_employee = round(per_paycheck * periods_per_month, 2)
    employer_pct = profile.employer_401k_percent or 0.0
    gross = profile.gross_annual_salary or 0.0
    k401_employer = round((employer_pct / 100.0) * gross / 12.0, 2)
    return k401_employee, k401_employer


def _retirement_contributions(
    profile: Optional[FinancialProfile],
    hysa_per_person: float,
    hysa_source: str,
    hysa_is_joint: bool,
) -> dict:
    """Monthly retirement/savings contributions.

    HYSA is passed in already measured + split per person (joint, no double-count);
    IRA + 401k come from the profile. `hysa_source`/`hysa_is_joint` label the HYSA value
    so the UI can show "measured (joint)" vs "manual estimate".
    """
    ira = (profile.ira_monthly_contribution or 0.0) if profile else 0.0
    k401_employee, k401_employer = _k401_monthly(profile)

    hysa = round(hysa_per_person, 2)
    total = round(hysa + ira + k401_employee + k401_employer, 2)
    return {
        "hysa": hysa,
        "hysa_source": hysa_source,          # "measured" | "manual_fallback" | "none"
        "hysa_is_joint": hysa_is_joint,      # True when the HYSA is a shared joint account
        "ira": round(ira, 2),
        "k401_employee": k401_employee,
        "k401_employer": k401_employer,
        "total": total,
    }


def _resolve_hysa(
    db: Session,
    profile: Optional[FinancialProfile],
    household_user_ids: list[int],
    n_people: int,
    today: date,
) -> tuple[float, str, bool, dict]:
    """Resolve the per-person HYSA monthly contribution.

    The HYSA is a shared joint account: we measure the COMBINED monthly contribution once
    from all household members' real EverBank deposits, then split it evenly per person so
    that per_person × n_people == the measured joint total (no double-count).

    Returns (per_person_amount, source, is_joint, measured_payload).
    Falls back to the profile's manual value (NOT split — it's a single person's estimate)
    when there are no real deposits to measure.
    """
    measured = measured_hysa_contributions(db, household_user_ids)
    if measured["has_data"]:
        per_person = measured["avg_monthly"] / max(1, n_people)
        return round(per_person, 2), "measured", True, measured

    manual = (profile.hysa_monthly_contribution or 0.0) if profile else 0.0
    if manual > 0:
        return round(manual, 2), "manual_fallback", False, measured
    return 0.0, "none", False, measured


def _contributions_history(
    db: Session,
    profile: Optional[FinancialProfile],
    household_user_ids: list[int],
    n_people: int,
    today: date,
    months: int = CONTRIB_HISTORY_MONTHS,
) -> list[dict]:
    """Last `months` COMPLETED months of total monthly contributions, for the pace check.

    HYSA per-month comes from the measured EverBank deposits (split per person); IRA + 401k
    are the steady profile estimate (same every month). Returned newest-last.
    """
    ira = (profile.ira_monthly_contribution or 0.0) if profile else 0.0
    k401_employee, k401_employer = _k401_monthly(profile)
    steady = round(ira + k401_employee + k401_employer, 2)

    measured = measured_hysa_contributions(db, household_user_ids, today=today)
    by_month = measured["by_month"]  # combined deposits per YYYY-MM

    out: list[dict] = []
    for i in range(months, 0, -1):
        m = today.replace(day=1) - relativedelta(months=i)
        key = m.strftime("%Y-%m")
        hysa = round(by_month.get(key, 0.0) / max(1, n_people), 2)
        out.append({
            "month": key,
            "hysa": hysa,
            "ira": round(ira, 2),
            "k401_employee": k401_employee,
            "k401_employer": k401_employer,
            "total": round(hysa + steady, 2),
        })
    return out


def _suggested_goal(db: Session, user_id: int, today: date) -> float:
    """
    Suggest a monthly NET-CASH savings goal from the last N COMPLETED months.

    Basis = average NET CASH saved (income - spending) over the trailing completed months,
    nudged up by a small stretch factor. Retirement/savings-account contributions are NOT
    included — the main goal is measured against net cash only. We look only at completed
    months so a partial current month doesn't drag the suggestion down.
    """
    nets: list[float] = []
    for i in range(1, SUGGEST_LOOKBACK_MONTHS + 1):
        m = today.replace(day=1) - relativedelta(months=i)
        start, end = _month_bounds(m)
        _, _, net = _net_saved(db, user_id, start, end)
        nets.append(net)

    positive = [t for t in nets if t > 0]
    if positive:
        avg = sum(positive) / len(positive)
    elif nets:
        avg = sum(nets) / len(nets)
    else:
        avg = 0.0

    suggestion = max(avg * SUGGEST_STRETCH, 0.0)
    # Round to the nearest $25 for a clean target.
    return round(suggestion / 25.0) * 25.0


def _sum_history(histories: list[list[dict]]) -> list[dict]:
    """Sum several per-person contribution histories month-by-month into a joint history."""
    if not histories:
        return []
    keys = [h["month"] for h in histories[0]]
    out: list[dict] = []
    for idx, key in enumerate(keys):
        row = {"month": key, "hysa": 0.0, "ira": 0.0, "k401_employee": 0.0, "k401_employer": 0.0, "total": 0.0}
        for h in histories:
            r = h[idx]
            for f in ("hysa", "ira", "k401_employee", "k401_employer", "total"):
                row[f] = round(row[f] + r[f], 2)
        out.append(row)
    return out


def _person_block(db: Session, user: User, today: date, household_user_ids: list[int]) -> dict:
    start, end = today.replace(day=1), today
    income, spending, net_saved = _net_saved(db, user.id, start, end)

    profile = (
        db.query(FinancialProfile)
        .filter(FinancialProfile.user_id == user.id)
        .first()
    )

    n_people = max(1, len(household_user_ids))
    hysa_per_person, hysa_source, hysa_is_joint, _ = _resolve_hysa(
        db, profile, household_user_ids, n_people, today
    )
    contributions = _retirement_contributions(profile, hysa_per_person, hysa_source, hysa_is_joint)
    contributions_history = _contributions_history(
        db, profile, household_user_ids, n_people, today
    )

    # total_saved kept for display only — the GOAL is measured against net_saved.
    total_saved = round(net_saved + contributions["total"], 2)

    suggested = _suggested_goal(db, user.id, today)
    user_goal = profile.monthly_savings_goal if profile else None
    goal = user_goal if user_goal is not None else suggested

    # Main goal is measured against NET CASH SAVED (income - spending) only.
    pct = round((net_saved / goal) * 100, 1) if goal > 0 else 0.0
    on_track = net_saved >= goal if goal > 0 else False

    return {
        "user_id": user.id,
        "name": (user.display_name or user.username or "").strip() or user.username,
        "income": income,
        "spending": spending,
        "net_saved": net_saved,
        "contributions": contributions,
        "contributions_history": contributions_history,
        "total_saved": total_saved,
        "suggested_goal": suggested,
        "user_goal": round(user_goal, 2) if user_goal is not None else None,
        "goal": round(goal, 2),
        "using_suggestion": user_goal is None,
        "pct_of_goal": pct,
        "on_track": on_track,
        "remaining": round(max(0.0, goal - net_saved), 2),
    }


def compute_savings_goals(db: Session, current_user: User, joint: bool = False) -> dict:
    """
    Returns the per-person blocks plus a joint roll-up.

    The main goal is measured against NET CASH (income - spending) for every person and
    the joint household — identically. Retirement/savings contributions are returned
    separately (current month + history) and are NOT part of the goal.

    - joint=False: only the current user's block is detailed, but the joint roll-up is
      still included so the dashboard can show the household target either way.
    - joint=True: every household user gets a block.
    """
    today = date.today()
    users = db.query(User).order_by(User.id).all()
    household_user_ids = [u.id for u in users]

    people = [_person_block(db, u, today, household_user_ids) for u in users]

    # Joint roll-up. Goal = sum of each person's effective goal; progress = sum of net cash.
    joint_net_saved = round(sum(p["net_saved"] for p in people), 2)
    joint_total_saved = round(sum(p["total_saved"] for p in people), 2)
    joint_contrib = round(sum(p["contributions"]["total"] for p in people), 2)
    joint_goal = round(sum(p["goal"] for p in people), 2)
    joint_suggested = round(sum(p["suggested_goal"] for p in people), 2)
    joint_pct = round((joint_net_saved / joint_goal) * 100, 1) if joint_goal > 0 else 0.0
    joint_history = _sum_history([p["contributions_history"] for p in people])

    joint_block = {
        "name": "Joint",
        "net_saved": joint_net_saved,
        "contributions_total": joint_contrib,
        "contributions_history": joint_history,
        "total_saved": joint_total_saved,
        "suggested_goal": joint_suggested,
        "goal": joint_goal,
        "pct_of_goal": joint_pct,
        "on_track": joint_net_saved >= joint_goal if joint_goal > 0 else False,
        "remaining": round(max(0.0, joint_goal - joint_net_saved), 2),
    }

    return {
        "month": today.strftime("%Y-%m"),
        "people": people,
        "joint": joint_block,
        "current_user_id": current_user.id,
    }
