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
from app.services.transaction_math import counts_as_expense, counts_as_income


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
            if counts_as_income(t):
                income += t.amount
            elif counts_as_expense(t):
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


def _gather_alltime_by_category(user: User, db: Session) -> dict:
    """Return all-time spending and income totals grouped by category name."""
    cats = db.query(Category).filter(Category.user_id == user.id).all()
    cats_map = {c.id: c.name for c in cats}

    all_txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )

    if not all_txns:
        return {"spending": {}, "income": {}, "earliest": None, "latest": None}

    spending: dict[str, float] = {}
    income: dict[str, float] = {}
    dates = [t.date for t in all_txns]

    for t in all_txns:
        cat_name = cats_map.get(t.category_id, "Uncategorized")
        if counts_as_expense(t):
            spending[cat_name] = spending.get(cat_name, 0.0) + abs(t.amount)
        elif counts_as_income(t):
            income[cat_name] = income.get(cat_name, 0.0) + t.amount

    return {
        "spending": {k: round(v, 2) for k, v in sorted(spending.items(), key=lambda x: -x[1])},
        "income": {k: round(v, 2) for k, v in sorted(income.items(), key=lambda x: -x[1])},
        "earliest": min(dates).isoformat(),
        "latest": max(dates).isoformat(),
    }


# Account types that compound toward retirement (mirror of the Coast FI tab).
_GROWTH_TYPES = {"401k", "ira", "hsa", "brokerage", "hysa"}

# Default Coast FI assumptions (match the Coast FI calculator / source video).
_COAST_DEFAULTS = {"return": 0.10, "inflation": 0.03, "swr": 0.04, "retire_age": 65, "age": 30}


def _scope_users(user: User, db: Session, joint: bool) -> list[User]:
    """Users whose data is in scope: just this user (solo) or the whole household (joint)."""
    if joint:
        return db.query(User).all()
    return [user]


def _gather_monthly_history(users: list[User], db: Session, months: int = 18) -> list[dict]:
    """Per-month income / spending / savings + top categories for the last `months` months,
    merged across the scoped users. Gives the tutor real month-by-month history so it can
    answer questions about past months (the prior prompt only had this-month + all-time totals)."""
    user_ids = [u.id for u in users]
    cats = db.query(Category).filter(Category.user_id.in_(user_ids)).all()
    cats_map = {c.id: c.name for c in cats}

    txns = (
        db.query(Transaction)
        .filter(Transaction.user_id.in_(user_ids), Transaction.scenario_id.is_(None))
        .all()
    )

    # month key "YYYY-MM" -> {income, spending, by_category}
    buckets: dict[str, dict] = {}
    for t in txns:
        key = t.date.strftime("%Y-%m")
        b = buckets.setdefault(key, {"income": 0.0, "spending": 0.0, "by_category": {}})
        if counts_as_income(t):
            b["income"] += t.amount
        elif counts_as_expense(t):
            b["spending"] += abs(t.amount)
            cat = cats_map.get(t.category_id, "Uncategorized")
            b["by_category"][cat] = b["by_category"].get(cat, 0.0) + abs(t.amount)

    ordered_keys = sorted(buckets.keys(), reverse=True)[:months]
    result = []
    for key in ordered_keys:
        b = buckets[key]
        savings = b["income"] - b["spending"]
        top = sorted(b["by_category"].items(), key=lambda x: -x[1])[:3]
        result.append({
            "month": key,
            "income": round(b["income"], 2),
            "spending": round(b["spending"], 2),
            "savings": round(savings, 2),
            "savings_rate": round(savings / b["income"] * 100, 1) if b["income"] > 0 else 0,
            "top_categories": [(c, round(v, 2)) for c, v in top],
        })
    return result  # newest-first


# Categories that exist NOW but won't be part of ongoing retirement spending.
_NON_RETIREMENT_CATS = ("wedding", "student loan", "student loans")


