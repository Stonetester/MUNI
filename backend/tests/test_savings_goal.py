"""Savings goal = net cash (income - expenses); contributions are a separate section."""
from datetime import date
from unittest import TestCase

from dateutil.relativedelta import relativedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 - registers all model tables
from app.database import Base
from app.models.category import Category
from app.models.financial_profile import FinancialProfile
from app.models.transaction import Transaction
from app.models.user import User
from app.services.savings_goal import compute_savings_goals


class SavingsGoalTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()

        self.k = User(username="keaton", email="k@e.com", hashed_password="x")
        self.kat = User(username="katherine", email="kat@e.com", hashed_password="x")
        self.db.add_all([self.k, self.kat])
        self.db.flush()

        # Categories per user.
        self.cats = {}
        for u in (self.k, self.kat):
            self.cats[(u.id, "income")] = Category(user_id=u.id, name="Salary", kind="income")
            self.cats[(u.id, "expense")] = Category(user_id=u.id, name="Groceries", kind="expense")
            self.cats[(u.id, "savings")] = Category(user_id=u.id, name="Savings Transfer", kind="savings")
        self.db.add_all(self.cats.values())
        self.db.flush()

        # Keaton: $5,000 income, $3,000 expense THIS month -> net cash 2,000.
        today = date.today().replace(day=10)
        self.db.add_all([
            Transaction(user_id=self.k.id, category_id=self.cats[(self.k.id, "income")].id,
                        date=today, amount=5000, description="Salary"),
            Transaction(user_id=self.k.id, category_id=self.cats[(self.k.id, "expense")].id,
                        date=today, amount=-3000, description="Groceries"),
            # An EverBank deposit this month (savings) — must NOT reduce net cash.
            Transaction(user_id=self.k.id, category_id=self.cats[(self.k.id, "savings")].id,
                        date=today, amount=-1600, description="Everbank"),
        ])
        # Past EverBank deposits for both partners (measured HYSA).
        for m in (1, 2, 3):
            d = date.today().replace(day=15) - relativedelta(months=m)
            self.db.add(Transaction(user_id=self.k.id, category_id=self.cats[(self.k.id, "savings")].id,
                                    date=d, amount=-1600, description="Everbank"))
            self.db.add(Transaction(user_id=self.kat.id, category_id=self.cats[(self.kat.id, "savings")].id,
                                    date=d, amount=-1700, description="Everbank"))

        self.db.add(FinancialProfile(user_id=self.k.id, ira_monthly_contribution=450,
                                     monthly_savings_goal=1500))
        self.db.flush()

    def test_goal_measured_against_net_cash_not_total(self):
        d = compute_savings_goals(self.db, self.k, joint=True)
        keaton = next(p for p in d["people"] if p["user_id"] == self.k.id)
        # net cash = 5000 - 3000 = 2000 (the EverBank savings transfer is excluded).
        self.assertEqual(keaton["net_saved"], 2000.0)
        # Goal is the profile goal 1500; progress measured vs net cash (2000 >= 1500).
        self.assertEqual(keaton["goal"], 1500.0)
        self.assertTrue(keaton["on_track"])
        self.assertAlmostEqual(keaton["pct_of_goal"], round(2000 / 1500 * 100, 1), places=1)
        # remaining is vs net cash, so 0 (already over).
        self.assertEqual(keaton["remaining"], 0.0)

    def test_contributions_are_separate_and_hysa_is_joint(self):
        d = compute_savings_goals(self.db, self.k, joint=True)
        keaton = next(p for p in d["people"] if p["user_id"] == self.k.id)
        c = keaton["contributions"]
        self.assertEqual(c["hysa_source"], "measured")
        self.assertTrue(c["hysa_is_joint"])
        # Per-person HYSA × 2 people == measured joint total. Combined avg over 6 completed
        # months = (3300 * 3) / 6 = 1650; per person = 825.
        self.assertAlmostEqual(c["hysa"], 825.0, places=2)
        # IRA from profile flows through.
        self.assertEqual(c["ira"], 450.0)

    def test_hysa_not_double_counted_across_people(self):
        d = compute_savings_goals(self.db, self.k, joint=True)
        per_person_hysa = [p["contributions"]["hysa"] for p in d["people"]]
        # Sum of per-person HYSA equals the measured joint combined value (1650).
        self.assertAlmostEqual(sum(per_person_hysa), 1650.0, places=1)

    def test_contributions_history_present(self):
        d = compute_savings_goals(self.db, self.k, joint=True)
        keaton = next(p for p in d["people"] if p["user_id"] == self.k.id)
        self.assertEqual(len(keaton["contributions_history"]), 6)
        self.assertIn("total", keaton["contributions_history"][0])
        # Joint history is the month-by-month sum of both people.
        self.assertEqual(len(d["joint"]["contributions_history"]), 6)

    def test_joint_goal_and_progress_use_net_cash(self):
        d = compute_savings_goals(self.db, self.k, joint=True)
        j = d["joint"]
        # Joint net cash = Keaton 2000 + Katherine 0 = 2000.
        self.assertEqual(j["net_saved"], 2000.0)
        # Joint goal = sum of each person's goal.
        expected_goal = sum(p["goal"] for p in d["people"])
        self.assertEqual(j["goal"], expected_goal)
