"""Regression tests for the 2026-07-04 trustworthy-math + AI-grounding round:

- Suggested savings goal: MAIN value is the median over all completed months
  (realistic), with the old positive-months x1.10 kept as a labeled STRETCH
  alternate — both carry plain-language basis strings.
- Forecast explainability: every AccountForecast carries rate provenance,
  starting-balance source, and the exact projection formula; the response
  carries the per-category spending model with the 50/30/20 blend inputs.
- AI chat grounding: the system prompt always includes BOTH partners, the
  household, savings goals, and the Foresight predictions — and never
  instructs the model to refuse joint/partner questions.
"""
from datetime import date
from unittest import TestCase

from dateutil.relativedelta import relativedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.database import Base
from app.models.account import Account
from app.models.balance_snapshot import BalanceSnapshot
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.services.savings_goal import _suggested_goal
from app.services.forecasting import run_forecast


def _fresh_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


class SuggestedGoalTests(TestCase):
    def setUp(self):
        self.db = _fresh_db()
        self.u = User(username="k", email="k@e.com", hashed_password="x")
        self.db.add(self.u)
        self.db.flush()
        self.inc = Category(user_id=self.u.id, name="Salary", kind="income")
        self.exp = Category(user_id=self.u.id, name="Rent", kind="expense")
        self.db.add_all([self.inc, self.exp])
        self.db.commit()

    def _month(self, months_ago: int, income: float, spend: float):
        d = (date.today().replace(day=1) - relativedelta(months=months_ago)).replace(day=5)
        self.db.add(Transaction(user_id=self.u.id, category_id=self.inc.id, date=d, amount=income, description="pay"))
        self.db.add(Transaction(user_id=self.u.id, category_id=self.exp.id, date=d, amount=-spend, description="rent"))

    def test_main_is_median_stretch_is_positive_mean(self):
        # 6 completed months of net: +2000, -1500, -1500, -1500, -1500, -1500
        self._month(1, 5000, 3000)
        for m in range(2, 7):
            self._month(m, 3000, 4500)
        self.db.commit()

        s = _suggested_goal(self.db, self.u.id, date.today())
        # Median of [2000, -1500 x5] = -1500 -> floored at 0. One good month must NOT
        # set the goal (the old method suggested 2000 * 1.10 = 2200 here).
        self.assertEqual(s["suggested"], 0.0)
        # Stretch = mean of positive months only x 1.10 = 2200 (the old behavior, labeled).
        self.assertEqual(s["stretch"], 2200.0)
        self.assertIn("median", s["suggested_basis"])
        self.assertIn("stretch", s["stretch_basis"])

    def test_steady_saver_gets_typical_month(self):
        for m in range(1, 7):
            self._month(m, 5000, 3200)  # +1800 every month
        self.db.commit()
        s = _suggested_goal(self.db, self.u.id, date.today())
        self.assertEqual(s["suggested"], 1800.0)   # median of a steady series = the series
        self.assertEqual(s["stretch"], 1975.0)     # 1800 x 1.10 = 1980 -> nearest 25 = 1975