def _estimate_retirement_spend(users: list[User], db: Session) -> tuple[float, str]:
    """Best estimate of ongoing monthly spend in retirement (today's $).

    - Averages spending over the last completed months (excludes the current partial month).
    - Excludes categories that disappear before retirement (wedding, student loans).
    - Smooths one-off purchases: instead of letting a single lump inflate one month, it spreads
      the total one-off spend evenly across the window — so "life happens" is represented as a
      steady buffer rather than a spike. Returns (monthly_spend, human-readable basis)."""
    from app.services.transaction_math import is_one_off

    user_ids = [u.id for u in users]
    cats_map = {c.id: c.name for c in db.query(Category).filter(Category.user_id.in_(user_ids)).all()}
    today = date.today()
    current_key = today.strftime("%Y-%m")

    txns = (
        db.query(Transaction)
        .filter(Transaction.user_id.in_(user_ids), Transaction.scenario_id.is_(None))
        .all()
    )

    # Per completed month: recurring spend (excl. one-offs and non-retirement cats).
    recurring: dict[str, float] = {}
    oneoff_total = 0.0
    for t in txns:
        if not counts_as_expense(t):
            continue
        key = t.date.strftime("%Y-%m")
        if key == current_key:  # skip the partial current month
            continue
        cat = (cats_map.get(t.category_id, "") or "").lower()
        if any(nr in cat for nr in _NON_RETIREMENT_CATS):
            continue  # wedding / student loans — gone in retirement
        amt = abs(t.amount)
        if is_one_off(t):
            oneoff_total += amt
        else:
            recurring[key] = recurring.get(key, 0.0) + amt

    months = sorted(recurring.keys(), reverse=True)[:6]
    if not months:
        return 6000.0, "default ($6,000; not enough history)"

    recurring_avg = sum(recurring[m] for m in months) / len(months)
    # Spread one-offs across the FULL completed-month window so a lump doesn't inflate one month.
    window = max(len(recurring), 1)
    oneoff_buffer = oneoff_total / window
    monthly = recurring_avg + oneoff_buffer
    basis = (
        f"recurring avg of last {len(months)} completed months (excl. wedding & student loans) "
        f"+ ${oneoff_buffer:,.0f}/mo smoothed one-off buffer"
    )
    return monthly, basis


def _gather_coast_fi(user: User, db: Session, joint: bool = False) -> dict:
    """Compute the same Coast FI / FIRE figures the Coast FI tab shows, from real accounts.

    Joint mode sums growth accounts across the whole household (the joint HYSA is a single
    account owned by one user, so there is no double-counting)."""
    users = _scope_users(user, db, joint)
    user_ids = [u.id for u in users]
    accounts = db.query(Account).filter(Account.user_id.in_(user_ids)).all()
    invested = sum(a.balance for a in accounts if a.account_type in _GROWTH_TYPES and a.balance > 0)

    # Retirement-spend basis. If the user(s) set an explicit value in their Financial Profile,
    # use it (joint = sum of partners' set values, falling back to the estimate per partner who
    # hasn't set one). Otherwise use the smart estimate (recurring avg excl. wedding/loans +
    # smoothed one-off buffer) — NOT a raw single month, which badly distorts the FIRE number.
    from app.models.financial_profile import FinancialProfile

    profiles = {
        p.user_id: p for p in
        db.query(FinancialProfile).filter(FinancialProfile.user_id.in_(user_ids)).all()
    }
    any_override = any(
        profiles.get(u.id) and profiles[u.id].monthly_retirement_spend is not None for u in users
    )
    if any_override:
        monthly_spend = 0.0
        for u in users:
            p = profiles.get(u.id)
            if p and p.monthly_retirement_spend is not None:
                monthly_spend += p.monthly_retirement_spend
            else:
                est, _ = _estimate_retirement_spend([u], db)
                monthly_spend += est
        spend_basis = "your set retirement spend" + (" (household sum)" if joint else "")
    else:
        monthly_spend, spend_basis = _estimate_retirement_spend(users, db)

    years = _COAST_DEFAULTS["retire_age"] - _COAST_DEFAULTS["age"]
    nominal, inflation, swr = _COAST_DEFAULTS["return"], _COAST_DEFAULTS["inflation"], _COAST_DEFAULTS["swr"]
    annual_today = monthly_spend * 12
    annual_future = annual_today * ((1 + inflation) ** years)
    fire_number = annual_future / swr if swr else 0.0
    coast_fi_number = fire_number / ((1 + nominal) ** years) if years >= 0 else fire_number
    return {
        "invested": round(invested, 2),
        "monthly_spend": round(monthly_spend, 2),
        "spend_basis": spend_basis,
        "years_to_retire": years,
        "fire_number": round(fire_number, 2),
        "coast_fi_number": round(coast_fi_number, 2),
        "is_coast_fi": invested >= coast_fi_number,
        "pct_to_coast": round(invested / coast_fi_number * 100, 1) if coast_fi_number > 0 else 0,
    }


