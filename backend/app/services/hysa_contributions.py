"""
HYSA contribution measurement — derive the HYSA monthly contribution from REAL
EverBank deposit transactions instead of a flat manual assumption.

Background
----------
Keaton and Katherine each record their EverBank HYSA deposits in their own Google
Sheets. The sheets sync tags those rows as the "Savings Transfer" (savings-kind)
category when the description matches an HYSA keyword (`hysa`, `everbank`, ...).
Those are the actual contributions into the shared joint HYSA.

The forecast used to apply `FinancialProfile.hysa_monthly_contribution` (a number you
type, e.g. $1,600) EVERY month regardless of whether a deposit happened. This module
replaces that assumption with the measured truth:

  - A contribution counts for a month ONLY if an EverBank transaction appears in that
    month (across all contributing users — Keaton + Katherine — summed ONCE).
  - Current month: the actual sum so far this month (may be $0 if no deposit yet).
  - Future months: the trailing average over the last N COMPLETED months.

The manual `hysa_monthly_contribution` becomes a labeled FALLBACK, used only when there
are zero EverBank transactions to measure.

Double-counting note: these same transactions also reduce cash (the expense side of the
transfer) via the forecast's historical category averages. That is correct double-entry
(cash down, HYSA up), not double-counting. Summing both partners' deposits ONCE here is
what replaces the old ad-hoc "route the non-owner's savings avg to the joint HYSA" path
so Katherine's deposits are never counted twice.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.transaction import Transaction

# Shared with google_sheets_sync — descriptions that mark an HYSA/EverBank deposit.
HYSA_KEYWORDS = {"hysa", "everbank", "ever bank", "high yield"}

# How many completed months to average for the forward-looking figure.
DEFAULT_LOOKBACK_MONTHS = 6


def is_hysa_transfer(description: Optional[str]) -> bool:
    """True if a transaction description looks like an EverBank/HYSA deposit."""
    if not description:
        return False
    desc_lower = description.strip().lower()
    return any(kw in desc_lower for kw in HYSA_KEYWORDS)


def _month_key(d: date) -> str:
    return d.strftime("%Y-%m")


def _completed_month_keys(today: date, lookback: int) -> list[str]:
    """The YYYY-MM keys for the last `lookback` COMPLETED months (excludes current)."""
    first_of_this_month = today.replace(day=1)
    return [
        _month_key(first_of_this_month - relativedelta(months=i))
        for i in range(1, lookback + 1)
    ]


def measured_hysa_contributions(
    db: Session,
    contributing_user_ids: list[int],
    today: Optional[date] = None,
    lookback_months: int = DEFAULT_LOOKBACK_MONTHS,
) -> dict:
    """
    Measure HYSA contributions from real EverBank "Savings Transfer" transactions.

    Sums abs(amount) of HYSA-keyword transactions in savings-kind categories, per
    calendar month, across ALL `contributing_user_ids` (so Keaton + Katherine are
    summed exactly once into the shared joint HYSA).

    Returns a dict that is always safe to use:
      {
        "by_month":        {YYYY-MM: amount, ...}   # only months with deposits
        "avg_monthly":     float,                   # avg over completed lookback months
        "current_month":   float,                   # sum so far this month ($0 if none yet)
        "current_month_key": "YYYY-MM",
        "n_completed_months_with_deposits": int,
        "lookback_months": int,
        "n_transactions": int,
        "has_data": bool,                           # any matching txns at all
      }
    """
    today = today or date.today()

    # Savings-kind category ids across the contributing users.
    savings_cat_ids = {
        c.id
        for c in db.query(Category)
        .filter(
            Category.user_id.in_(contributing_user_ids),
            Category.kind == "savings",
        )
        .all()
    }

    txns: list[Transaction] = []
    if savings_cat_ids:
        txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id.in_(contributing_user_ids),
                Transaction.category_id.in_(savings_cat_ids),
                Transaction.scenario_id.is_(None),
            )
            .all()
        )

    by_month: dict[str, float] = {}
    n_txns = 0
    for t in txns:
        if not is_hysa_transfer(t.description):
            continue
        n_txns += 1
        key = _month_key(t.date)
        by_month[key] = by_month.get(key, 0.0) + abs(t.amount)

    by_month = {k: round(v, 2) for k, v in by_month.items()}

    # Forward-looking average: mean of the completed lookback months. Months in the
    # window with no deposit count as $0 so a skipped month correctly drags the
    # average down (we average over the full window, not only deposit months).
    completed_keys = _completed_month_keys(today, lookback_months)
    completed_vals = [by_month.get(k, 0.0) for k in completed_keys]
    n_with_deposits = sum(1 for v in completed_vals if v > 0)
    avg_monthly = round(sum(completed_vals) / len(completed_vals), 2) if completed_vals else 0.0

    current_key = _month_key(today)
    current_month = by_month.get(current_key, 0.0)

    return {
        "by_month": by_month,
        "avg_monthly": avg_monthly,
        "current_month": current_month,
        "current_month_key": current_key,
        "n_completed_months_with_deposits": n_with_deposits,
        "lookback_months": lookback_months,
        "n_transactions": n_txns,
        "has_data": n_txns > 0,
    }


def hysa_contribution_for_account(
    db: Session,
    contributing_user_ids: list[int],
    manual_fallback: Optional[float],
    today: Optional[date] = None,
    lookback_months: int = DEFAULT_LOOKBACK_MONTHS,
) -> dict:
    """
    Resolve the HYSA contribution figure + a clear source label for one account.

    Truth hierarchy: measured real deposits win; the manual profile value is a labeled
    fallback used ONLY when there are no EverBank transactions to measure.

    Returns:
      {
        "avg_monthly":    float,   # forward-looking monthly contribution to use
        "current_month":  float,   # actual so far this month ($0 if none yet)
        "source":         "measured" | "manual_fallback" | "none",
        "label":          str,     # human label, e.g. "measured avg (6 mo)"
        "basis":          str,     # one-line explanation for tooltips
        "measured":       dict,    # the full measured_hysa_contributions() payload
      }
    """
    measured = measured_hysa_contributions(
        db, contributing_user_ids, today=today, lookback_months=lookback_months
    )

    if measured["has_data"]:
        n = measured["n_completed_months_with_deposits"]
        lb = measured["lookback_months"]
        return {
            "avg_monthly": measured["avg_monthly"],
            "current_month": measured["current_month"],
            "source": "measured",
            "label": f"measured avg ({lb} mo)",
            "basis": (
                f"averaged real EverBank deposits over the last {lb} completed months "
                f"({n} of them had a deposit); current month counts only deposits "
                f"already recorded"
            ),
            "measured": measured,
        }

    if manual_fallback and manual_fallback > 0:
        return {
            "avg_monthly": round(float(manual_fallback), 2),
            # No measured deposits => current month has none either.
            "current_month": 0.0,
            "source": "manual_fallback",
            "label": "manual estimate",
            "basis": (
                "no EverBank deposits found to measure — using the manual HYSA "
                "contribution from the financial profile as a fallback estimate"
            ),
            "measured": measured,
        }

    return {
        "avg_monthly": 0.0,
        "current_month": 0.0,
        "source": "none",
        "label": "none",
        "basis": "no EverBank deposits and no manual contribution set",
        "measured": measured,
    }
