"""Tools the finance chat can call to answer ANY question — past or future.

The chat system prompt carries pre-computed summaries (this month, monthly history,
yearly totals, all-time, forecasts). Those cover the common questions cheaply. But
they can't cover the long tail: an arbitrary date range ("last 90 days"), a merchant
("coffee at Starbucks"), a single day, a person-scoped slice, or a forward projection
to an arbitrary horizon / target. These tools close that gap by querying the real DB
and running the real forecast engine on demand, so the model never has to say "that
figure isn't in my data" when the data exists.

Both Claude and the local Ollama model call these (Ollama exposes native tool-calling
on /api/chat). The MODEL decides WHICH slice of the ledger to ask for; this module does
ALL of the arithmetic in Python, so a total is never something a language model added up
in its head. See answer_chat_question in ai_report.py.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.services.transaction_math import counts_as_income, counts_as_expense


# ── Tool schemas (Anthropic tool-use format) ────────────────────────────────
# Kept deliberately small: two tools cover past (query_transactions) and future
# (project_finances). The person enum is filled in at call time from the real users.

def tool_definitions(usernames: list[str]) -> list[dict]:
    person_enum = ["household"] + usernames
    return [
        {
            "name": "query_transactions",
            "description": (
                "Query the real transaction ledger for any PAST spending or income question that "
                "isn't already answered by the summaries in the system prompt — e.g. an arbitrary date "
                "range ('last 90 days'), a specific merchant ('Starbucks'), a single day, a description "
                "keyword, or a person-scoped slice. Returns the exact total, transaction count, average, a "
                "per-person split, and (optionally) the matching transactions. Amounts are absolute dollars. "
                "ALWAYS call this rather than adding numbers up yourself or saying a figure is unavailable - "
                "the totals it returns are computed in code and ARE the authoritative answer. Call it more "
                "than once (e.g. once per person, or once per year) when a question needs several slices."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "person": {
                        "type": "string",
                        "enum": person_enum,
                        "description": "Whose transactions: a specific person, or 'household' for both combined.",
                    },
                    "flow": {
                        "type": "string",
                        "enum": ["expense", "income", "both", "outflow_all"],
                        "description": (
                            "'expense' (default) = consumption spending; savings and internal transfers are "
                            "excluded. 'income' = money in. 'both' = income + expenses. 'outflow_all' = EVERY "
                            "dollar that left the account including savings transfers and contributions - use "
                            "this when the question is how much was PUT INTO / SENT TO / CONTRIBUTED TO a "
                            "destination (e.g. 'how much did I put into EverBank'), because those rows are "
                            "savings transfers, not consumption spending."
                        ),
                    },
                    "category": {
                        "type": "string",
                        "description": "Exact-ish category name to match (case-insensitive substring), e.g. 'Gas', 'Eating Out'. Omit for all categories.",
                    },
                    "merchant_or_text": {
                        "type": "string",
                        "description": "Case-insensitive substring matched against merchant AND description, e.g. 'Starbucks', 'uber'. Omit to not filter by text.",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Inclusive ISO date YYYY-MM-DD. Omit for no lower bound.",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "Inclusive ISO date YYYY-MM-DD. Omit for no upper bound.",
                    },
                    "last_n_days": {
                        "type": "integer",
                        "description": "Convenience: restrict to the last N days from today. Overrides start_date if set.",
                    },
                    "group_by": {
                        "type": "string",
                        "enum": ["none", "category", "month", "merchant", "person", "year"],
                        "description": "Break the total down by this dimension. Default 'none' (single total). Use 'person' to split a household total between partners, 'year' for a year-by-year breakdown.",
                    },
                    "include_samples": {
                        "type": "boolean",
                        "description": "If true, also return the matching transactions themselves (date, owner, amount, merchant, category), largest first, up to 40. Use this whenever the user asks to see, list, or break out the individual transactions.",
                    },
                },
                "required": ["person"],
            },
        },
        {
            "name": "project_finances",
            "description": (
                "Run the app's real forecast engine for any FUTURE question the pre-computed prediction "
                "summary doesn't already answer — e.g. net worth or a specific account's balance at an "
                "arbitrary horizon, 'when will I reach $X', or the projected monthly income/spending path. "
                "Uses the exact same method as the Foresight page (weighted trailing averages + monthly "
                "compounding). Returns the month-by-month projection and per-account balances. Do NOT invent "
                "projections — call this."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "person": {
                        "type": "string",
                        "enum": person_enum,
                        "description": "Whose forecast: a specific person, or 'household' for the combined projection.",
                    },
                    "months": {
                        "type": "integer",
                        "description": "How many months to project (1-600). Default 60. Use a large value for 'when will I reach $X' questions.",
                    },
                    "target_net_worth": {
                        "type": "number",
                        "description": "If set, also report the first projected month net worth reaches or exceeds this dollar amount ('when will I hit $X').",
                    },
                },
                "required": ["person"],
            },
        },
    ]


# ── Executors ───────────────────────────────────────────────────────────────

def _resolve_users(person: str, all_users: list[User]) -> list[User]:
    if person == "household":
        return all_users
    matches = [u for u in all_users if u.username.lower() == person.lower()]
    return matches or all_users


def _run_query_transactions(inp: dict, all_users: list[User], db: Session) -> dict:
    users = _resolve_users(inp.get("person", "household"), all_users)
    user_ids = [u.id for u in users]
    flow = inp.get("flow", "expense")

    cats = db.query(Category).filter(Category.user_id.in_(user_ids)).all()
    cats_map = {c.id: c.name for c in cats}

    q = (
        db.query(Transaction)
        .filter(Transaction.user_id.in_(user_ids), Transaction.scenario_id.is_(None))
    )

    # Date range
    end_date = inp.get("end_date")
    start_date = inp.get("start_date")
    if inp.get("last_n_days"):
        start = date.today() - timedelta(days=int(inp["last_n_days"]))
        q = q.filter(Transaction.date >= start)
        start_date = start.isoformat()
    elif start_date:
        q = q.filter(Transaction.date >= date.fromisoformat(start_date))
    if end_date:
        q = q.filter(Transaction.date <= date.fromisoformat(end_date))

    cat_filter = (inp.get("category") or "").strip().lower()
    text_filter = (inp.get("merchant_or_text") or "").strip().lower()

    txns = q.all()

    def flow_ok(t: Transaction) -> bool:
        if flow == "income":
            return counts_as_income(t)
        if flow == "both":
            return counts_as_income(t) or counts_as_expense(t)
        if flow == "outflow_all":
            # Every dollar that left the account, savings/transfer rows included.
            return t.amount < 0
        return counts_as_expense(t)

    # A category filter matches the EXACT category when one exists (so 'Wedding'
    # means the Wedding category, not every row whose category merely contains it);
    # otherwise it falls back to substring so partial names still work.
    exact_category = None
    if cat_filter:
        exact_category = next(
            (name for name in cats_map.values() if (name or "").strip().lower() == cat_filter),
            None,
        )

    matched = []
    for t in txns:
        if not flow_ok(t):
            continue
        cat_name = cats_map.get(t.category_id, "Uncategorized")
        if cat_filter:
            if exact_category:
                if (cat_name or "").strip().lower() != cat_filter:
                    continue
            elif cat_filter not in (cat_name or "").lower():
                continue
        if text_filter:
            hay = f"{t.merchant or ''} {t.description or ''}".lower()
            if text_filter not in hay:
                continue
        matched.append((t, cat_name))

    total = round(sum(abs(t.amount) for t, _ in matched), 2)
    count = len(matched)
    owner_names = {u.id: u.username.capitalize() for u in all_users}
    per_person = {}
    for t, _ in matched:
        key = owner_names.get(t.user_id, "Unknown")
        per_person[key] = round(per_person.get(key, 0.0) + abs(t.amount), 2)

    sheets_count = sum(
        1 for t, _ in matched
        if t.import_source and str(t.import_source).startswith("sheets:")
    )

    result: dict = {
        "person": inp.get("person", "household"),
        "flow": flow,
        "filters": {
            "category": inp.get("category"),
            "category_match": (
                "exact category" if exact_category
                else ("category name substring" if cat_filter else None)
            ),
            "merchant_or_text": inp.get("merchant_or_text"),
            "start_date": start_date,
            "end_date": end_date,
        },
        "total": total,
        "count": count,
        "average": round(total / count, 2) if count else 0.0,
        "per_person": per_person,
        "source": {
            "table": "transactions",
            "rows_from_google_sheets_sync": sheets_count,
            "note": (
                "Totals are summed in Python over the live ledger rows - report them "
                "exactly as given; do not recompute or round differently."
            ),
        },
    }

    group_by = inp.get("group_by", "none")
    if group_by != "none":
        groups: dict[str, float] = {}
        for t, cat_name in matched:
            if group_by == "category":
                key = cat_name
            elif group_by == "month":
                key = t.date.strftime("%Y-%m")
            elif group_by == "year":
                key = str(t.date.year)
            elif group_by == "person":
                key = owner_names.get(t.user_id, "Unknown")
            else:  # merchant
                key = t.merchant or (t.description or "Unknown")
            groups[key] = groups.get(key, 0.0) + abs(t.amount)
        result["breakdown"] = {
            k: round(v, 2) for k, v in sorted(groups.items(), key=lambda x: -x[1])
        }

    if inp.get("include_samples"):
        top = sorted(matched, key=lambda x: -abs(x[0].amount))[:40]
        result["transactions"] = [
            {
                "date": t.date.isoformat(),
                "owner": owner_names.get(t.user_id, "Unknown"),
                "amount": round(abs(t.amount), 2),
                "merchant": t.merchant or t.description or "",
                "category": cat_name,
            }
            for t, cat_name in top
        ]
        if count > 40:
            result["transactions_note"] = (
                f"Showing the 40 largest of {count} matching transactions; "
                f"the total above covers all {count}."
            )

    if count == 0:
        result["note"] = "No matching transactions - the true figure for these filters is $0."
        # The most common cause of a false $0: the question was about money PUT INTO a
        # destination (a savings transfer / contribution), but flow='expense' filtered
        # those rows out. Don't make the model remember to retry - tell it here.
        if flow == "expense":
            probe = dict(inp)
            probe["flow"] = "outflow_all"
            probe.pop("group_by", None)
            probe.pop("include_samples", None)
            retry = _run_query_transactions(probe, all_users, db)
            if retry["count"]:
                result["retry_hint"] = (
                    f"IMPORTANT: {retry['count']} matching transaction(s) totaling "
                    f"${retry['total']:,.2f} DO exist, but they are savings transfers or "
                    f"contributions rather than consumption spending, so flow='expense' "
                    f"excluded them. If the question was about money PUT INTO or CONTRIBUTED "
                    f"TO this destination, call query_transactions again with "
                    f"flow='outflow_all' and report that figure. Do NOT answer $0 without "
                    f"doing so."
                )
    return result


def _run_project_finances(inp: dict, user: User, all_users: list[User], db: Session) -> dict:
    from app.services.forecasting import run_forecast, run_joint_forecast

    person = inp.get("person", "household")
    months = max(1, min(600, int(inp.get("months", 60))))

    if person == "household" and len(all_users) > 1:
        fc = run_joint_forecast(db, months=months)
    else:
        who = _resolve_users(person, all_users)[0]
        fc = run_forecast(who, db, scenario_id=None, months=months)

    pts = fc.points or []
    today = date.today()

    def month_label(i: int) -> str:
        y = today.year + (today.month - 1 + i) // 12
        m = (today.month - 1 + i) % 12 + 1
        return f"{calendar.month_name[m]} {y}"

    # Sparse trajectory so the payload stays small: every 6 months + the last point.
    trajectory = []
    for i, p in enumerate(pts):
        if i % 6 == 0 or i == len(pts) - 1:
            trajectory.append({
                "month": month_label(i),
                "months_out": i,
                "income": round(p.income, 2),
                "expenses": round(p.expenses, 2),
                "net_worth": round(p.net_worth, 2),
            })

    result: dict = {
        "person": person,
        "months_projected": len(pts),
        "starting_net_worth": round(fc.starting_net_worth, 2),
        "method": "Foresight engine: weighted trailing-average income/spend + monthly compounding of investment accounts.",
        "trajectory": trajectory,
    }

    if fc.account_forecasts:
        result["accounts"] = []
        for af in fc.account_forecasts:
            if not af.monthly_balances:
                continue
            result["accounts"].append({
                "name": af.account_name,
                "type": af.account_type,
                "start": round(af.starting_balance, 2),
                "end": round(af.monthly_balances[-1], 2),
                "monthly_contribution": round(af.monthly_contribution or 0, 2),
                "annual_return_pct": af.annual_return_pct,
            })

    target = inp.get("target_net_worth")
    if target is not None:
        hit = next((i for i, p in enumerate(pts) if p.net_worth >= target), None)
        if hit is None:
            result["target"] = {
                "amount": target,
                "reached": False,
                "note": f"Net worth does not reach ${target:,.0f} within {len(pts)} projected months. "
                        f"Increase months to look further out.",
            }
        else:
            result["target"] = {
                "amount": target,
                "reached": True,
                "month": month_label(hit),
                "months_out": hit,
                "net_worth_then": round(pts[hit].net_worth, 2),
            }
    return result


def execute_tool(name: str, tool_input: dict, user: User, all_users: list[User], db: Session) -> dict:
    """Dispatch a tool call. Never raises — returns an {'error': ...} dict so the
    model can recover and tell the user, rather than crashing the chat turn."""
    try:
        if name == "query_transactions":
            return _run_query_transactions(tool_input, all_users, db)
        if name == "project_finances":
            return _run_project_finances(tool_input, user, all_users, db)
        return {"error": f"Unknown tool '{name}'."}
    except Exception as e:  # defensive: bad dates, empty data, etc.
        return {"error": f"{type(e).__name__}: {e}"}
