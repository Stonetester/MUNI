"""
Measured investment returns per account.

The number people actually want for "what was my average return?" is the
*growth* of an account, not the change in balance — because part of a balance
increase is just money you deposited. So we net contributions out of the
balance change before annualizing.

Source data:
  - balance_snapshots: one row per uploaded statement (date, balance).
  - InvestmentHolding.monthly_contribution / FinancialProfile: to estimate
    contributions over the window when the statements don't tell us directly.

Method (money-weighted approximation, good enough for a personal dashboard):
  gain          = end_balance - start_balance - net_contributions
  simple_return = gain / (start_balance + 0.5 * net_contributions)   # avg capital at work
  annualized    = (1 + simple_return) ** (365 / days) - 1

We need >= 2 snapshots spanning a real time gap. With < 2 we return None and a
basis string the chat/UI can show ("not enough statements yet").
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.balance_snapshot import BalanceSnapshot
from app.models.investment_holding import InvestmentHolding


# Account types whose growth is a "return" worth reporting.
RETURN_TYPES = {"401k", "ira", "hsa", "brokerage", "hysa"}


def _estimated_monthly_contribution(account_id: int, db: Session) -> float:
    """Best estimate of monthly contributions into this account, from its holdings."""
    holdings = (
        db.query(InvestmentHolding)
        .filter(InvestmentHolding.account_id == account_id)
        .all()
    )
    return sum(h.monthly_contribution or 0.0 for h in holdings)


def account_return(account_id: int, db: Session) -> dict:
    """Measured annualized return for one account from its balance snapshots.

    Returns a dict that is always safe to display:
      {
        "account_id", "annualized_pct" (float|None), "simple_pct" (float|None),
        "period_start", "period_end", "n_snapshots", "start_balance",
        "end_balance", "est_contributions", "gain", "basis"
      }
    """
    snaps = (
        db.query(BalanceSnapshot)
        .filter(BalanceSnapshot.account_id == account_id)
        .order_by(BalanceSnapshot.date.asc())
        .all()
    )

    base = {
        "account_id": account_id,
        "annualized_pct": None,
        "simple_pct": None,
        "period_start": None,
        "period_end": None,
        "n_snapshots": len(snaps),
        "start_balance": None,
        "end_balance": None,
        "est_contributions": None,
        "gain": None,
    }

    if len(snaps) < 2:
        base["basis"] = "not enough statements yet (need at least 2 to measure a return)"
        return base

    first, last = snaps[0], snaps[-1]
    days = (last.date - first.date).days
    if days <= 0 or first.balance <= 0:
        base["basis"] = "snapshots don't span a usable time period"
        base["period_start"] = first.date.isoformat()
        base["period_end"] = last.date.isoformat()
        return base

    months = days / 30.44

    # Prefer REAL per-statement contributions (parsed from the statements). Sum the
    # contributions recorded on every snapshot AFTER the first (the first snapshot's
    # own contribution happened before our measurement window starts).
    recorded = [s.contributions for s in snaps[1:] if s.contributions is not None]
    have_real = len(recorded) > 0 and len(recorded) >= (len(snaps) - 1) * 0.5  # majority covered
    if have_real:
        net_contributions = sum(recorded)
        contrib_basis = f"netted ${net_contributions:,.0f} of real statement contributions"
        low_confidence = False
    else:
        monthly_contrib = _estimated_monthly_contribution(account_id, db)
        net_contributions = monthly_contrib * months
        if monthly_contrib > 0:
            contrib_basis = f"netted ~${net_contributions:,.0f} est. contributions (${monthly_contrib:,.0f}/mo)"
            low_confidence = True
        else:
            contrib_basis = "GROSS — no contribution data, so this OVERSTATES return if you deposited money"
            low_confidence = True

    gain = last.balance - first.balance - net_contributions
    avg_capital = first.balance + 0.5 * net_contributions
    simple = gain / avg_capital if avg_capital > 0 else None

    annualized = None
    if simple is not None and (1 + simple) > 0:
        annualized = (1 + simple) ** (365.0 / days) - 1

    # Guard against publishing a garbage number. If we had to ESTIMATE contributions
    # and the result is implausibly large (>50%/yr), the growth is almost entirely
    # un-tracked deposits (classic for a HYSA you're funding). Report it as
    # unmeasurable instead of "2700%/yr".
    if annualized is not None and low_confidence and annualized > 0.50:
        base["period_start"] = first.date.isoformat()
        base["period_end"] = last.date.isoformat()
        base["start_balance"] = round(first.balance, 2)
        base["end_balance"] = round(last.balance, 2)
        base["basis"] = (
            "can't measure a real return — this account grew mostly from deposits we can't "
            "see in the statements (set the monthly contribution on its holdings, or it's a "
            "savings account whose 'return' is just its APY)"
        )
        return base

    basis = (
        f"{len(snaps)} statements {first.date.isoformat()}→{last.date.isoformat()}; {contrib_basis}"
        + ("  [LOW CONFIDENCE — contributions estimated, treat as rough]" if low_confidence else "")
    )
    base["low_confidence"] = low_confidence

    base.update({
        "annualized_pct": round(annualized * 100, 1) if annualized is not None else None,
        "simple_pct": round(simple * 100, 1) if simple is not None else None,
        "period_start": first.date.isoformat(),
        "period_end": last.date.isoformat(),
        "start_balance": round(first.balance, 2),
        "end_balance": round(last.balance, 2),
        "est_contributions": round(net_contributions, 2),
        "gain": round(gain, 2),
        "basis": basis,
    })
    return base


def all_account_returns(user_ids: list[int], db: Session) -> list[dict]:
    """Measured return for every investment-type account owned by these users.

    Each item additionally carries 'account_name', 'account_type', 'owner_id'
    so callers (chat prompt, API) can label by account and owner.
    """
    accounts = (
        db.query(Account)
        .filter(Account.user_id.in_(user_ids))
        .all()
    )
    out = []
    for acc in accounts:
        if acc.account_type not in RETURN_TYPES:
            continue
        r = account_return(acc.id, db)
        r["account_name"] = acc.name
        r["account_type"] = acc.account_type
        r["owner_id"] = acc.user_id
        out.append(r)
    return out