# Keywords / shapes that mark a question as conceptual/advisory → auto-escalate.
# Deliberately NOT generic lookups like "what is my…"/"how much…" — those stay local.
_HARD_KEYWORDS = (
    "explain", "why ", "how does", "what's the difference", "difference between", "compare",
    "strategy", "should i", "trade-off", "tradeoff", "pros and cons", "scenario", "what if",
    "optimize", "refinance", "amortiz", "backdoor", "rebalance", "allocation",
    "coast fi", "coast-fi", "fire number", "safe withdrawal", "withdrawal rate",
    "roth vs", "roth or", "pmi", "down payment", "recommend", "advice", "better to",
)


def _is_hard_question(message: str) -> bool:
    """Heuristic: conceptual/advisory, multi-part, or long questions warrant the stronger model.

    Plain data lookups ("what is my net worth?", "how much did I spend on dining?") stay local.
    """
    text = message.lower().strip()
    if len(text) > 240:
        return True
    if text.count("?") >= 2:
        return True
    if any(kw in text for kw in _HARD_KEYWORDS):
        return True
    # explicit comparisons phrased as a question
    if (" vs " in text or " versus " in text) and "?" in text:
        return True
    return False


def _reply_low_confidence(reply: str) -> bool:
    """Detect a local model punting so we can escalate."""
    low = reply.lower()
    return any(s in low for s in (
        "i'm not sure", "i am not sure", "i don't know", "i do not know",
        "consult a financial", "cannot determine", "unable to determine",
    ))


