"""
Coin — local finance Q&A service.
Gathers real data from the DB, builds a context block, sends to Ollama on Mongol.
Keeps all finance data local — never sends to Claude API or external services.
"""
from __future__ import annotations

import calendar
import requests
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User

ASSET_TYPES = {"checking", "savings", "hysa", "brokerage", "ira", "401k", "hsa", "other"}
LIABILITY_TYPES = {"credit_card", "student_loan", "car_loan", "mortgage"}
COIN_MODEL = "deepseek-r1:8b"


def _month_range(year: int, month: int):
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _gather_data(user: User, db: Session) -> dict:
    """Pull accounts, recent transactions, statements, and spending summary."""
    today = date.today()

    # Last 30 days of transactions
    since = today - timedelta(days=30)
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.date >= since,
            Transaction.scenario_id.is_(None),
        )
        .order_by(Transaction.date.desc())
        .all()
    )

    # Last 3 months spending by category
    three_months_ago = today - timedelta(days=90)
    all_txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.date >= three_months_ago,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )

    cats = db.query(Category).filter(Category.user_id == user.id).all()
    cats_map = {c.id: c for c in cats}

    by_category: dict[str, float] = {}
    total_income = 0.0
    total_spending = 0.0
    for t in all_txns:
        cat = cats_map.get(t.category_id)
        cat_name = cat.name if cat else "Uncategorized"
        if t.amount > 0:
            total_income += t.amount
        else:
            total_spending += abs(t.amount)
            by_category[cat_name] = by_category.get(cat_name, 0.0) + abs(t.amount)

    # Accounts and balances
    accounts = db.query(Account).filter(Account.user_id == user.id, Account.is_active == True).all()
    total_assets = sum(a.balance for a in accounts if a.account_type in ASSET_TYPES and a.balance > 0)
    total_liabilities = sum(abs(a.balance) for a in accounts if a.account_type in LIABILITY_TYPES or a.balance < 0)

    # Budget status for current month
    start, end = _month_range(today.year, today.month)
    this_month_txns = [t for t in all_txns if start <= t.date <= end]
    this_month_by_cat: dict[str, float] = {}
    for t in this_month_txns:
        if t.amount < 0:
            cat = cats_map.get(t.category_id)
            cat_name = cat.name if cat else "Uncategorized"
            this_month_by_cat[cat_name] = this_month_by_cat.get(cat_name, 0.0) + abs(t.amount)

    budget_status = []
    for cat in cats:
        if cat.kind not in ("expense", "savings") or not cat.budget_amount:
            continue
        actual = this_month_by_cat.get(cat.name, 0.0)
        budget_status.append({
            "category": cat.name,
            "budget": round(cat.budget_amount, 2),
            "actual": round(actual, 2),
            "over": actual > cat.budget_amount,
        })

    # Per-month breakdown by category for last 3 months
    monthly_by_cat: dict[str, dict[str, float]] = {}
    for t in all_txns:
        if t.amount >= 0:
            continue
        month_key = t.date.strftime("%Y-%m")
        cat = cats_map.get(t.category_id)
        cat_name = cat.name if cat else "Uncategorized"
        monthly_by_cat.setdefault(month_key, {})
        monthly_by_cat[month_key][cat_name] = monthly_by_cat[month_key].get(cat_name, 0.0) + abs(t.amount)

    return {
        "today": today.isoformat(),
        "accounts": [
            {"name": a.name, "type": a.account_type, "balance": round(a.balance, 2)}
            for a in accounts
        ],
        "net_worth": round(total_assets - total_liabilities, 2),
        "total_assets": round(total_assets, 2),
        "total_liabilities": round(total_liabilities, 2),
        "monthly_spending_by_category": {
            month: {cat: round(amt, 2) for cat, amt in sorted(cats.items(), key=lambda x: -x[1])}
            for month, cats in sorted(monthly_by_cat.items())
        },
        "last_90_days_by_category": {
            k: round(v, 2)
            for k, v in sorted(by_category.items(), key=lambda x: -x[1])
        },
        "total_income_90d": round(total_income, 2),
        "total_spending_90d": round(total_spending, 2),
        "this_month_budget_status": budget_status,
        "recent_transactions": [
            {
                "date": t.date.isoformat(),
                "amount": round(t.amount, 2),
                "description": t.description,
                "category": cats_map.get(t.category_id).name if cats_map.get(t.category_id) else "Uncategorized",
            }
            for t in txns[:30]
        ],
    }


def _build_context(data: dict) -> str:
    lines = [
        f"Today: {data['today']}",
        f"Net Worth: ${data['net_worth']:,.2f}  (Assets: ${data['total_assets']:,.2f} / Liabilities: ${data['total_liabilities']:,.2f})",
        "",
        "Account Balances:",
    ]
    for a in data["accounts"]:
        lines.append(f"  - {a['name']} ({a['type']}): ${a['balance']:,.2f}")

    lines += ["", "Monthly Spending by Category (last 3 months):"]
    for month, cats in data["monthly_spending_by_category"].items():
        lines.append(f"  {month}:")
        for cat, amt in cats.items():
            lines.append(f"    - {cat}: ${amt:,.2f}")

    lines += [
        "",
        f"Total Income (90d): ${data['total_income_90d']:,.2f}",
        f"Total Spending (90d): ${data['total_spending_90d']:,.2f}",
    ]

    if data["this_month_budget_status"]:
        lines += ["", "This Month Budget Status:"]
        for b in data["this_month_budget_status"]:
            status = "OVER" if b["over"] else "ok"
            lines.append(f"  - {b['category']}: spent ${b['actual']:,.2f} of ${b['budget']:,.2f} [{status}]")

    if data["recent_transactions"]:
        lines += ["", "Recent Transactions (last 30 days):"]
        for t in data["recent_transactions"]:
            lines.append(f"  - {t['date']}  ${t['amount']:,.2f}  {t['description']}  [{t['category']}]")

    return "\n".join(lines)


def answer_finance_query(user: User, db: Session, query: str) -> str:
    """Pull real finance data and answer the query using Ollama locally."""
    data = _gather_data(user, db)
    context = _build_context(data)

    prompt = f"""You are Coin, a personal finance assistant. Answer the user's question using only the financial data below. Be specific with numbers. If the data doesn't contain enough information to answer, say so clearly.

FINANCIAL DATA:
{context}

USER QUESTION: {query}

Answer concisely. Use dollar amounts from the data. Plain text only, no markdown."""

    try:
        from app.config import settings
        r = requests.post(
            f"{settings.OLLAMA_HOST}/api/generate",
            json={"model": COIN_MODEL, "prompt": prompt, "stream": False},
            timeout=120,
        )
        return r.json()["response"].strip()
    except Exception as e:
        return f"Coin error contacting Ollama: {e}"
