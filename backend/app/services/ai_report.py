"""
AI-powered monthly financial report using Claude.
Gathers financial data and generates a financial advisor style report.
"""
from __future__ import annotations

import calendar
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.account import Account
from app.models.category import Category
from app.models.life_event import LifeEvent
from app.models.transaction import Transaction
from app.models.user import User


ASSET_TYPES = {"checking", "savings", "hysa", "brokerage", "ira", "401k", "hsa", "other"}
LIABILITY_TYPES = {"credit_card", "student_loan", "car_loan", "mortgage"}


def _month_range(year: int, month: int):
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _prev_month(year: int, month: int):
    if month == 1:
        return year - 1, 12
    return year, month - 1


def _gather_financial_data(user: User, db: Session, year: int, month: int) -> dict:
    """Gather all financial data needed for the report."""
    start, end = _month_range(year, month)
    prev_year, prev_month = _prev_month(year, month)
    prev_start, prev_end = _month_range(prev_year, prev_month)

    # Accounts / net worth
    accounts = db.query(Account).filter(Account.user_id == user.id).all()
    total_assets = sum(a.balance for a in accounts if a.account_type in ASSET_TYPES and a.balance > 0)
    total_liabilities = sum(abs(a.balance) for a in accounts if a.account_type in LIABILITY_TYPES or a.balance < 0)
    net_worth = total_assets - total_liabilities

    account_details = [
        {"name": a.name, "type": a.account_type, "balance": round(a.balance, 2)}
        for a in accounts
    ]

    # Categories map
    cats = db.query(Category).filter(Category.user_id == user.id).all()
    cats_map = {c.id: c for c in cats}

    # Transactions for target month
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )

    # Transactions for previous month
    prev_txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.date >= prev_start,
            Transaction.date <= prev_end,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )

    def summarize(transactions):
        income = 0.0
        spending = 0.0
        by_category = {}
        for t in transactions:
            if t.amount > 0:
                income += t.amount
            else:
                spending += abs(t.amount)
            cat = cats_map.get(t.category_id)
            cat_name = cat.name if cat else "Uncategorized"
            by_category[cat_name] = by_category.get(cat_name, 0.0) + abs(t.amount)
        return {
            "income": round(income, 2),
            "spending": round(spending, 2),
            "savings": round(income - spending, 2),
            "savings_rate": round((income - spending) / income * 100, 1) if income > 0 else 0,
            "by_category": {k: round(v, 2) for k, v in sorted(by_category.items(), key=lambda x: -x[1])},
        }

    this_month_summary = summarize(txns)
    prev_month_summary = summarize(prev_txns)

    # Budget vs actual
    budget_items = []
    for cat in cats:
        if cat.kind not in ("expense", "savings"):
            continue
        actual = this_month_summary["by_category"].get(cat.name, 0.0)
        budget = cat.budget_amount or 0.0
        if budget > 0 or actual > 0:
            budget_items.append({
                "category": cat.name,
                "budget": round(budget, 2),
                "actual": round(actual, 2),
                "over": actual > budget and budget > 0,
                "pct": round(actual / budget * 100, 1) if budget > 0 else None,
            })
    budget_items.sort(key=lambda x: -(x["actual"]))

    # Upcoming life events (next 6 months)
    today = date.today()
    upcoming_events = (
        db.query(LifeEvent)
        .filter(
            LifeEvent.user_id == user.id,
            LifeEvent.is_active == True,
            LifeEvent.start_date >= today,
        )
        .order_by(LifeEvent.start_date)
        .limit(5)
        .all()
    )
    events_data = [
        {
            "name": e.name,
            "date": e.start_date.isoformat(),
            "estimated_cost": round(e.total_cost or 0, 2),
            "notes": e.description or "",
        }
        for e in upcoming_events
    ]

    return {
        "user": user.username,
        "report_month": f"{calendar.month_name[month]} {year}",
        "net_worth": round(net_worth, 2),
        "total_assets": round(total_assets, 2),
        "total_liabilities": round(total_liabilities, 2),
        "accounts": account_details,
        "this_month": this_month_summary,
        "prev_month": prev_month_summary,
        "budget": budget_items,
        "upcoming_events": events_data,
    }