def _build_chat_system_prompt(user: User, db: Session, joint: bool = False) -> str:
    today = date.today()
    users = _scope_users(user, db, joint)
    coast = _gather_coast_fi(user, db, joint)

    # Per-user financial data, so we can attribute accounts/spending by owner in joint mode.
    per_user = [(u, _gather_financial_data(u, db, today.year, today.month)) for u in users]

    total_assets = sum(d["total_assets"] for _, d in per_user)
    total_liabilities = sum(d["total_liabilities"] for _, d in per_user)
    net_worth = total_assets - total_liabilities
    month_income = sum(d["this_month"]["income"] for _, d in per_user)
    month_spending = sum(d["this_month"]["spending"] for _, d in per_user)
    savings_rate = round((month_income - month_spending) / month_income * 100, 1) if month_income > 0 else 0

    if joint:
        scope_line = (
            f"You are the household finance tutor for {user.username.capitalize()} and "
            + " & ".join(u.username.capitalize() for u in users if u.id != user.id)
            + ". The numbers below are the COMBINED household (both partners). Account and spending lines are"
            " labeled by owner. When asked about 'our'/'we'/'the household', use the combined totals."
        )
    else:
        scope_line = (
            f"You are the personal finance tutor for {user.username.capitalize()}. The numbers below are"
            f" {user.username.capitalize()}'s only — NOT the household. If asked about a partner or joint"
            " totals, say those are only visible in the app's Joint (household) view."
        )

    ctx_lines = [
        scope_line,
        "You do two things: (1) answer questions about these finances using the real numbers below, and",
        "(2) teach finance concepts — define terms plainly and, when useful, work the math using these numbers.",
        "You can explain and calculate: Coast FI, FIRE, safe withdrawal rate (the 4% rule), compound growth,",
        "savings rate, net worth, house-buying terms (down payment, PMI, DTI, closing costs, points, amortization,",
        "fixed vs ARM), retirement accounts (401k/IRA/Roth/HSA), and general personal-finance math.",
        "Rules: be concise and concrete. Prefer these real numbers over generic examples — that is the whole point.",
        "Show the formula and the substituted numbers when you calculate. If a figure isn't in the data, say so",
        "rather than inventing it. Use plain language; define a term before using it.",
        "You DO have month-by-month history below (last 18 months) — use it to answer questions about past",
        "months, trends, and comparisons; do not claim you only have the current month.",
        "FORMATTING: write clean markdown. Use real markdown tables for comparisons (header row + |---| divider).",
        "Round dollars to whole numbers (e.g. $5,827 — no cents). Use short '##' headers for sections, '-' bullets,",
        "and '**bold**' for key numbers. Do NOT prefix lines with '>' for math; write equations inline on a normal",
        "line (e.g. 'FIRE = $69,924 / 0.04 = $1,748,094'). Avoid '^' notation — say 'grown for 35 years' instead.",
        "",
        f"{'Household ' if joint else ''}Net Worth: ${net_worth:,.2f} (Assets: ${total_assets:,.2f}, Liabilities: ${total_liabilities:,.2f})",
        "",
        f"Coast FI / FIRE — {'HOUSEHOLD (both partners combined)' if joint else 'this person only'} "
        "(assumptions: 10% return, 3% inflation, 4% SWR, retire at 65). THESE ARE THE CANONICAL,",
        "PRE-COMPUTED FIGURES — use them directly; do NOT recompute the FIRE or Coast FI number from",
        "the monthly spend yourself (you'll get a different answer than the app's Coast FI tab):",
        f"  - Invested toward retirement (401k/IRA/HSA/brokerage/HYSA): ${coast['invested']:,.2f}",
        f"  - Monthly spend used (today's $): ${coast['monthly_spend']:,.2f} — {coast['spend_basis']}, NOT a single month",
        f"  - Traditional FIRE number: ${coast['fire_number']:,.2f}",
        f"  - Coast FI number (need invested today): ${coast['coast_fi_number']:,.2f}  →  {coast['pct_to_coast']}% there"
        + ("  (ALREADY Coast FI)" if coast["is_coast_fi"] else ""),
        "  - Coast FI = amount invested today that, with growth alone (no new contributions), reaches the FIRE",
        "    number by retirement age. FIRE number = inflated annual retirement spend / safe withdrawal rate.",
        "    If you show the math, plug in these exact numbers; if a question changes an assumption, say the",
        "    headline figures above use the standard assumptions and reason from there.",
        "",
        "Accounts:",
    ]
    for u, d in per_user:
        for acc in d["accounts"]:
            owner = f" [{u.username}]" if joint else ""
            ctx_lines.append(f"  - {acc['name']} ({acc['type']}): ${acc['balance']:,.2f}{owner}")

    ctx_lines += [
        "",
        f"This month — Income: ${month_income:,.2f}, Spending: ${month_spending:,.2f}, Savings rate: {savings_rate}%",
        "",
        "Spending by category this month:",
    ]
    # Merge this-month category spend across users.
    merged_month: dict[str, float] = {}
    for _, d in per_user:
        for cat, amt in d["this_month"]["by_category"].items():
            merged_month[cat] = merged_month.get(cat, 0.0) + amt
    for cat, amt in sorted(merged_month.items(), key=lambda x: -x[1]):
        ctx_lines.append(f"  - {cat}: ${amt:,.2f}")

    # Month-by-month history (last 18 months) so questions about PAST months can be answered.
    history = _gather_monthly_history(users, db, months=18)
    if history:
        ctx_lines += [
            "",
            "Monthly history (most recent first) — income / spending / savings rate, top categories:",
        ]
        for h in history:
            tops = ", ".join(f"{c} ${v:,.0f}" for c, v in h["top_categories"]) or "no spending"
            ctx_lines.append(
                f"  - {h['month']}: income ${h['income']:,.0f}, spending ${h['spending']:,.0f}, "
                f"savings ${h['savings']:,.0f} ({h['savings_rate']}%) — top: {tops}"
            )

    # All-time, merged across users.
    merged_spend: dict[str, float] = {}
    merged_income: dict[str, float] = {}
    earliest = latest = None
    for u in users:
        at = _gather_alltime_by_category(u, db)
        for cat, amt in at["spending"].items():
            merged_spend[cat] = merged_spend.get(cat, 0.0) + amt
        for cat, amt in at["income"].items():
            merged_income[cat] = merged_income.get(cat, 0.0) + amt
        if at["earliest"]:
            earliest = at["earliest"] if earliest is None else min(earliest, at["earliest"])
            latest = at["latest"] if latest is None else max(latest, at["latest"])

    if earliest:
        ctx_lines += ["", f"All-time spending by category ({earliest} to {latest}):"]
        for cat, amt in sorted(merged_spend.items(), key=lambda x: -x[1]):
            ctx_lines.append(f"  - {cat}: ${amt:,.2f}")
        ctx_lines += ["", "All-time income by category:"]
        for cat, amt in sorted(merged_income.items(), key=lambda x: -x[1]):
            ctx_lines.append(f"  - {cat}: ${amt:,.2f}")

    # Upcoming events across users.
    event_lines = []
    for u, d in per_user:
        for ev in d["upcoming_events"]:
            owner = f" [{u.username}]" if joint else ""
            event_lines.append(f"  - {ev['name']} ({ev['date']}): ${ev['estimated_cost']:,.2f}{owner}")
    if event_lines:
        ctx_lines.append("\nUpcoming events:")
        ctx_lines += event_lines

    return "\n".join(ctx_lines)


