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
