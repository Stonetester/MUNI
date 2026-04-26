"""
Coin — local finance Q&A service.

Architecture:
- Factual queries (spend totals, transaction lists, balances) are answered
  directly from the DB with no LLM involved. Numbers are always exact.
- Interpretation queries (am I overspending? what should I cut?) use the LLM
  with the DB data as context.

All finance data stays local — never sent to Claude API or external services.
"""
from __future__ import annotations

import calendar
import re
import requests
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User

ASSET_TYPES = {"checking", "savings", "hysa", "brokerage", "ira", "401k", "hsa", "other"}
LIABILITY_TYPES = {"credit_card", "student_loan", "car_loan", "mortgage"}
COIN_MODEL = "deepseek-r1:8b"

MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4,
    "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


# ── Date parsing ─────────────────────────────────────────────────────────────

def _parse_month_year(query: str) -> Optional[tuple[int, int]]:
    """Extract (year, month) from query text if mentioned. Returns None if not found."""
    q = query.lower()
    today = date.today()

    if "last month" in q:
        d = date(today.year, today.month, 1) - timedelta(days=1)
        return d.year, d.month
    if "this month" in q:
        return today.year, today.month

    # "march 2026" or "2026-03" or "03/2026"
    for name, num in MONTH_NAMES.items():
        pattern = rf"{name}\s+(\d{{4}})"
        m = re.search(pattern, q)
        if m:
            return int(m.group(1)), num
        pattern2 = rf"(\d{{4}})\s+{name}"
        m2 = re.search(pattern2, q)
        if m2:
            return int(m2.group(1)), num

    m = re.search(r"(\d{4})-(\d{2})", q)
    if m:
        return int(m.group(1)), int(m.group(2))

    return None


def _month_range(year: int, month: int):
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


# ── DB helpers ────────────────────────────────────────────────────────────────

def _get_cats(user: User, db: Session) -> dict[int, Category]:
    cats = db.query(Category).filter(Category.user_id == user.id).all()
    return {c.id: c for c in cats}


def _find_category(cats_map: dict[int, Category], name: str) -> Optional[int]:
    """Find category id by name (case-insensitive)."""
    name_lower = name.lower()
    for cid, cat in cats_map.items():
        if cat.name.lower() == name_lower:
            return cid
    # fuzzy — partial match
    for cid, cat in cats_map.items():
        if name_lower in cat.name.lower() or cat.name.lower() in name_lower:
            return cid
    return None


def _txns_for_period(user: User, db: Session, start: date, end: date):
    return (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.scenario_id.is_(None),
        )
        .order_by(Transaction.date)
        .all()
    )


# ── Factual query handlers (no LLM) ──────────────────────────────────────────

def _find_category_in_query(q: str, cats_map: dict) -> Optional[int]:
    """Find which category the user is asking about by matching against real category names."""
    # Exact match first
    for cid, cat in cats_map.items():
        if cat.name.lower() == q or cat.name.lower() in q:
            return cid
    # Partial: any word in the category name appears as a whole word in the query
    for cid, cat in cats_map.items():
        for word in cat.name.lower().split():
            if len(word) >= 3 and re.search(rf"\b{re.escape(word)}\b", q):
                return cid
    return None


def _handle_spending_by_category(user: User, db: Session, query: str, cats_map: dict) -> Optional[str]:
    """Handle: how much did I spend on X in [month]?"""
    q = query.lower()
    if not any(w in q for w in ["spend", "spent", "spending", "cost", "pay", "paid"]):
        return None

    month_year = _parse_month_year(query)
    if not month_year:
        today = date.today()
        start = today - timedelta(days=30)
        end = today
        period_label = "the last 30 days"
    else:
        year, month = month_year
        start, end = _month_range(year, month)
        period_label = f"{calendar.month_name[month]} {year}"

    txns = _txns_for_period(user, db, start, end)

    # Try to identify a specific category from the query using real category names
    cat_id = _find_category_in_query(q, cats_map)

    if cat_id:
        cat_name = cats_map[cat_id].name
        cat_txns = [t for t in txns if t.category_id == cat_id and t.amount < 0]
        if not cat_txns:
            return f"No {cat_name} transactions found in {period_label}."
        total = sum(abs(t.amount) for t in cat_txns)
        lines = [f"{cat_name} spending in {period_label}: ${total:,.2f}"]
        lines.append(f"{len(cat_txns)} transactions:")
        for t in cat_txns:
            lines.append(f"  {t.date}  ${abs(t.amount):,.2f}  {t.description}")
        return "\n".join(lines)

    # No specific category detected — check if the query mentions a word that looks
    # like a category name but didn't match. Strip stop words and spending verbs to
    # see if there's a leftover subject word.
    stop = {"how", "much", "did", "i", "spend", "spent", "on", "in", "my", "the",
            "what", "was", "were", "for", "last", "this", "month", "year", "total",
            "spending", "cost", "pay", "paid", "expenses", "expense"}
    words = [w for w in re.findall(r"\b[a-z]+\b", q) if w not in stop and len(w) >= 3]
    # Filter out month names and years
    words = [w for w in words if w not in MONTH_NAMES and not w.isdigit()]
    if words:
        # User seemed to ask about something specific but we couldn't match a category
        available = ", ".join(sorted(c.name for c in cats_map.values()))
        return (
            f"Couldn't find a category matching '{' '.join(words)}' in {period_label}.\n"
            f"Your categories: {available}"
        )

    # No category in the query — return full breakdown
    by_cat: dict[str, float] = {}
    for t in txns:
        if t.amount < 0:
            cat = cats_map.get(t.category_id)
            cat_name = cat.name if cat else "Uncategorized"
            by_cat[cat_name] = by_cat.get(cat_name, 0.0) + abs(t.amount)

    if not by_cat:
        return f"No spending found in {period_label}."

    total = sum(by_cat.values())
    lines = [f"Spending breakdown for {period_label} (total: ${total:,.2f}):"]
    for cat, amt in sorted(by_cat.items(), key=lambda x: -x[1]):
        lines.append(f"  {cat}: ${amt:,.2f}")
    return "\n".join(lines)


