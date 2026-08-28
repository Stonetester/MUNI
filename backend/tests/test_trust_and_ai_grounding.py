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

    def test_named_transaction_question_counts_personal_transfers(self):
        from app.services.ai_report import _answer_named_transaction_outflow_question

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
            Transaction(
                user_id=self.kat.id,
                date=date.today() - relativedelta(months=2), amount=-999,
                description="EverBank transfer",
            ),
            Transaction(
                user_id=self.k.id, category_id=transfer.id,
                date=date.today() - relativedelta(years=3), amount=-5000,
                description="Transfer to EverBank HYSA",
            ),
        ])
        self.db.commit()

        answer = _answer_named_transaction_outflow_question(
            self.k, self.db,
            "How much money have I spent on transactions that are called EverBank in the last 2 years?",
        )

        self.assertIsNotNone(answer)
        self.assertIn("$3,650.50", answer)
        self.assertIn("2 outbound ledger transactions", answer)
        self.assertIn("includes savings/transfer rows", answer)
        self.assertIn("All matching rows came from the Google Sheets sync", answer)

    def test_put_into_named_destination_uses_raw_personal_outflows(self):
        from app.services.ai_report import _answer_named_transaction_outflow_question

        transfer = Category(user_id=self.k.id, name="Savings Transfer", kind="savings")
        self.db.add(transfer)
        self.db.flush()
        self.db.add(Transaction(
            user_id=self.k.id, category_id=transfer.id,
            date=date.today() - relativedelta(months=1), amount=-1600,
            description="everbank", import_source="sheets:AUG2026",
        ))
        self.db.commit()

        answer = _answer_named_transaction_outflow_question(
            self.k, self.db, "How much have I personally put into EverBank in the last 2 years?"
        )

        self.assertIsNotNone(answer)
        self.assertIn("$1,600.00", answer)

    def test_named_transaction_question_requires_a_time_window(self):
        from app.services.ai_report import _answer_named_transaction_outflow_question

        answer = _answer_named_transaction_outflow_question(
            self.k, self.db, "How much did I spend on transactions called EverBank?"
        )
        self.assertIsNone(answer)

    def test_named_transaction_question_uses_recent_user_time_window(self):
        from app.services.ai_report import _answer_named_transaction_outflow_question

        transfer = Category(user_id=self.k.id, name="Transfer", kind="transfer")
        self.db.add(transfer)
        self.db.flush()
        self.db.add(Transaction(
            user_id=self.k.id, category_id=transfer.id,
            date=date.today() - relativedelta(months=4), amount=-800,
            description="EverBank deposit",
        ))
        self.db.commit()

        answer = _answer_named_transaction_outflow_question(
            self.k,
            self.db,
            "How much money have I spent on transactions that are called EverBank?",
            history=[{"role": "user", "content": "Only look at the last 2 years."}],
        )

        self.assertIsNotNone(answer)
        self.assertIn("$800.00", answer)

    def test_wedding_spending_matches_description_and_category(self):
        from app.services.ai_report import _answer_ledger_question

        wedding = Category(user_id=self.k.id, name="Wedding", kind="expense")
        transfer = Category(user_id=self.k.id, name="Savings Transfer", kind="savings")
        self.db.add_all([wedding, transfer])
        self.db.flush()
        self.db.add_all([
            Transaction(
                user_id=self.k.id, category_id=wedding.id,
                date=date.today() - relativedelta(months=3), amount=-2500,
                description="Venue deposit", import_source="sheets:MAY2026",
            ),
            Transaction(
                user_id=self.k.id,
                date=date.today() - relativedelta(months=5), amount=-600,
                description="Wedding photographer", import_source="sheets:MAR2026",
            ),
            Transaction(
                user_id=self.k.id, category_id=transfer.id,
                date=date.today() - relativedelta(months=2), amount=-1000,
                description="Wedding savings", import_source="sheets:JUN2026",
            ),
        ])
        self.db.commit()

        answer = _answer_ledger_question(
            self.k, self.db,
            "How much did I spend in the last two years on wedding transactions?",
        )

        self.assertIsNotNone(answer)
        self.assertIn("Keaton spent $2,500.00", answer)
        self.assertIn("1 outbound ledger transaction", answer)
        self.assertIn('exact "wedding" category', answer)
        self.assertIn("Savings and neutral transfers are excluded", answer)

    def test_joint_wedding_spending_combines_both_people(self):
        from app.services.ai_report import _answer_ledger_question

        k_wedding = Category(user_id=self.k.id, name="Wedding", kind="expense")
        kat_wedding = Category(user_id=self.kat.id, name="Wedding", kind="expense")
        self.db.add_all([k_wedding, kat_wedding])
        self.db.flush()
        self.db.add_all([
            Transaction(
                user_id=self.k.id, category_id=k_wedding.id,
                date=date.today() - relativedelta(months=2), amount=-1200,
                description="Wedding venue", import_source="sheets:JUN2026",
            ),
            Transaction(
                user_id=self.kat.id, category_id=kat_wedding.id,
                date=date.today() - relativedelta(months=1), amount=-800,
                description="Wedding flowers", import_source="sheets:JUL2026",
            ),
        ])
        self.db.commit()

        answer = _answer_ledger_question(
            self.k, self.db,
            "How much did me and Katherine spend on wedding transactions in the last 2 years?",
        )

        self.assertIsNotNone(answer)
        self.assertIn("Keaton and Katherine combined spent $2,000.00", answer)
        self.assertIn("Keaton $1,200.00", answer)
        self.assertIn("Katherine $800.00", answer)

    def test_total_followup_inherits_solo_wedding_subject_and_uses_year_range(self):
        from app.services.ai_report import _answer_ledger_question

        wedding = Category(user_id=self.k.id, name="Wedding", kind="expense")
        self.db.add(wedding)
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.k.id, category_id=wedding.id, date=date(2024, 6, 1), amount=-400, description="Venue"),
            Transaction(user_id=self.k.id, category_id=wedding.id, date=date(2025, 6, 1), amount=-600, description="Photos"),
            Transaction(user_id=self.kat.id, date=date(2025, 7, 1), amount=-999, description="Wedding item"),
        ])
        self.db.commit()

        answer = _answer_ledger_question(
            self.k,
            self.db,
            "what is the total from 2024-2026",
            history=[{"role": "user", "content": "How much did I spend on wedding transactions?"}],
            joint=False,
        )

        self.assertIsNotNone(answer)
        self.assertIn("Keaton spent $1,000.00", answer)
        self.assertIn("2024 through 2026", answer)
        self.assertNotIn("$999.00", answer)

    def test_breakout_followup_lists_inherited_transactions(self):
        from app.services.ai_report import _answer_ledger_question

        wedding = Category(user_id=self.k.id, name="Wedding", kind="expense")
        self.db.add(wedding)
        self.db.flush()
        self.db.add(Transaction(
            user_id=self.k.id, category_id=wedding.id,
            date=date(2025, 8, 1), amount=-750,
            description="Venue Deposit", import_source="sheets:AUG2025",
        ))
        self.db.commit()

        answer = _answer_ledger_question(
            self.k,
            self.db,
            "break out the transactions so i know what all is adding up to that sum",
            history=[
                {"role": "user", "content": "How much did I spend on wedding transactions?"},
                {"role": "assistant", "content": "prior answer"},
                {"role": "user", "content": "what is the total from 2024-2026"},
            ],
            joint=False,
        )

        self.assertIsNotNone(answer)
        self.assertIn("| 2025-08-01 | Keaton | Venue Deposit | Wedding | $750.00 |", answer)
        self.assertIn("**Total: $750.00 across 1 transactions.**", answer)

    def test_contributed_to_destination_uses_raw_ledger_and_explicit_year_range(self):
        from app.services.ai_report import _answer_ledger_question

        transfer = Category(user_id=self.k.id, name="Savings Transfer", kind="savings")
        self.db.add(transfer)
        self.db.flush()
        self.db.add_all([
            Transaction(
                user_id=self.k.id, category_id=transfer.id,
                date=date(2025, 9, 22), amount=-1600,
                description="everbank", import_source="sheets:SEP2025",
            ),
            Transaction(
                user_id=self.k.id, category_id=transfer.id,
                date=date(2026, 1, 14), amount=-1700,
                description="Everbank", import_source="sheets:JAN2026",
            ),
        ])
        self.db.commit()

        answer = _answer_ledger_question(
            self.k,
            self.db,
            "How much did I contribute to Everbank from 2024-2026 total",
            joint=False,
        )

        self.assertIsNotNone(answer)
        self.assertIn("Keaton contributed $3,300.00", answer)
        self.assertIn("2024 through 2026", answer)
        self.assertIn("All matching rows came from the Google Sheets sync", answer)