class ForecastExplainabilityTests(TestCase):
    def setUp(self):
        self.db = _fresh_db()
        self.u = User(username="k", email="k@e.com", hashed_password="x")
        self.db.add(self.u)
        self.db.flush()
        self.checking = Account(user_id=self.u.id, name="Checking", account_type="checking", balance=5000)
        self.k401 = Account(user_id=self.u.id, name="401k", account_type="401k", balance=50000)
        self.db.add_all([self.checking, self.k401])
        self.db.flush()
        self.inc = Category(user_id=self.u.id, name="Salary", kind="income")
        self.exp = Category(user_id=self.u.id, name="Rent", kind="expense")
        self.db.add_all([self.inc, self.exp])
        self.db.flush()
        for m in range(1, 7):
            d = (date.today().replace(day=15) - relativedelta(months=m))
            self.db.add(Transaction(user_id=self.u.id, category_id=self.inc.id, date=d, amount=4000, description="pay"))
            self.db.add(Transaction(user_id=self.u.id, category_id=self.exp.id, date=d, amount=-1200, description="rent"))
        # A statement snapshot so the 401k starting balance is statement-sourced.
        self.db.add(BalanceSnapshot(account_id=self.k401.id, date=date.today() - relativedelta(months=1),
                                    balance=52000, contributions=None))
        self.db.commit()

    def test_account_forecasts_carry_full_provenance(self):
        resp = run_forecast(self.u, self.db, scenario_id=None, months=12)
        by_name = {af.account_name: af for af in resp.account_forecasts}
        k401 = by_name["401k"]
        # Rate provenance: no measured XIRR/holdings here -> the labeled type default.
        self.assertEqual(k401.rate_source, "type_default")
        self.assertIn("%", k401.rate_basis)
        # Starting balance came from the snapshot, and says so with the date.
        self.assertEqual(k401.starting_balance, 52000)
        self.assertIn("statement snapshot", k401.starting_balance_source)
        # The exact month-step formula is stated.
        self.assertIn("balance × (1 +", k401.projection_formula)
        checking = by_name["Checking"]
        self.assertIn("cash pool", checking.projection_formula)
        self.assertIn("manually set", checking.starting_balance_source)

    def test_spending_model_shows_blend_inputs(self):
        resp = run_forecast(self.u, self.db, scenario_id=None, months=12)
        self.assertTrue(resp.spending_model)
        rent = next(r for r in resp.spending_model if r.category == "Rent")
        self.assertEqual(rent.kind, "expense")
        # monthly = avg3*0.5 + avg6*0.3 + avg12*0.2, from the row's own inputs.
        expected = rent.avg3 * 0.5 + rent.avg6 * 0.3 + rent.avg12 * 0.2
        self.assertAlmostEqual(rent.monthly, expected, places=1)
        self.assertIn("50%", resp.spending_model_formula)
        self.assertGreater(resp.variance_pct, 0.0)
        self.assertIn("coefficient of variation", resp.variance_basis)


class ChatGroundingTests(TestCase):
    def setUp(self):
        self.db = _fresh_db()
        self.k = User(username="keaton", email="k@e.com", hashed_password="x")
        self.kat = User(username="katherine", email="kat@e.com", hashed_password="x")
        self.db.add_all([self.k, self.kat])
        self.db.flush()
        self.db.add(Account(user_id=self.k.id, name="K Checking", account_type="checking", balance=4000))
        self.db.add(Account(user_id=self.kat.id, name="Kat 401k", account_type="401k", balance=12000))
        self.db.commit()

    def test_prompt_always_has_both_partners_and_never_refuses(self):
        from app.services.ai_report import _build_chat_system_prompt
        for joint in (False, True):  # SOLO mode must carry the same household data now
            prompt = _build_chat_system_prompt(self.k, self.db, joint=joint)
            self.assertIn("Keaton", prompt)
            self.assertIn("Katherine", prompt)
            self.assertIn("Kat 401k", prompt)          # partner's account visible
            self.assertIn("HOUSEHOLD Net Worth", prompt)
            self.assertIn("NEVER say you cannot see", prompt)
            self.assertIn("PREDICTIONS", prompt)       # Foresight grounding present
            self.assertIn("SAVINGS GOALS", prompt)
            self.assertIn("WHERE THE NUMBERS COME FROM", prompt)
            # The old refusal instruction must be gone.
            self.assertNotIn("only visible in the app's Joint", prompt)

    def test_report_types_registry(self):
        from app.services.ai_report import REPORT_TYPES
        self.assertEqual(
            set(REPORT_TYPES.keys()),
            {"monthly", "spending", "investments", "goals", "year"},
        )


    def test_prompt_forbids_doing_the_math_in_the_models_head(self):
        from app.services.ai_report import _build_chat_system_prompt

        prompt = _build_chat_system_prompt(self.k, self.db, joint=True)
        self.assertIn("NEVER add up dollar amounts yourself", prompt)
        self.assertIn("query_transactions", prompt)
        self.assertIn("outflow_all", prompt)
        self.assertIn("per_person", prompt)

    def test_regex_ledger_shortcut_is_gone(self):
        """The old phrase-matching interceptor must not come back - every 'how much'
        question now goes through the model + tool loop."""
        import app.services.ai_report as ai_report

        self.assertFalse(hasattr(ai_report, "_answer_ledger_question"))
        self.assertFalse(hasattr(ai_report, "_answer_named_transaction_outflow_question"))


