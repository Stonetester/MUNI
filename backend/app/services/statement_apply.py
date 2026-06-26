"""
Persist a parsed statement into the database:
  - one BalanceSnapshot (dedup by account+date, keep Account.balance in sync)
  - upsert InvestmentHolding rows (match by account + ticker)

Used by the /statements/apply endpoint and by the bulk importer script. Returning
a plain dict so it's safe for both API responses and CLI logging.
"""
from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.balance_snapshot import BalanceSnapshot
from app.models.investment_holding import InvestmentHolding
from app.models.user import User


def _parse_iso(d: str) -> date:
    return datetime.strptime(d[:10], "%Y-%m-%d").date()


def apply_parsed_statement(
    db: Session,
    user: User,
    account_id: int,
    statement_date: str,
    ending_balance: float | None,
    holdings: list[dict],
    contributions: float | None = None,
) -> dict:
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == user.id)
        .first()
    )
    if not account:
        raise HTTPException(404, "Account not found")

    stmt_date = _parse_iso(statement_date)
    result = {"account_id": account_id, "snapshot": None,
              "holdings_upserted": 0, "holdings_created": 0, "holdings_removed": 0}

    # Reject re-import of a statement we already have data for.
    if ending_balance is not None or holdings:
        existing_snap = (
            db.query(BalanceSnapshot)
            .filter(BalanceSnapshot.account_id == account_id, BalanceSnapshot.date == stmt_date)
            .first()
        )
        if existing_snap is not None:
            raise HTTPException(
                409,
                f"A statement for account {account_id} on {stmt_date.isoformat()} already exists "
                f"(balance ${existing_snap.balance:,.2f}). Delete it first if you want to replace it.",
            )

    # A statement is a full snapshot of what's held. Only let it rewrite the holdings
    # set if it is the LATEST statement for this account — otherwise importing an old
    # statement after a newer one would resurrect sold positions. We compare against the
    # most recent EXISTING snapshot date (computed before we add this one below).
    prev_latest = (
        db.query(BalanceSnapshot.date)
        .filter(BalanceSnapshot.account_id == account_id)
        .order_by(BalanceSnapshot.date.desc())
        .first()
    )
    is_latest_statement = (prev_latest is None) or (stmt_date >= prev_latest[0])

    # ── Balance snapshot (dedup by account+date) ────────────────────────────────
    if ending_balance is not None:
        existing = (
            db.query(BalanceSnapshot)
            .filter(BalanceSnapshot.account_id == account_id, BalanceSnapshot.date == stmt_date)
            .first()
        )
        if existing:
            existing.balance = ending_balance
            if contributions is not None:
                existing.contributions = contributions
            snap = existing
        else:
            snap = BalanceSnapshot(account_id=account_id, date=stmt_date, balance=ending_balance,
                                   contributions=contributions, notes="from statement import")
            db.add(snap)
        # Keep Account.balance synced to the most recent snapshot.
        most_recent = (
            db.query(BalanceSnapshot)
            .filter(BalanceSnapshot.account_id == account_id)
            .order_by(BalanceSnapshot.date.desc())
            .first()
        )
        if most_recent is None or stmt_date >= most_recent.date:
            account.balance = ending_balance
        result["snapshot"] = {"date": stmt_date.isoformat(), "balance": ending_balance}

    # ── Holdings reconcile (match by account + ticker) ──────────────────────────
    # The latest statement fully DEFINES the current holdings: upsert the ones it
    # lists and PRUNE any holding it omits (a sold position). Older statements only
    # backfill missing holdings — they never overwrite current values or prune.
    if holdings:
        existing_h = {
            h.ticker: h
            for h in db.query(InvestmentHolding).filter(InvestmentHolding.account_id == account_id).all()
        }
        seen_tickers = set()
        for hd in holdings:
            ticker = hd["ticker"]
            seen_tickers.add(ticker)
            h = existing_h.get(ticker)
            if h:
                if is_latest_statement:
                    h.current_value = hd.get("value") if hd.get("value") is not None else h.current_value
                    if hd.get("weight_percent") is not None:
                        h.weight_percent = hd["weight_percent"]
                if hd.get("fund_name"):
                    h.fund_name = hd["fund_name"]
                result["holdings_upserted"] += 1
            else:
                db.add(InvestmentHolding(
                    account_id=account_id,
                    ticker=ticker,
                    fund_name=hd.get("fund_name"),
                    current_value=hd.get("value") or 0.0,
                    weight_percent=hd.get("weight_percent"),
                ))
                result["holdings_created"] += 1

        # Prune sold positions — only the latest statement is authoritative for this.
        if is_latest_statement:
            for ticker, h in existing_h.items():
                if ticker not in seen_tickers:
                    db.delete(h)
                    result["holdings_removed"] += 1

    db.commit()
    return result
