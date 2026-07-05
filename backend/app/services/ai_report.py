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


# Report types the user can pick on the AI Report page. Each gets its own data pack
# and structure so the report is DEEP on that topic instead of shallow on everything.
REPORT_TYPES = {
    "monthly": "Monthly Review",
    "spending": "Spending Deep-Dive",
    "investments": "Investments & Returns",
    "goals": "Goals & Retirement",
    "year": "Year in Review",
}


def _claude_messages(api_key: str, system_prompt: str, messages: list, max_tokens: int = 2048) -> str:
    """Call Claude with the preferred model, falling back once if the account
    can't access it (model-not-found)."""
    try:
        import anthropic
    except ImportError:
        raise RuntimeError("The `anthropic` package is not installed. Run `pip install anthropic` in the backend venv.")
    from app.config import settings

    client = anthropic.Anthropic(api_key=api_key)
    for model in (settings.ANTHROPIC_MODEL, settings.ANTHROPIC_FALLBACK_MODEL):
        try:
            response = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=messages,
            )
            return "".join(block.text for block in response.content if block.type == "text")
        except anthropic.NotFoundError:
            continue  # model not available on this account — try the fallback
    raise RuntimeError(
        f"Neither {settings.ANTHROPIC_MODEL} nor {settings.ANTHROPIC_FALLBACK_MODEL} is available on this API key."
    )


def _generate_with_claude(api_key: str, system_prompt: str, user_prompt: str) -> str:
    return _claude_messages(api_key, system_prompt, [{"role": "user", "content": user_prompt}], max_tokens=3000)


