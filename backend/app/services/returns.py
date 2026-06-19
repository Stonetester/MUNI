"""
Measured investment returns per account.

The number people actually want for "what was my average return?" is the
*growth* of an account, not the change in balance — because part of a balance
increase is just money you deposited. Brokerages report this as an annualized
**money-weighted return (XIRR)**: the single rate `r` for which the net present
value of every dated cash flow (contributions out, ending balance in) is zero.

We compute XIRR exactly — the same method John Hancock / Schwab / Fidelity print
on a statement — instead of the old crude midpoint approximation
(`gain / (start_balance + 0.5*contributions)`), which assumed every contribution
landed at the period midpoint and therefore overstated the rate (it reported
~26.8%/yr for John Hancock where the statement's printed IRR was 15.36%).

Source data:
  - balance_snapshots: one row per uploaded statement (date, balance, and the
    `contributions` made *during that statement's period*).
  - InvestmentHolding.monthly_contribution / FinancialProfile: only used as an
    estimate fallback when the statements don't carry real contributions.

Cash-flow construction (per account, snapshots ordered by date):
  - We measure over the **statement-backed window**: from the first snapshot
    through the last snapshot whose `contributions` is recorded. Trailing
    manual/synced rows with no contribution (NULL) are excluded from the window
    and labeled "balance synced, not in return window" — this keeps the number
    honest rather than guessing at the contributions for those gaps.
  - t0 (first.date):  outflow  -first.balance        (capital already in at start)
  - each later in-window snapshot with contributions:  outflow  -contributions
    dated at that snapshot's date (period contributions lumped on the statement
    date — acceptable; refine to mid-period later if needed).
  - final (last in-window date):  inflow  +last.balance
  - Solve XIRR: Newton-Raphson, fall back to bisection if it doesn't converge.

We need >= 2 snapshots spanning a real time gap. With < 2, or no real
contribution data (HYSA you're funding, brand-new IRA), we return None and a
basis string the chat/UI can show rather than fabricating a rate.
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


def _xirr(cashflows: list[tuple[date, float]]) -> Optional[float]:
    """Solve for the annualized money-weighted return (XIRR) of dated cash flows.

    `cashflows` is a list of (date, amount) where amount < 0 is money put in
    (contributions / starting capital) and amount > 0 is money/value taken out
    (the ending balance). Returns the annual rate `r` (e.g. 0.1536 == 15.36%),
    or None if it can't be solved sensibly.

    Time is measured in years via Actual/365. We solve NPV(r) = 0 with
    Newton-Raphson, falling back to bisection if Newton diverges or the
    derivative vanishes — no numpy/scipy dependency.
    """
    if len(cashflows) < 2:
        return None
    # Need at least one inflow and one outflow or the NPV never crosses zero.
    if not any(a < 0 for _, a in cashflows) or not any(a > 0 for _, a in cashflows):
        return None

    t0 = cashflows[0][0]
    # (years_from_t0, amount) — precompute so we don't redo date math in the loop.
    flows = [((d - t0).days / 365.0, a) for d, a in cashflows]
    if all(t == 0 for t, _ in flows):
        return None

    def npv(rate: float) -> float:
        # 1 + rate must stay > 0 for the power to be real.
        base = 1.0 + rate
        if base <= 0:
            return float("nan")
        return sum(a / (base ** t) for t, a in flows)

    def dnpv(rate: float) -> float:
        base = 1.0 + rate
        if base <= 0:
            return float("nan")
        return sum(-t * a / (base ** (t + 1)) for t, a in flows)

    # --- Newton-Raphson ---
    rate = 0.1  # 10% seed
    for _ in range(100):
        f = npv(rate)
        if f != f:  # nan -> bail to bisection
            break
        if abs(f) < 1e-7:
            return rate
        df = dnpv(rate)
        if df == 0 or df != df:
            break
        step = f / df
        new_rate = rate - step
        if new_rate <= -0.9999:  # don't step past the (1+r)=0 wall
            new_rate = (rate - 0.9999) / 2
        if abs(new_rate - rate) < 1e-9:
            rate = new_rate
            if abs(npv(rate)) < 1e-6:
                return rate
            break
        rate = new_rate

    # --- Bisection fallback over a wide, sane bracket ---
    lo, hi = -0.9999, 100.0  # -99.99%/yr .. 10000%/yr
    flo, fhi = npv(lo), npv(hi)
    if flo != flo or fhi != fhi or flo * fhi > 0:
        return None  # no sign change in the bracket -> unsolvable
    for _ in range(200):
        mid = (lo + hi) / 2
        fmid = npv(mid)
        if fmid != fmid:
            return None
        if abs(fmid) < 1e-7:
            return mid
        if flo * fmid < 0:
            hi, fhi = mid, fmid
        else:
            lo, flo = mid, fmid
    return (lo + hi) / 2


def _estimated_monthly_contribution(account_id: int, db: Session) -> float:
    """Best estimate of monthly contributions into this account, from its holdings."""
    holdings = (
        db.query(InvestmentHolding)
        .filter(InvestmentHolding.account_id == account_id)
        .all()
    )
    return sum(h.monthly_contribution or 0.0 for h in holdings)


def account_return(account_id: int, db: Session) -> dict:
    """Measured annualized return (XIRR) for one account from its balance snapshots.

    Returns a dict that is always safe to display:
      {
        "account_id", "annualized_pct" (float|None), "simple_pct" (float|None),
        "period_start", "period_end", "n_snapshots", "start_balance",
        "end_balance", "est_contributions", "gain", "basis", "method",
        "low_confidence"
      }
    `annualized_pct` is the XIRR. `method` is "xirr" when solved that way.
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
        "method": None,
        "low_confidence": False,
    }

    if len(snaps) < 2:
        base["basis"] = "not enough statements yet (need at least 2 to measure a return)"
        return base

    # --- Find the statement-backed window (recommendation (c)) -------------------
    # The window runs from the first snapshot through the LAST snapshot whose
    # contributions were actually recorded. Trailing manual/synced rows with NULL
    # contributions are dropped from the measurement (and labeled), rather than
    # guessing what was deposited in those gaps.
    last_recorded_idx = None
    for i in range(1, len(snaps)):
        if snaps[i].contributions is not None:
            last_recorded_idx = i
    have_real = last_recorded_idx is not None

    if have_real:
        window = snaps[: last_recorded_idx + 1]
        dropped = len(snaps) - len(window)
    else:
        window = snaps
        dropped = 0

    first, last = window[0], window[-1]
    days = (last.date - first.date).days
    if days <= 0 or first.balance <= 0:
        base["basis"] = "snapshots don't span a usable time period"
        base["period_start"] = first.date.isoformat()
        base["period_end"] = last.date.isoformat()
        return base

    # Short-window guard. Annualizing a money-weighted return from less than a
    # quarter of data blows tiny moves up into wild-looking yearly rates (a
    # brand-new IRA with 2 down months reads as "-30%/yr"). Don't publish that —
    # abstain honestly until there's a meaningful span of statements.
    if days < 120:
        base["period_start"] = first.date.isoformat()
        base["period_end"] = last.date.isoformat()
        base["start_balance"] = round(first.balance, 2)
        base["end_balance"] = round(last.balance, 2)
        base["basis"] = (
            f"too new to annualize — only {days} days of statements "
            f"({first.date.isoformat()}→{last.date.isoformat()}); need ~a quarter to "
            "measure a meaningful return"
        )
        return base

    months = days / 30.44

    # --- Build cash flows + contribution accounting -----------------------------
    if have_real:
        # Real, dated contributions from the statements (the XIRR path).
        cashflows: list[tuple[date, float]] = [(first.date, -first.balance)]
        net_contributions = 0.0
        for s in window[1:]:
            if s.contributions:  # treat None and 0 as "no flow added here"
                cashflows.append((s.date, -float(s.contributions)))
                net_contributions += float(s.contributions)
        cashflows.append((last.date, float(last.balance)))

        annualized = _xirr(cashflows)
        method = "xirr"
        low_confidence = False
        contrib_basis = (
            f"XIRR over {len(window)} statement"
            + ("s" if len(window) != 1 else "")
            + f"; netted ${net_contributions:,.0f} of real dated contributions"
        )
        if dropped:
            contrib_basis += (
                f" ({dropped} later balance-synced row"
                + ("s" if dropped != 1 else "")
                + " not in return window)"
            )
    else:
        # No real contribution data anywhere → fall back to the estimate path and
        # the same >50% garbage guard as before (HYSA / brand-new IRA abstain).
        monthly_contrib = _estimated_monthly_contribution(account_id, db)
        net_contributions = monthly_contrib * months
        # Lump the estimate as two synthetic flows for an XIRR estimate.
        cashflows = [
            (first.date, -(first.balance + net_contributions)),
            (last.date, float(last.balance)),
        ]
        annualized = _xirr(cashflows)
        method = "xirr-estimated"
        low_confidence = True
        if monthly_contrib > 0:
            contrib_basis = f"netted ~${net_contributions:,.0f} est. contributions (${monthly_contrib:,.0f}/mo)"
        else:
            contrib_basis = "GROSS — no contribution data, so this OVERSTATES return if you deposited money"

    gain = last.balance - first.balance - net_contributions

    # A money-weighted "simple" figure kept for backward-compat display. Derived
    # from the annualized XIRR over the actual window length (so simple_pct and
    # annualized_pct stay internally consistent).
    simple = None
    if annualized is not None:
        years = days / 365.0
        simple = (1 + annualized) ** years - 1

    # Guard against publishing a garbage number. If we had to ESTIMATE
    # contributions and the result is implausibly large (>50%/yr), the growth is
    # almost entirely un-tracked deposits (classic for a HYSA you're funding).
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

    if annualized is None:
        base["period_start"] = first.date.isoformat()
        base["period_end"] = last.date.isoformat()
        base["start_balance"] = round(first.balance, 2)
        base["end_balance"] = round(last.balance, 2)
        base["basis"] = "couldn't solve a return from these cash flows"
        return base

    basis = (
        f"{first.date.isoformat()}→{last.date.isoformat()}; {contrib_basis}"
        + ("  [LOW CONFIDENCE — contributions estimated, treat as rough]" if low_confidence else "")
    )
    base["low_confidence"] = low_confidence

    base.update({
        "annualized_pct": round(annualized * 100, 1),
        "simple_pct": round(simple * 100, 1) if simple is not None else None,
        "period_start": first.date.isoformat(),
        "period_end": last.date.isoformat(),
        "start_balance": round(first.balance, 2),
        "end_balance": round(last.balance, 2),
        "est_contributions": round(net_contributions, 2),
        "gain": round(gain, 2),
        "method": method,
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