def _handle_list_transactions(user: User, db: Session, query: str, cats_map: dict) -> Optional[str]:
    """Handle: list/show my [category] transactions in [month]."""
    q = query.lower()
    if not any(w in q for w in ["list", "show", "what are", "give me", "all my"]):
        return None

    month_year = _parse_month_year(query)
    if not month_year:
        today = date.today()
        start = today - timedelta(days=30)
        end = today
        period_label = "the last 30 days"
    else:
        year, month = month_year
        start, end = _month_range(year, month)
        period_label = f"{calendar.month_name[month]} {year}"

    txns = _txns_for_period(user, db, start, end)

    cat_id = _find_category_in_query(q, cats_map)

    if cat_id:
        txns = [t for t in txns if t.category_id == cat_id]
        cat_name = cats_map[cat_id].name
        label = f"{cat_name} transactions in {period_label}"
    else:
        txns = [t for t in txns if t.amount < 0]
        label = f"transactions in {period_label}"

    if not txns:
        return f"No {label} found."

    total = sum(abs(t.amount) for t in txns if t.amount < 0)
    lines = [f"{label} ({len(txns)} total, ${total:,.2f}):"]
    for t in txns:
        lines.append(f"  {t.date}  ${abs(t.amount):,.2f}  {t.description}")
    return "\n".join(lines)


def _handle_balance_query(user: User, db: Session, query: str) -> Optional[str]:
    """Handle: what is my balance / net worth / how much do I have?"""
    q = query.lower()
    if not any(w in q for w in ["balance", "net worth", "how much do i have", "account balance", "my accounts"]):
        return None

    accounts = db.query(Account).filter(Account.user_id == user.id, Account.is_active == True).all()
    if not accounts:
        return "No active accounts found."

    total_assets = sum(a.balance for a in accounts if a.account_type in ASSET_TYPES and a.balance > 0)
    total_liabilities = sum(abs(a.balance) for a in accounts if a.account_type in LIABILITY_TYPES or a.balance < 0)
    net_worth = total_assets - total_liabilities

    lines = [
        f"Net Worth: ${net_worth:,.2f}",
        f"  Total Assets: ${total_assets:,.2f}",
        f"  Total Liabilities: ${total_liabilities:,.2f}",
        "",
        "Account Balances:",
    ]
    for a in accounts:
        lines.append(f"  {a.name} ({a.account_type}): ${a.balance:,.2f}")
    return "\n".join(lines)


# ── LLM handler for interpretation questions ─────────────────────────────────

def _handle_with_llm(user: User, db: Session, query: str, cats_map: dict) -> str:
    """For interpretation/advice questions, build context and ask Ollama."""
    today = date.today()
    three_months_ago = today - timedelta(days=90)
    all_txns = _txns_for_period(user, db, three_months_ago, today)

    # Monthly breakdown
    monthly: dict[str, dict[str, float]] = {}
    for t in all_txns:
        if t.amount >= 0:
            continue
        mk = t.date.strftime("%Y-%m")
        cat = cats_map.get(t.category_id)
        cn = cat.name if cat else "Uncategorized"
        monthly.setdefault(mk, {})
        monthly[mk][cn] = monthly[mk].get(cn, 0.0) + abs(t.amount)

    accounts = db.query(Account).filter(Account.user_id == user.id, Account.is_active == True).all()
    net_worth = sum(a.balance for a in accounts if a.account_type in ASSET_TYPES and a.balance > 0) - \
                sum(abs(a.balance) for a in accounts if a.account_type in LIABILITY_TYPES or a.balance < 0)

    lines = [f"Today: {today}", f"Net Worth: ${net_worth:,.2f}", "", "Monthly Spending by Category:"]
    for mk, cats in sorted(monthly.items()):
        lines.append(f"  {mk}:")
        for cn, amt in sorted(cats.items(), key=lambda x: -x[1]):
            lines.append(f"    {cn}: ${amt:,.2f}")

    context = "\n".join(lines)

    prompt = f"""You are Coin, a personal finance assistant. Answer the question using only the data below. Be concise and specific. Plain text only.

{context}

Question: {query}"""

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


# ── Entry point ───────────────────────────────────────────────────────────────

def answer_finance_query(user: User, db: Session, query: str) -> str:
    cats_map = _get_cats(user, db)

    # Try factual handlers first — these return exact DB numbers, no LLM
    result = _handle_balance_query(user, db, query)
    if result:
        return result

    result = _handle_list_transactions(user, db, query, cats_map)
    if result:
        return result

    result = _handle_spending_by_category(user, db, query, cats_map)
    if result:
        return result

    # Fall back to LLM for interpretation/advice questions
    return _handle_with_llm(user, db, query, cats_map)