def _ollama_chat_call(host: str, model: str, messages: list) -> str:
    """POST to Ollama /api/chat with an explicit context window.

    num_ctx matters: the grounding prompt is large, and Ollama's default context
    silently drops the OLDEST tokens on overflow — which is the system prompt,
    i.e. all the financial data. That is exactly the failure mode that made the
    local chat claim it 'can't see' data that was in the prompt.
    Thinking models (qwen3, deepseek-r1) get `think: false` so reasoning tokens
    don't leak into the reply; retried without it for models that reject the flag.
    """
    import urllib.request
    import urllib.error
    import json as _json
    from app.config import settings

    base = {
        "model": model,
        "stream": False,
        "messages": messages,
        "options": {"num_ctx": settings.OLLAMA_NUM_CTX},
    }

    for body in ({**base, "think": False}, base):
        payload = _json.dumps(body).encode()
        req = urllib.request.Request(
            f"{host}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                result = _json.loads(resp.read())
                return result["message"]["content"]
        except urllib.error.HTTPError as e:
            if body is base:
                raise RuntimeError(f"Ollama error {e.code}: {e.read().decode(errors='replace')[:300]}")
            continue  # model rejected `think` — retry without it
        except OSError as e:
            raise RuntimeError(
                f"Could not reach Mongol at {host} — it may be asleep or unreachable. "
                f"Wake it up first, then try again. ({e})"
            )
    raise RuntimeError("Ollama call failed")


def _generate_with_ollama(host: str, model: str, system_prompt: str, user_prompt: str) -> str:
    return _ollama_chat_call(host, model, [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ])


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


def _core_report_context(user: User, users: list[User], db: Session, year: int, month: int) -> str:
    """Shared context for every report type: this-month + net worth per person and household."""
    per_user = [(u, _gather_financial_data(u, db, year, month)) for u in users]
    lines = [f"# Financial data — {calendar.month_name[month]} {year} — household: "
             + " & ".join(u.username.capitalize() for u in users), ""]
    total_assets = sum(d["total_assets"] for _, d in per_user)
    total_liab = sum(d["total_liabilities"] for _, d in per_user)
    lines.append(f"HOUSEHOLD net worth: ${total_assets - total_liab:,.2f} "
                 f"(assets ${total_assets:,.2f}, liabilities ${total_liab:,.2f})")
    for u, d in per_user:
        tm = d["this_month"]
        lines += [
            "",
            f"## {u.username.capitalize()}",
            f"- Net worth: ${d['net_worth']:,.2f}",
            f"- This month: income ${tm['income']:,.2f}, spending ${tm['spending']:,.2f}, "
            f"savings ${tm['savings']:,.2f} ({tm['savings_rate']}% rate)",
            f"- Last month: income ${d['prev_month']['income']:,.2f}, spending ${d['prev_month']['spending']:,.2f}",
            "- Accounts: " + "; ".join(f"{a['name']} ${a['balance']:,.0f}" for a in d["accounts"]),
            "- Top spending this month: " + (", ".join(
                f"{c} ${v:,.0f}" for c, v in list(tm["by_category"].items())[:8]) or "none"),
        ]
        if d["budget"]:
            over = [b for b in d["budget"] if b["over"]]
            if over:
                lines.append("- OVER budget: " + ", ".join(
                    f"{b['category']} ${b['actual']:,.0f}/{b['budget']:,.0f}" for b in over))
        if d["upcoming_events"]:
            lines.append("- Upcoming events: " + ", ".join(
                f"{e['name']} {e['date']} ${e['estimated_cost']:,.0f}" for e in d["upcoming_events"]))
    return "\n".join(lines)


def _report_type_context(report_type: str, user: User, users: list[User], db: Session) -> str:
    """Extra data pack per report type — this is what gives each report its depth."""
    lines: list[str] = []
    if report_type in ("spending", "year", "monthly"):
        history = _gather_monthly_history(users, db, months=18)
        if history:
            lines += ["", "Monthly history, household (newest first):"]
            for h in history:
                tops = ", ".join(f"{c} ${v:,.0f}" for c, v in h["top_categories"]) or "no spending"
                lines.append(f"  - {h['month']}: income ${h['income']:,.0f}, spending ${h['spending']:,.0f}, "
                             f"savings ${h['savings']:,.0f} ({h['savings_rate']}%) — {tops}")
    if report_type in ("spending", "year"):
        for yr in _gather_yearly_summary(users, db, years=None):
            lines += ["", f"Year {yr['year']}: income ${yr['income']:,.0f}, spending ${yr['spending']:,.0f}"]
            lines.append("  Spending by category: " + (", ".join(
                f"{c} ${v:,.0f}" for c, v in list(yr["spending_by_cat"].items())[:12]) or "none"))
            lines.append("  Income by category: " + (", ".join(
                f"{c} ${v:,.0f}" for c, v in list(yr["income_by_cat"].items())[:8]) or "none"))
    if report_type in ("investments", "goals", "monthly", "year"):
        lines += _gather_savings_goals_context(user, db)
        lines += _gather_forecast_context(user, users, db)
    if report_type in ("investments", "goals"):
        from app.services.returns import all_account_returns
        user_ids = [u.id for u in users]
        returns = all_account_returns(user_ids, db)
        lines += ["", "Measured investment returns (XIRR from statements, netted of contributions):"]
        for r in returns:
            if r["annualized_pct"] is not None:
                lines.append(f"  - {r['account_name']} ({r['account_type']}): {r['annualized_pct']}%/yr "
                             f"({r['period_start']}→{r['period_end']}; {r['basis']})")
            else:
                lines.append(f"  - {r['account_name']} ({r['account_type']}): not measurable yet — {r['basis']}")
        coast = _gather_coast_fi(user, db, joint=True)
        lines += [
            "",
            f"Coast FI (household): invested ${coast['invested']:,.0f}, FIRE number ${coast['fire_number']:,.0f}, "
            f"Coast FI number ${coast['coast_fi_number']:,.0f} ({coast['pct_to_coast']}% there); "
            f"retirement spend basis: ${coast['monthly_spend']:,.0f}/mo — {coast['spend_basis']}",
        ]
    return "\n".join(lines)


_REPORT_STRUCTURES = {
    "monthly": """Structure it as:
1. **Month in Review** — how the month went for each person and the household
2. **Income & Savings** — income, savings rate, savings-goal progress, vs last month
3. **Spending Breakdown** — top categories, notable month-over-month changes, per person
4. **Budget Performance** — on track / over / under, with numbers
5. **Net Worth & Trajectory** — where net worth is and where the forecast says it's heading (12mo / 5yr)
6. **Upcoming Events** — what to prepare for
7. **Action Items** — 3-5 specific, measurable recommendations
Aim for 700-900 words. Cover BOTH people and the household — never just one person.""",
    "spending": """Structure it as:
1. **Where the Money Goes** — the real spending picture by category, household and per person
2. **Trends & Momentum** — which categories are growing/shrinking across the monthly history; call out anything accelerating
3. **Outliers & One-offs** — unusual months or spikes in the history and what drove them
4. **Year-over-Year** — how this year compares to prior years, category by category where notable
5. **Efficiency Opportunities** — the 3-5 categories with the most realistic trim potential, with dollar estimates
Aim for 800-1000 words. Use the monthly history heavily — cite specific months and numbers.""",
    "investments": """Structure it as:
1. **Portfolio Snapshot** — every investment account, balance, and owner
2. **Measured Performance** — the XIRR of each account (these are real measured returns — explain what they mean); flag unmeasurable accounts and why
3. **Contribution Engine** — what's flowing in monthly per account and from what source (paystubs, statements, deposits)
4. **Growth Outlook** — the app's 12-month and 5-year projections per account, and what drives them
5. **Retirement Trajectory** — Coast FI status and what it means in plain language
6. **Considerations** — 3-4 things worth thinking about (NOT specific buy/sell advice)
Aim for 800-1000 words. Be precise about which numbers are measured vs projected.""",
    "goals": """Structure it as:
1. **Savings Goals Scoreboard** — each person's goal vs actual this month, and the household roll-up
2. **The Contribution Machine** — HYSA/IRA/401k monthly contributions per person, with sources
3. **Coast FI & FIRE** — where the household stands, in plain language, with the math shown
4. **Trajectory** — what the forecast says about savings and net worth at 12 months and 5 years
5. **Levers** — the 3 most effective changes to hit goals faster, quantified
Aim for 700-900 words. Show the math for every key number.""",
    "year": """Structure it as:
1. **The Year So Far / In Review** — the big picture: total income, spending, savings for the year
2. **Month by Month** — the story of the year through the monthly history; best and worst months and why
3. **Categories** — the year's biggest spending categories and how they compare to prior years
4. **Net Worth Journey** — where net worth started, where it is, where the forecast puts it
5. **Wins & Watch-outs** — what went well, what needs attention
6. **Setting Up Next Year** — 3-5 concrete targets grounded in this year's real numbers
Aim for 900-1100 words. This is the retrospective — use the full history.""",
}


def generate_monthly_report(
    user: User,
    db: Session,
    year: int,
    month: int,
    provider: str = "claude",
    report_type: str = "monthly",
    joint: bool = True,
) -> str:
    """Generate a financial-advisor report using Claude / ChatGPT / local Ollama.

    `report_type` picks the data pack + structure (see REPORT_TYPES). Reports are
    household-scoped by default (`joint=True`) — both people plus combined totals;
    pass joint=False for a single-person report."""
    from app.config import settings

    if report_type not in REPORT_TYPES:
        report_type = "monthly"
    users = _scope_users(user, db, joint)

    context = _core_report_context(user, users, db, year, month)
    extra = _report_type_context(report_type, user, users, db)
    financial_context = context + ("\n" + extra if extra else "")

    # Explicit scope statement so the model always knows WHOSE view this is —
    # the requesting profile and the Solo/Joint toggle state.
    if joint:
        scope_desc = (
            f"JOINT HOUSEHOLD mode — cover both partners and the combined totals. "
            f"Requested from {user.username.capitalize()}'s profile."
        )
    else:
        scope_desc = (
            f"SOLO mode — this report is about {user.username.capitalize()} only; "
            f"the data below is scoped to them. Do not speculate about the partner's numbers."
        )
    system_prompt = (
        "You are a personal financial advisor generating a written report. "
        f"Report scope: {scope_desc} Open the report by naming this scope in one short line "
        "(e.g. 'Household report' or a solo report for the named person) so the reader knows whose view it is. "
        "Your tone is warm, encouraging, and honest — like a trusted advisor who knows this household well. "
        "You write in clear prose with markdown formatting (## headers, bullets, tables for comparisons). "
        "Be specific with numbers and cite them exactly from the data. Distinguish measured numbers from "
        "projections when it matters. Celebrate wins, flag concerns constructively, give actionable advice. "
        "Do not use generic filler — every sentence should be specific to this data."
    )
    user_prompt = (
        f"Write a **{REPORT_TYPES[report_type]}** report using the financial data below.\n\n"
        f"{_REPORT_STRUCTURES[report_type]}\n\n{financial_context}"
    )

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


def _gather_yearly_summary(users: list[User], db: Session, years: Optional[int] = 3) -> list[dict]:
    """Per-year income and spending by category for the last `years` calendar years.

    This lets the model answer "how much side income did I make in 2026?" exactly —
    the monthly history only carries top-3 spend categories and no income-category breakdown,
    so year-filtered category queries were impossible before this."""
    user_ids = [u.id for u in users]
    cats_map = {c.id: c.name for c in db.query(Category).filter(Category.user_id.in_(user_ids)).all()}

    txns = (
        db.query(Transaction)
        .filter(Transaction.user_id.in_(user_ids), Transaction.scenario_id.is_(None))
        .all()
    )

    today = date.today()
    if years is None:
        # Full history: every year present in the data (capped at 10 for prompt size).
        all_years = {t.date.year for t in txns}
        first = max(min(all_years), today.year - 9) if all_years else today.year
        years = today.year - first + 1
    target_years = [today.year - i for i in range(years)]

    buckets: dict[int, dict] = {
        yr: {"income_by_cat": {}, "spending_by_cat": {}, "income": 0.0, "spending": 0.0}
        for yr in target_years
    }

    for t in txns:
        yr = t.date.year
        if yr not in buckets:
            continue
        b = buckets[yr]
        cat = cats_map.get(t.category_id, "Uncategorized")
        if counts_as_income(t):
            b["income"] += t.amount
            b["income_by_cat"][cat] = b["income_by_cat"].get(cat, 0.0) + t.amount
        elif counts_as_expense(t):
            b["spending"] += abs(t.amount)
            b["spending_by_cat"][cat] = b["spending_by_cat"].get(cat, 0.0) + abs(t.amount)

    result = []
    for yr in sorted(target_years, reverse=True):
        b = buckets[yr]
        result.append({
            "year": yr,
            "income": round(b["income"], 2),
            "spending": round(b["spending"], 2),
            "income_by_cat": {k: round(v, 2) for k, v in sorted(b["income_by_cat"].items(), key=lambda x: -x[1])},
            "spending_by_cat": {k: round(v, 2) for k, v in sorted(b["spending_by_cat"].items(), key=lambda x: -x[1])},
        })
    return result


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
        by_cat_sorted = sorted(b["by_category"].items(), key=lambda x: -x[1])
        top = by_cat_sorted[:3]
        result.append({
            "month": key,
            "income": round(b["income"], 2),
            "spending": round(b["spending"], 2),
            "savings": round(savings, 2),
            "savings_rate": round(savings / b["income"] * 100, 1) if b["income"] > 0 else 0,
            "top_categories": [(c, round(v, 2)) for c, v in top],
            # FULL per-category breakdown (newest-first). The chat prompt renders this so
            # any-category / any-month questions ("how much on gas in June?") are answerable;
            # the report path still uses top_categories for its shorter summary.
            "by_category": [(c, round(v, 2)) for c, v in by_cat_sorted],
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

    # "Retirement salary" = the income side of the same numbers, in today's dollars.
    #  - TARGET salary: what the fully-funded portfolio pays = your retirement spend (annual).
    #  - FUNDED-SO-FAR salary: what today's invested balance throws off at the SWR right now.
    target_annual_salary = annual_today
    funded_annual_salary = invested * swr
    return {
        "invested": round(invested, 2),
        "monthly_spend": round(monthly_spend, 2),
        "spend_basis": spend_basis,
        "years_to_retire": years,
        "fire_number": round(fire_number, 2),
        "coast_fi_number": round(coast_fi_number, 2),
        "is_coast_fi": invested >= coast_fi_number,
        "pct_to_coast": round(invested / coast_fi_number * 100, 1) if coast_fi_number > 0 else 0,
        # Retirement income view (today's $)
        "target_annual_salary": round(target_annual_salary, 2),
        "target_monthly_salary": round(target_annual_salary / 12, 2),
        "funded_annual_salary": round(funded_annual_salary, 2),
        "funded_monthly_salary": round(funded_annual_salary / 12, 2),
        "salary_pct_funded": round(funded_annual_salary / target_annual_salary * 100, 1) if target_annual_salary > 0 else 0,
    }


def _gather_forecast_context(user: User, users: list[User], db: Session) -> list[str]:
    """PREDICTION grounding for the chat/report prompts: the same 60-month Foresight
    projection the app shows, summarized — household totals plus per-account projected
    balances at +12 and +60 months WITH the provenance of each input (where the
    contribution and growth-rate numbers came from), so the model can answer
    'what will my 401k be worth in 5 years and why' from the app's own math."""
    from app.services.forecasting import run_forecast, run_joint_forecast

    try:
        fc = run_joint_forecast(db, months=60) if len(users) > 1 else run_forecast(user, db, scenario_id=None, months=60)
    except Exception as e:
        return ["", f"(Forecast unavailable right now: {e})"]

    lines = [
        "",
        "PREDICTIONS — the app's Foresight projection (household, next 60 months).",
        "These are the SAME numbers the Foresight page shows. Method: projected spending/income",
        "per category = weighted trailing average of real transactions (3-mo avg x 50% + 6-mo x 30%",
        "+ 12-mo x 20%); investment/savings accounts compound monthly: balance x (1 + rate/12) +",
        "monthly contribution. When asked about future/predicted values, use these — do not invent.",
    ]
    pts = fc.points
    if pts:
        # Average projected month over the first 12 months + trajectory waypoints.
        n12 = min(12, len(pts))
        avg_inc = sum(p.income for p in pts[:n12]) / n12
        avg_exp = sum(p.expenses for p in pts[:n12]) / n12
        lines += [
            f"  - Projected average month (next 12 mo): income ${avg_inc:,.0f}, spending ${avg_exp:,.0f}, "
            f"net ${avg_inc - avg_exp:,.0f}",
            f"  - Projected net worth: now ${fc.starting_net_worth:,.0f} -> "
            f"+12mo ${pts[n12 - 1].net_worth:,.0f} -> +60mo ${pts[-1].net_worth:,.0f}",
        ]
    if fc.account_forecasts:
        lines.append("  Per-account projections (start -> +12mo -> +60mo; with the source of each input):")
        for af in fc.account_forecasts:
            if not af.monthly_balances:
                continue
            b12 = af.monthly_balances[min(11, len(af.monthly_balances) - 1)]
            b60 = af.monthly_balances[-1]
            src_bits = []
            if af.monthly_contribution:
                src_bits.append(f"contribution ${af.monthly_contribution:,.0f}/mo from {af.contribution_label} ({af.contribution_basis})")
            if af.annual_return_pct:
                src_bits.append(f"growth {af.annual_return_pct}%/yr")
            src = "; ".join(src_bits) or "no contributions or growth applied"
            lines.append(
                f"    - {af.account_name} ({af.account_type}): ${af.starting_balance:,.0f} -> "
                f"${b12:,.0f} -> ${b60:,.0f} [{src}]"
            )
    return lines


def _gather_savings_goals_context(user: User, db: Session) -> list[str]:
    """Current savings-goal status (per person + joint), same as the dashboard card."""
    from app.services.savings_goal import compute_savings_goals

    try:
        goals = compute_savings_goals(db, user, joint=True)
    except Exception as e:
        return ["", f"(Savings goals unavailable right now: {e})"]

    lines = ["", f"SAVINGS GOALS this month ({goals['month']}) — same numbers as the dashboard card.",
             "The goal is measured against NET CASH saved (income - spending); retirement/savings",
             "contributions (401k/IRA/HYSA) are tracked separately and are NOT part of the goal:"]
    for p in goals["people"]:
        c = p["contributions"]
        lines.append(
            f"  - {p['name']}: net cash saved ${p['net_saved']:,.0f} vs goal ${p['goal']:,.0f} "
            f"({p['pct_of_goal']}%, {'on track' if p['on_track'] else 'behind'}); contributions "
            f"${c['total']:,.0f}/mo (HYSA ${c['hysa']:,.0f} [{c['hysa_source']}], IRA ${c['ira']:,.0f}, "
            f"401k ${c['k401_employee']:,.0f} employee + ${c['k401_employer']:,.0f} employer)"
        )
    j = goals["joint"]
    lines.append(
        f"  - Household: net cash saved ${j['net_saved']:,.0f} vs combined goal ${j['goal']:,.0f} "
        f"({j['pct_of_goal']}%); combined contributions ${j['contributions_total']:,.0f}/mo"
    )
    return lines


_PROVENANCE_GUIDE = [
    "",
    "WHERE THE NUMBERS COME FROM (use this to answer 'where does that value come from?'):",
    "  - Transactions: imported from paystub PDFs, Google Sheets sync, statement PDFs, and CSV — every",
    "    transaction carries an import_source tag.",
    "  - Account balances: latest uploaded statement snapshot when one exists, else the manually set balance.",
    "  - Investment returns: exact XIRR over statement snapshots, netted of recorded contributions — the same",
    "    method brokers print. Accounts without enough statements ABSTAIN rather than guess.",
    "  - Projected growth rates: measured XIRR blended toward a 10% market anchor by statement depth;",
    "    holdings' assumed returns or per-type defaults when no measurement exists.",
    "  - Contributions: recent paystubs (401k) > measured statement contributions > measured EverBank",
    "    deposits (HYSA) > manual profile values, each labeled with its source.",
    "  - Projected spending: weighted trailing category averages (3-mo x 50% + 6-mo x 30% + 12-mo x 20%).",
    "  - Prefer measured data over assumptions, and say which one a number is when it matters.",
]


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
    # The chat ALWAYS sees the whole household — every account, both partners, and the
    # combined totals — regardless of the joint toggle. The old solo mode instructed the
    # model to REFUSE partner/household questions, which read as "the AI can't see my
    # data" even though the data was one flag away. `joint` now only sets emphasis.
    users = db.query(User).order_by(User.id).all()
    coast = _gather_coast_fi(user, db, joint=True)

    # Per-user financial data, so we can attribute accounts/spending by owner.
    per_user = [(u, _gather_financial_data(u, db, today.year, today.month)) for u in users]

    total_assets = sum(d["total_assets"] for _, d in per_user)
    total_liabilities = sum(d["total_liabilities"] for _, d in per_user)
    net_worth = total_assets - total_liabilities
    month_income = sum(d["this_month"]["income"] for _, d in per_user)
    month_spending = sum(d["this_month"]["spending"] for _, d in per_user)
    savings_rate = round((month_income - month_spending) / month_income * 100, 1) if month_income > 0 else 0

    partner_names = " & ".join(u.username.capitalize() for u in users)
    mode = "JOINT (household view)" if joint else f"SOLO ({user.username.capitalize()}'s view)"
    scope_line = (
        f"You are the household finance tutor for {partner_names}. "
        f"ACTIVE PROFILE: {user.username.capitalize()}. VIEW MODE: {mode}. "
        f"If asked who you're talking to or which mode is on, state exactly that. "
        f"Default your emphasis to {'the combined household' if joint else user.username.capitalize()}, "
        "but you have COMPLETE data for BOTH partners AND the combined household below — "
        "per-person lines are labeled by owner. Answer solo questions, partner questions, and "
        "joint/'our' questions directly from this data. "
        "NEVER say you cannot see partner, joint, or household data — you can, it is all below."
    )

    ctx_lines = [
        scope_line,
        "You do two things: (1) answer questions about these finances using the real numbers below, and",
        "(2) teach finance concepts — define terms plainly and, when useful, work the math using these numbers.",
        "You can explain and calculate: Coast FI, FIRE, safe withdrawal rate (the 4% rule), compound growth,",
        "savings rate, net worth, house-buying terms (down payment, PMI, DTI, closing costs, points, amortization,",
        "fixed vs ARM), retirement accounts (401k/IRA/Roth/HSA), and general personal-finance math.",
        "You also know the actual FUNDS/STOCKS held in each investment account and the MEASURED average",
        "return per account (listed below). When asked 'what funds do I own' or 'what was my average return on",
        "my IRA/401k/brokerage', answer from those lists — use the measured return number directly and cite the",
        "account. Never invent a return for an account marked as not-yet-measurable.",
        "Rules: be concise and concrete. Prefer these real numbers over generic examples — that is the whole point.",
        "Show the formula and the substituted numbers when you calculate. If a figure isn't in the data, say so",
        "rather than inventing it. Use plain language; define a term before using it.",
        "You DO have month-by-month history below (last 18 months) plus complete YEAR-BY-YEAR summaries",
        "over the entire recorded history — use them for any question about past months, years, trends,",
        "and comparisons; do not claim you only have the current month.",
        "You ALSO have the app's Foresight PREDICTIONS below (next 60 months: projected spending, savings,",
        "net worth, and per-account balances, with the source of every input) and the current savings-goal",
        "status — use them for any question about the future; never claim you can't predict or can't see",
        "forecasts, and never invent your own projection when the app's is provided.",
        "FORMATTING: write clean markdown. Use real markdown tables for comparisons (header row + |---| divider).",
        "Round dollars to whole numbers (e.g. $5,827 — no cents). Use short '##' headers for sections, '-' bullets,",
        "and '**bold**' for key numbers. Do NOT prefix lines with '>' for math; write equations inline on a normal",
        "line (e.g. 'FIRE = $69,924 / 0.04 = $1,748,094'). Avoid '^' notation — say 'grown for 35 years' instead.",
        "",
        f"HOUSEHOLD Net Worth: ${net_worth:,.2f} (Assets: ${total_assets:,.2f}, Liabilities: ${total_liabilities:,.2f})",
    ]
    for u, d in per_user:
        ctx_lines.append(
            f"  - {u.username.capitalize()} alone: net worth ${d['net_worth']:,.2f} "
            f"(assets ${d['total_assets']:,.2f}, liabilities ${d['total_liabilities']:,.2f})"
        )
    ctx_lines += [
        "",
        "Coast FI / FIRE — HOUSEHOLD (both partners combined) "
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
        f"  - RETIREMENT SALARY (today's $): the income these numbers pay. TARGET salary = ${coast['target_annual_salary']:,.0f}/yr "
        f"(${coast['target_monthly_salary']:,.0f}/mo) — what the fully-funded portfolio pays at the 4% rule, i.e. your retirement spend.",
        f"    FUNDED SO FAR = ${coast['funded_annual_salary']:,.0f}/yr (${coast['funded_monthly_salary']:,.0f}/mo) — what your current "
        f"invested ${coast['invested']:,.0f} would pay TODAY at 4% ({coast['salary_pct_funded']}% of the target salary). It grows toward",
        "    the target as investments compound. If asked 'what's my retirement salary', lead with the TARGET, then funded-so-far.",
        "",
        "Accounts:",
    ]
    for u, d in per_user:
        for acc in d["accounts"]:
            ctx_lines.append(f"  - {acc['name']} ({acc['type']}): ${acc['balance']:,.2f} [{u.username}]")

    # ── Investments: holdings + MEASURED average return per account ──────────────
    # This is what lets the tutor answer "what funds do I own?" and "what was my
    # average return on my IRA?" — previously NONE of this was in the prompt, so
    # the model had no investment data to recall.
    from app.models.investment_holding import InvestmentHolding
    from app.services.returns import all_account_returns

    user_ids = [u.id for u in users]
    accounts_by_id = {
        a.id: a for a in db.query(Account).filter(Account.user_id.in_(user_ids)).all()
    }
    holdings = (
        db.query(InvestmentHolding)
        .filter(InvestmentHolding.account_id.in_(list(accounts_by_id.keys())))
        .all()
    )
    if holdings:
        ctx_lines += ["", "Investment holdings (the actual funds/stocks inside each account):"]
        # group by account
        by_acct: dict[int, list] = {}
        for h in holdings:
            by_acct.setdefault(h.account_id, []).append(h)
        for acc_id, hs in by_acct.items():
            acc = accounts_by_id.get(acc_id)
            if not acc:
                continue
            owner = f" [{acc.user.username}]" if acc.user else ""
            ctx_lines.append(f"  {acc.name} ({acc.account_type}){owner}:")
            for h in sorted(hs, key=lambda x: -(x.current_value or 0)):
                ret = f", assumed return {h.assumed_annual_return}%" if h.assumed_annual_return else ""
                wt = f", {h.weight_percent:.0f}% of account" if h.weight_percent else ""
                name = h.fund_name or h.ticker
                # Some statements (John Hancock, Fidelity) list fund NAMES, not real
                # tickers — we store a slug. Only show the ticker when it looks real
                # (i.e. it isn't just a slug of the name) so the chat reads cleanly.
                slug_like = (h.fund_name and h.ticker and
                             h.ticker not in (h.fund_name or "") and len(h.ticker) > 6)
                label = name if slug_like else f"{h.ticker} — {name}"
                ctx_lines.append(
                    f"    - {label}: ${h.current_value:,.2f}{wt}{ret}"
                )

    returns = all_account_returns(user_ids, db)
    measured = [r for r in returns if r["annualized_pct"] is not None]
    if measured:
        ctx_lines += [
            "",
            "MEASURED average return per investment account (annualized, computed from your uploaded",
            "statement balances and netted of contributions — this is the REAL number, use it directly):",
        ]
        for r in measured:
            owner = ""
            acc = accounts_by_id.get(r["account_id"])
            if acc and acc.user:
                owner = f" [{acc.user.username}]"
            ctx_lines.append(
                f"  - {r['account_name']} ({r['account_type']}){owner}: "
                f"{r['annualized_pct']}%/yr "
                f"(${r['start_balance']:,.0f}→${r['end_balance']:,.0f}, {r['period_start']}→{r['period_end']}; "
                f"{r['basis']})"
            )
    # Accounts we couldn't measure yet (so the tutor says WHY instead of guessing).
    unmeasured = [r for r in returns if r["annualized_pct"] is None]
    if unmeasured:
        ctx_lines.append(
            "  (No measured return yet for: "
            + ", ".join(f"{r['account_name']} — {r['basis']}" for r in unmeasured)
            + ". Do NOT invent a return for these; tell the user to upload more statements.)"
        )

    ctx_lines += [
        "",
        f"This month, HOUSEHOLD — Income: ${month_income:,.2f}, Spending: ${month_spending:,.2f}, Savings rate: {savings_rate}%",
    ]
    for u, d in per_user:
        tm = d["this_month"]
        ctx_lines.append(
            f"  - {u.username.capitalize()} alone: income ${tm['income']:,.2f}, spending ${tm['spending']:,.2f}, "
            f"savings rate {tm['savings_rate']}%"
        )
    ctx_lines += ["", "Spending by category this month (household; per-person figures in brackets when both spent):"]
    # Merge this-month category spend across users, keeping the per-owner split.
    merged_month: dict[str, float] = {}
    per_owner_month: dict[str, dict[str, float]] = {}
    for u, d in per_user:
        for cat, amt in d["this_month"]["by_category"].items():
            merged_month[cat] = merged_month.get(cat, 0.0) + amt
            per_owner_month.setdefault(cat, {})[u.username] = amt
    for cat, amt in sorted(merged_month.items(), key=lambda x: -x[1]):
        owners = per_owner_month.get(cat, {})
        split = (
            " [" + ", ".join(f"{o} ${v:,.0f}" for o, v in owners.items()) + "]"
            if len(owners) > 1 else f" [{next(iter(owners))}]" if owners else ""
        )
        ctx_lines.append(f"  - {cat}: ${amt:,.2f}{split}")

    # Savings-goal status + the app's own forward projections (predictions).
    ctx_lines += _gather_savings_goals_context(user, db)
    ctx_lines += _gather_forecast_context(user, users, db)

    # Month-by-month history (last 18 months) so questions about PAST months can be answered.
    history = _gather_monthly_history(users, db, months=18)
    if history:
        ctx_lines += [
            "",
            "Monthly history, HOUSEHOLD combined (most recent first) — income / spending / savings rate, then the",
            "FULL per-category spending breakdown for that month. This is COMPLETE (every category, not just the top",
            "few), so answer any 'how much did I spend on <category> in <month>' question directly from these lines.",
            "If a category isn't listed for a month, spending on it that month was $0 — say $0, don't say you lack data.",
        ]
        for h in history:
            cats = ", ".join(f"{c} ${v:,.0f}" for c, v in h["by_category"]) or "no spending"
            ctx_lines.append(
                f"  - {h['month']}: income ${h['income']:,.0f}, spending ${h['spending']:,.0f}, "
                f"savings ${h['savings']:,.0f} ({h['savings_rate']}%) — by category: {cats}"
            )

    # Year-by-year summary with full income AND spending category breakdown, over the
    # ENTIRE recorded history — the authoritative source for "how much X did I
    # earn/spend in YEAR?" and any full-financial-history question.
    yearly = _gather_yearly_summary(users, db, years=None)
    if yearly:
        ctx_lines += [
            "",
            "ANNUAL SUMMARY — income and spending broken down by category per year.",
            "Use these for any question about a specific year (e.g. 'total side income in 2026').",
            "These are complete year-to-date figures for the current year and full-year for prior years:",
        ]
        for yr_data in yearly:
            yr = yr_data["year"]
            ctx_lines.append(
                f"\n  {yr} — Total income: ${yr_data['income']:,.0f}, Total spending: ${yr_data['spending']:,.0f}"
            )
            if yr_data["income_by_cat"]:
                ctx_lines.append(f"  {yr} Income by category:")
                for cat, amt in yr_data["income_by_cat"].items():
                    ctx_lines.append(f"    - {cat}: ${amt:,.0f}")
            if yr_data["spending_by_cat"]:
                ctx_lines.append(f"  {yr} Spending by category:")
                for cat, amt in yr_data["spending_by_cat"].items():
                    ctx_lines.append(f"    - {cat}: ${amt:,.0f}")

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
            event_lines.append(f"  - {ev['name']} ({ev['date']}): ${ev['estimated_cost']:,.2f} [{u.username}]")
    if event_lines:
        ctx_lines.append("\nUpcoming events:")
        ctx_lines += event_lines

    ctx_lines += _PROVENANCE_GUIDE

    return "\n".join(ctx_lines)


def _chat_with_claude(api_key: str, system_prompt: str, history: list, message: str) -> str:
    return _claude_messages(api_key, system_prompt, history + [{"role": "user", "content": message}], max_tokens=1536)


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
    messages = [{"role": "system", "content": system_prompt}] + history + [{"role": "user", "content": message}]
    return _ollama_chat_call(host, model, messages)


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