class LedgerToolTests(TestCase):
    """The tool layer owns ALL the arithmetic now. These are the exact questions that
    exposed the old regex path's failures, expressed as the tool calls a model makes."""

    def setUp(self):
        self.db = _fresh_db()
        self.k = User(username="keaton", email="k@e.com", hashed_password="x")
        self.kat = User(username="katherine", email="kat@e.com", hashed_password="x")
        self.db.add_all([self.k, self.kat])
        self.db.flush()
        self.users = [self.k, self.kat]

    def _call(self, **inp):
        from app.services.chat_tools import execute_tool
        return execute_tool("query_transactions", inp, self.k, self.users, self.db)

    # -- "How much did I put into EverBank in the last two years?" ------------
    def test_outflow_all_counts_savings_transfers_expense_flow_does_not(self):
        transfer = Category(user_id=self.k.id, name="Savings Transfer", kind="transfer")
        self.db.add(transfer)
        self.db.flush()
        self.db.add_all([
            Transaction(
                user_id=self.k.id, category_id=transfer.id,
                date=date.today() - relativedelta(months=3), amount=-2400,
                description="Transfer to EverBank HYSA", import_source="sheets:MAY2026",
            ),
            Transaction(
                user_id=self.k.id, category_id=transfer.id,
                date=date.today() - relativedelta(months=8), amount=-1250.50,
                description="External transfer", merchant="EverBank", import_source="sheets:DEC2025",
            ),
            # Outside the 2-year window - must not be counted.
            Transaction(
                user_id=self.k.id, category_id=transfer.id,
                date=date.today() - relativedelta(years=3), amount=-5000,
                description="Transfer to EverBank HYSA",
            ),
        ])
        self.db.commit()

        start = (date.today() - relativedelta(years=2)).isoformat()
        res = self._call(
            person="keaton", flow="outflow_all", merchant_or_text="everbank",
            start_date=start, end_date=date.today().isoformat(),
        )
        self.assertEqual(res["total"], 3650.50)
        self.assertEqual(res["count"], 2)
        self.assertEqual(res["per_person"], {"Keaton": 3650.50})
        self.assertEqual(res["source"]["rows_from_google_sheets_sync"], 2)

        # The old failure mode: 'expense' flow silently returns $0 for transfers.
        spent = self._call(
            person="keaton", flow="expense", merchant_or_text="everbank",
            start_date=start, end_date=date.today().isoformat(),
        )
        self.assertEqual(spent["total"], 0.0)
        self.assertIn("note", spent)

    # -- "How much did we spend on wedding stuff in the last two years?" ------
    def test_wedding_category_is_exact_and_excludes_savings_transfers(self):
        wedding = Category(user_id=self.k.id, name="Wedding", kind="expense")
        wedding_savings = Category(user_id=self.k.id, name="Wedding Savings", kind="savings")
        self.db.add_all([wedding, wedding_savings])
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.k.id, category_id=wedding.id,
                        date=date.today() - relativedelta(months=3), amount=-2500,
                        description="Venue deposit", import_source="sheets:MAY2026"),
            # Savings toward the wedding is NOT consumption spending.
            Transaction(user_id=self.k.id, category_id=wedding_savings.id,
                        date=date.today() - relativedelta(months=2), amount=-1000,
                        description="Wedding savings"),
        ])
        self.db.commit()

        res = self._call(
            person="keaton", flow="expense", category="Wedding",
            start_date=(date.today() - relativedelta(years=2)).isoformat(),
        )
        # Exact match: 'Wedding Savings' must not be swept in by substring.
        self.assertEqual(res["total"], 2500.0)
        self.assertEqual(res["count"], 1)
        self.assertEqual(res["filters"]["category_match"], "exact category")

    def test_household_wedding_total_splits_per_person(self):
        k_wedding = Category(user_id=self.k.id, name="Wedding", kind="expense")
        kat_wedding = Category(user_id=self.kat.id, name="Wedding", kind="expense")
        self.db.add_all([k_wedding, kat_wedding])
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.k.id, category_id=k_wedding.id,
                        date=date.today() - relativedelta(months=2), amount=-1200,
                        description="Wedding venue"),
            Transaction(user_id=self.kat.id, category_id=kat_wedding.id,
                        date=date.today() - relativedelta(months=1), amount=-800,
                        description="Wedding flowers"),
        ])
        self.db.commit()

        res = self._call(
            person="household", flow="expense", category="Wedding",
            start_date=(date.today() - relativedelta(years=2)).isoformat(),
            group_by="person",
        )
        self.assertEqual(res["total"], 2000.0)
        self.assertEqual(res["per_person"], {"Keaton": 1200.0, "Katherine": 800.0})
        self.assertEqual(res["breakdown"], {"Keaton": 1200.0, "Katherine": 800.0})

    def test_solo_scope_excludes_the_partner(self):
        k_wedding = Category(user_id=self.k.id, name="Wedding", kind="expense")
        kat_wedding = Category(user_id=self.kat.id, name="Wedding", kind="expense")
        self.db.add_all([k_wedding, kat_wedding])
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.k.id, category_id=k_wedding.id,
                        date=date(2025, 6, 1), amount=-1000, description="Photos"),
            Transaction(user_id=self.kat.id, category_id=kat_wedding.id,
                        date=date(2025, 7, 1), amount=-999, description="Dress"),
        ])
        self.db.commit()

        res = self._call(person="keaton", flow="expense", category="Wedding",
                         start_date="2024-01-01", end_date="2026-12-31")
        self.assertEqual(res["total"], 1000.0)
        self.assertEqual(res["per_person"], {"Keaton": 1000.0})

    def test_year_grouping_and_line_items(self):
        wedding = Category(user_id=self.k.id, name="Wedding", kind="expense")
        self.db.add(wedding)
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.k.id, category_id=wedding.id,
                        date=date(2024, 6, 1), amount=-400, description="Venue"),
            Transaction(user_id=self.k.id, category_id=wedding.id,
                        date=date(2025, 6, 1), amount=-600, description="Photos"),
        ])
        self.db.commit()

        res = self._call(person="keaton", flow="expense", category="Wedding",
                         start_date="2024-01-01", end_date="2026-12-31",
                         group_by="year", include_samples=True)
        self.assertEqual(res["total"], 1000.0)
        self.assertEqual(res["breakdown"], {"2025": 600.0, "2024": 400.0})
        rows = res["transactions"]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["amount"], 600.0)     # largest first
        self.assertEqual(rows[0]["owner"], "Keaton")

    def test_substring_category_still_works_when_no_exact_match(self):
        self.db.add(Category(user_id=self.k.id, name="Eating Out", kind="expense"))
        self.db.flush()
        cat = self.db.query(Category).filter_by(name="Eating Out").one()
        self.db.add(Transaction(user_id=self.k.id, category_id=cat.id,
                                date=date(2025, 5, 1), amount=-75, description="Dinner"))
        self.db.commit()

        res = self._call(person="keaton", flow="expense", category="eating",
                         start_date="2024-01-01", end_date="2026-12-31")
        self.assertEqual(res["total"], 75.0)
        self.assertEqual(res["filters"]["category_match"], "category name substring")

    def test_false_zero_on_expense_flow_returns_a_retry_hint(self):
        """The EverBank failure: asking about a SAVINGS destination with flow='expense'
        yields $0. The tool must tell the model the money exists as outflow_all."""
        transfer = Category(user_id=self.k.id, name="Savings Transfer", kind="transfer")
        self.db.add(transfer)
        self.db.flush()
        self.db.add(Transaction(
            user_id=self.k.id, category_id=transfer.id,
            date=date(2025, 9, 22), amount=-1600, description="everbank",
        ))
        self.db.commit()

        res = self._call(person="keaton", flow="expense", merchant_or_text="everbank",
                         start_date="2024-01-01", end_date="2026-12-31")
        self.assertEqual(res["total"], 0.0)
        self.assertIn("retry_hint", res)
        self.assertIn("outflow_all", res["retry_hint"])
        self.assertIn("1,600.00", res["retry_hint"])

    def test_genuine_zero_has_no_retry_hint(self):
        """A truly absent thing must NOT get a misleading 'the money exists' hint."""
        res = self._call(person="keaton", flow="expense", merchant_or_text="nothing-here",
                         start_date="2024-01-01", end_date="2026-12-31")
        self.assertEqual(res["total"], 0.0)
        self.assertNotIn("retry_hint", res)

    def test_zero_matches_is_reported_as_zero_not_guessed(self):
        res = self._call(person="household", flow="expense", merchant_or_text="nonexistent")
        self.assertEqual(res["total"], 0.0)
        self.assertEqual(res["count"], 0)
        self.assertIn("$0", res["note"])