def _chat_with_claude(api_key: str, system_prompt: str, history: list, message: str) -> str:
    try:
        import anthropic
    except ImportError:
        raise RuntimeError("The `anthropic` package is not installed.")

    messages = history + [{"role": "user", "content": message}]
    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    )
    return "".join(block.text for block in response.content if block.type == "text")


def _chat_with_openai(api_key: str, system_prompt: str, history: list, message: str) -> str:
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("The `openai` package is not installed.")

    messages = [{"role": "system", "content": system_prompt}] + history + [{"role": "user", "content": message}]
    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=1024,
        messages=messages,
    )
    return response.choices[0].message.content or ""


def _chat_with_ollama(host: str, model: str, system_prompt: str, history: list, message: str) -> str:
    import urllib.request
    import json as _json

    messages = [{"role": "system", "content": system_prompt}] + history + [{"role": "user", "content": message}]
    payload = _json.dumps({"model": model, "stream": False, "messages": messages}).encode()
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
            f"Could not reach Mongol at {host} — it may be asleep. Wake it up and try again. ({e})"
        )


def _chat_via_claude(settings, system_prompt: str, history: list, message: str) -> tuple[str, str]:
    if not settings.ANTHROPIC_API_KEY:
        return "⚠️ No Anthropic key set in backend `.env`.", "error"
    try:
        return _chat_with_claude(settings.ANTHROPIC_API_KEY, system_prompt, history, message), "claude"
    except Exception as e:
        return f"⚠️ **Claude Error**\n\n{e}", "error"


def answer_chat_question(
    user: User,
    db: Session,
    message: str,
    history: list,
    provider: str = "ollama",
    model: str | None = None,
    escalate: bool = False,
    joint: bool = False,
) -> tuple[str, str]:
    """Answer a finance-tutor chat question.

    Returns (reply, model_used). When provider is the local model, a hard question
    (or an explicit `escalate`) auto-routes to Claude. `model_used` reflects who
    actually answered (e.g. "qwen3:14b", "claude", "qwen3:14b→claude").
    When `joint`, the prompt is grounded in the COMBINED household (both partners).
    """
    from app.config import settings

    system_prompt = _build_chat_system_prompt(user, db, joint=joint)

    # Manual override → straight to the strong model.
    if escalate:
        reply, used = _chat_via_claude(settings, system_prompt, history, message)
        return reply, used

    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            return "⚠️ No OpenAI key set in backend `.env`.", "error"
        try:
            return _chat_with_openai(settings.OPENAI_API_KEY, system_prompt, history, message), "openai"
        except Exception as e:
            return f"⚠️ **ChatGPT Error**\n\n{e}", "error"

    if provider == "claude":
        return _chat_via_claude(settings, system_prompt, history, message)

    # provider == "ollama" (local 14b, default) — with auto-escalation on hard questions.
    host = settings.OLLAMA_HOST or "http://10.0.0.172:11434"
    local_model = model or settings.OLLAMA_CHAT_MODEL or "qwen3:14b"

    if _is_hard_question(message) and settings.ANTHROPIC_API_KEY:
        reply, used = _chat_via_claude(settings, system_prompt, history, message)
        if used == "claude":
            return reply, f"{local_model}→claude"
        # Claude unavailable/failed → fall through to local.

    try:
        reply = _chat_with_ollama(host, local_model, system_prompt, history, message)
    except Exception as e:
        # Local unreachable → try Claude as a fallback before giving up.
        if settings.ANTHROPIC_API_KEY:
            fb, used = _chat_via_claude(settings, system_prompt, history, message)
            if used == "claude":
                return fb, f"{local_model} (unreachable)→claude"
        return f"⚠️ **Mongol Error**\n\n{e}", "error"

    # Local answered but punted → escalate.
    if _reply_low_confidence(reply) and settings.ANTHROPIC_API_KEY:
        esc, used = _chat_via_claude(settings, system_prompt, history, message)
        if used == "claude":
            return esc, f"{local_model}→claude"

    return reply, local_model