def _build_prompt(data: dict) -> tuple[str, str]:
    """Build the system + user prompts from gathered financial data."""
    ctx_lines = [
        f"# Financial Data for {data['report_month']} — {data['user'].capitalize()}",
        "",
        "## Net Worth Snapshot",
        f"- Total Assets: ${data['total_assets']:,.2f}",
        f"- Total Liabilities: ${data['total_liabilities']:,.2f}",
        f"- Net Worth: ${data['net_worth']:,.2f}",
        "",
        "## Account Balances",
    ]
    for acc in data["accounts"]:
        ctx_lines.append(f"  - {acc['name']} ({acc['type']}): ${acc['balance']:,.2f}")

    ctx_lines += [
        "",
        f"## {data['report_month']} Summary",
        f"- Income: ${data['this_month']['income']:,.2f}",
        f"- Spending: ${data['this_month']['spending']:,.2f}",
        f"- Net Savings: ${data['this_month']['savings']:,.2f}",
        f"- Savings Rate: {data['this_month']['savings_rate']}%",
        "",
        "## Spending by Category (this month)",
    ]
    for cat, amt in data["this_month"]["by_category"].items():
        ctx_lines.append(f"  - {cat}: ${amt:,.2f}")

    prev = data["prev_month"]
    ctx_lines += [
        "",
        "## Previous Month Comparison",
        f"- Income: ${prev['income']:,.2f}  (vs ${data['this_month']['income']:,.2f} this month)",
        f"- Spending: ${prev['spending']:,.2f}  (vs ${data['this_month']['spending']:,.2f} this month)",
        f"- Savings: ${prev['savings']:,.2f}  (vs ${data['this_month']['savings']:,.2f} this month)",
        "",
        "## Budget vs. Actual",
    ]
    for b in data["budget"]:
        status = "🔴 OVER" if b["over"] else "✅ ok"
        pct_str = f"{b['pct']}%" if b["pct"] is not None else "no budget set"
        ctx_lines.append(f"  - {b['category']}: spent ${b['actual']:,.2f} of ${b['budget']:,.2f} budget ({pct_str}) {status}")

    if data["upcoming_events"]:
        ctx_lines += ["", "## Upcoming Life Events"]
        for ev in data["upcoming_events"]:
            ctx_lines.append(f"  - {ev['name']} on {ev['date']}: estimated ${ev['estimated_cost']:,.2f}")
            if ev["notes"]:
                ctx_lines.append(f"    Notes: {ev['notes']}")

    financial_context = "\n".join(ctx_lines)

    system_prompt = (
        "You are a personal financial advisor generating a monthly financial report. "
        "Your tone is warm, encouraging, and honest — like a trusted advisor who knows this person well. "
        "You write in clear prose with markdown formatting (headers, bullet points where appropriate). "
        "Be specific with numbers. Celebrate wins, flag concerns constructively, and give actionable advice. "
        "Keep the report between 400-600 words. Do not use generic filler — every sentence should be specific to the data."
    )

    user_prompt = f"""Using the financial data below, write a comprehensive monthly financial report.

Structure it as:
1. **Month in Review** — 2-3 sentence overview of how the month went financially
2. **Income & Savings** — Commentary on income, savings rate, and comparison to last month
3. **Spending Breakdown** — Top spending categories, notable changes, anything concerning or commendable
4. **Budget Performance** — Which categories were on track, over budget, or well under
5. **Net Worth & Accounts** — Net worth position, notable account balances
6. **Upcoming Events** — What to financially prepare for in the coming months
7. **Action Items** — 3 specific, actionable recommendations for next month

{financial_context}"""

    return system_prompt, user_prompt


def _generate_with_claude(api_key: str, system_prompt: str, user_prompt: str) -> str:
    try:
        import anthropic
    except ImportError:
        raise RuntimeError("The `anthropic` package is not installed. Run `pip install anthropic` in the backend venv.")

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return "".join(block.text for block in response.content if block.type == "text")


def _generate_with_ollama(host: str, model: str, system_prompt: str, user_prompt: str) -> str:
    import urllib.request
    import json as _json

    payload = _json.dumps({
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }).encode()

    req = urllib.request.Request(
        f"{host}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = _json.loads(resp.read())
            return result["message"]["content"]
    except OSError as e:
        raise RuntimeError(
            f"Could not reach Mongol at {host} — it may be asleep or unreachable. "
            f"Wake it up first, then try again. ({e})"
        )


def _generate_with_openai(api_key: str, system_prompt: str, user_prompt: str) -> str:
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("The `openai` package is not installed. Run `pip install openai` in the backend venv.")

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=1024,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content or ""


def generate_monthly_report(user: User, db: Session, year: int, month: int, provider: str = "claude") -> str:
    """Generate a financial advisor monthly report using Claude or ChatGPT."""
    from app.config import settings

    data = _gather_financial_data(user, db, year, month)
    system_prompt, user_prompt = _build_prompt(data)

    if provider == "ollama":
        host = settings.OLLAMA_HOST or "http://10.0.0.172:11434"
        model = settings.OLLAMA_REPORT_MODEL or "deepseek-r1:8b"
        try:
            return _generate_with_ollama(host, model, system_prompt, user_prompt)
        except Exception as e:
            return f"⚠️ **Mongol (Ollama) Error**\n\n{e}"
    elif provider == "openai":
        if not settings.OPENAI_API_KEY:
            return (
                "⚠️ **ChatGPT Report Unavailable**\n\n"
                "Set `OPENAI_API_KEY` in your backend `.env` file, then restart the backend.\n\n"
                "Get a key at https://platform.openai.com/api-keys"
            )
        try:
            return _generate_with_openai(settings.OPENAI_API_KEY, system_prompt, user_prompt)
        except Exception as e:
            return f"⚠️ **ChatGPT Error**\n\n{e}"
    else:
        if not settings.ANTHROPIC_API_KEY:
            return (
                "⚠️ **AI Report Unavailable**\n\n"
                "Set `ANTHROPIC_API_KEY` in your backend `.env` file, then restart the backend.\n\n"
                "Get a key at https://console.anthropic.com/"
            )
        try:
            return _generate_with_claude(settings.ANTHROPIC_API_KEY, system_prompt, user_prompt)
        except Exception as e:
            return f"⚠️ **Claude Error**\n\n{e}"