class OllamaToolLoopTests(TestCase):
    """The local model must get the same tools Claude has, and must never be the
    thing that computes a total."""

    def setUp(self):
        self.db = _fresh_db()
        self.k = User(username="keaton", email="k@e.com", hashed_password="x")
        self.kat = User(username="katherine", email="kat@e.com", hashed_password="x")
        self.db.add_all([self.k, self.kat])
        self.db.flush()
        wedding = Category(user_id=self.k.id, name="Wedding", kind="expense")
        self.db.add(wedding)
        self.db.flush()
        self.db.add(Transaction(user_id=self.k.id, category_id=wedding.id,
                                date=date(2025, 6, 1), amount=-1234.56, description="Venue"))
        self.db.commit()

    def test_tool_schema_is_translated_to_ollama_function_shape(self):
        from app.services.ai_report import _ollama_tool_schema
        from app.services.chat_tools import tool_definitions

        tools = _ollama_tool_schema(tool_definitions(["keaton", "katherine"]))
        self.assertEqual(tools[0]["type"], "function")
        fn = tools[0]["function"]
        self.assertEqual(fn["name"], "query_transactions")
        self.assertIn("properties", fn["parameters"])
        self.assertIn("outflow_all", fn["parameters"]["properties"]["flow"]["enum"])

    def test_local_model_tool_call_is_executed_and_result_fed_back(self):
        """Simulates Ollama replying with a tool call, then prose. The total in the
        answer must come from the executor, not from the model."""
        import app.services.ai_report as ai_report

        seen = []

        def fake_raw(host, model, messages, tools=None):
            seen.append((list(messages), tools))
            if len(seen) == 1:
                self.assertIsNotNone(tools)  # tools offered on the first turn
                return {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [{
                        "function": {
                            "name": "query_transactions",
                            "arguments": {
                                "person": "keaton", "flow": "expense",
                                "category": "Wedding",
                                "start_date": "2024-01-01", "end_date": "2026-12-31",
                            },
                        }
                    }],
                }
            # Second turn: the tool result is in the conversation.
            tool_msg = next(m for m in messages if m.get("role") == "tool")
            self.assertIn("1234.56", tool_msg["content"])
            return {"role": "assistant", "content": "You spent $1,234.56 on Wedding."}

        original = ai_report._ollama_chat_raw
        ai_report._ollama_chat_raw = fake_raw
        try:
            reply = ai_report._chat_with_ollama(
                "http://x", "qwen3:14b", "SYSTEM", [],
                "How much did I spend on wedding stuff in the last two years?",
                user=self.k, db=self.db,
            )
        finally:
            ai_report._ollama_chat_raw = original

        self.assertEqual(len(seen), 2)
        self.assertIn("$1,234.56", reply)

    def test_string_encoded_tool_arguments_are_parsed(self):
        """Some models emit `arguments` as a JSON string rather than an object."""
        import app.services.ai_report as ai_report

        calls = []

        def fake_raw(host, model, messages, tools=None):
            calls.append(messages)
            if len(calls) == 1:
                return {
                    "role": "assistant", "content": "",
                    "tool_calls": [{"function": {
                        "name": "query_transactions",
                        "arguments": '{"person": "keaton", "flow": "expense", "category": "Wedding"}',
                    }}],
                }
            tool_msg = next(m for m in messages if m.get("role") == "tool")
            self.assertIn("1234.56", tool_msg["content"])
            return {"role": "assistant", "content": "done"}

        original = ai_report._ollama_chat_raw
        ai_report._ollama_chat_raw = fake_raw
        try:
            ai_report._chat_with_ollama("http://x", "m", "SYS", [], "q",
                                        user=self.k, db=self.db)
        finally:
            ai_report._ollama_chat_raw = original
        self.assertEqual(len(calls), 2)

    def test_falls_back_to_plain_completion_when_tools_unsupported(self):
        import app.services.ai_report as ai_report

        def boom(host, model, messages, tools=None):
            raise ValueError("model does not support tools")

        original_raw = ai_report._ollama_chat_raw
        original_plain = ai_report._ollama_chat_call
        ai_report._ollama_chat_raw = boom
        ai_report._ollama_chat_call = lambda host, model, messages: "plain answer"
        try:
            reply = ai_report._chat_with_ollama("http://x", "m", "SYS", [], "q",
                                                user=self.k, db=self.db)
        finally:
            ai_report._ollama_chat_raw = original_raw
            ai_report._ollama_chat_call = original_plain
        self.assertEqual(reply, "plain answer")

    def test_unreachable_host_still_surfaces_as_an_error(self):
        """A dead Mongol must not be swallowed by the tools-unsupported fallback."""
        import app.services.ai_report as ai_report

        def dead(host, model, messages, tools=None):
            raise RuntimeError("Could not reach Mongol at http://x")

        original = ai_report._ollama_chat_raw
        ai_report._ollama_chat_raw = dead
        try:
            with self.assertRaises(RuntimeError):
                ai_report._chat_with_ollama("http://x", "m", "SYS", [], "q",
                                            user=self.k, db=self.db)
        finally:
            ai_report._ollama_chat_raw = original
