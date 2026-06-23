"""Tests for measured HYSA contributions (real EverBank deposits vs manual fallback)."""
from datetime import date
from unittest import TestCase

from dateutil.relativedelta import relativedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 - registers all model tables
from app.database import Base
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.services.hysa_contributions import (
    hysa_contribution_for_account,
    is_hysa_transfer,
    measured_hysa_contributions,
)


class HysaContributionTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()

        self.keaton = User(username="keaton", email="k@example.com", hashed_password="x")
        self.kat = User(username="katherine", email="kat@example.com", hashed_password="x")
        self.db.add_all([self.keaton, self.kat])
        self.db.flush()

        # Each user has a savings-kind category that EverBank deposits land in.
        self.k_sav = Category(user_id=self.keaton.id, name="Savings Transfer", kind="savings")
        self.kat_sav = Category(user_id=self.kat.id, name="Savings Transfer", kind="savings")
        # A non-savings category to prove the filter excludes it.
        self.k_exp = Category(user_id=self.keaton.id, name="Groceries", kind="expense")
        self.db.add_all([self.k_sav, self.kat_sav, self.k_exp])
        self.db.flush()

    def _deposit(self, user, cat, months_ago, amount, desc="Everbank"):
        d = (date.today().replace(day=15) - relativedelta(months=months_ago))
        self.db.add(Transaction(
            user_id=user.id, category_id=cat.id, date=d,
            amount=amount, description=desc,
        ))

    def test_keyword_detection(self):
        self.assertTrue(is_hysa_transfer("Everbank"))
        self.assertTrue(is_hysa_transfer("monthly HYSA deposit"))
        self.assertTrue(is_hysa_transfer("ever bank transfer"))
        self.assertFalse(is_hysa_transfer("Groceries"))
        self.assertFalse(is_hysa_transfer(None))

    def test_both_partners_summed_once(self):
        # Each partner deposits ~$1,600 in each of the last 3 completed months.
        for m in (1, 2, 3):
            self._deposit(self.keaton, self.k_sav, m, -1600)
            self._deposit(self.kat, self.kat_sav, m, -1700)
        self.db.flush()

        res = measured_hysa_contributions(
            self.db, [self.keaton.id, self.kat.id], lookback_months=6
        )
        # 3 months had deposits, each month total = 1600 + 1700 = 3300.
        self.assertEqual(res["n_completed_months_with_deposits"], 3)
        # avg over 6 completed months = (3300*3) / 6 = 1650.
        self.assertAlmostEqual(res["avg_monthly"], 1650.0, places=2)
        self.assertEqual(res["n_transactions"], 6)

    def test_skipped_month_drags_average_down(self):
        # Deposit only in month 1 and 3 (month 2 skipped).
        self._deposit(self.keaton, self.k_sav, 1, -1600)
        self._deposit(self.keaton, self.k_sav, 3, -1600)
        self.db.flush()
        res = measured_hysa_contributions(self.db, [self.keaton.id], lookback_months=6)
        self.assertEqual(res["n_completed_months_with_deposits"], 2)
        # (1600 + 0 + 1600 + 0 + 0 + 0) / 6 = 533.33
        self.assertAlmostEqual(res["avg_monthly"], round(3200 / 6, 2), places=1)

    def test_current_month_zero_until_deposit(self):
        # Past deposits exist, but nothing this month yet.
        self._deposit(self.keaton, self.k_sav, 1, -1600)
        self.db.flush()
        res = measured_hysa_contributions(self.db, [self.keaton.id])
        self.assertEqual(res["current_month"], 0.0)

        # Now add a current-month deposit (this month, day 5).
        d = date.today().replace(day=5)
        self.db.add(Transaction(
            user_id=self.keaton.id, category_id=self.k_sav.id, date=d,
            amount=-1600, description="Everbank",
        ))
        self.db.flush()
        res2 = measured_hysa_contributions(self.db, [self.keaton.id])
        self.assertAlmostEqual(res2["current_month"], 1600.0, places=2)

    def test_non_hysa_savings_excluded(self):
        # A savings-kind transfer that is NOT an EverBank deposit must not count.
        self._deposit(self.keaton, self.k_sav, 1, -500, desc="Roth IRA")
        self.db.flush()
        res = measured_hysa_contributions(self.db, [self.keaton.id])
        self.assertFalse(res["has_data"])

    def test_manual_fallback_only_when_no_data(self):
        # No deposits → manual fallback used and clearly labeled.
        out = hysa_contribution_for_account(self.db, [self.keaton.id], manual_fallback=1600)
        self.assertEqual(out["source"], "manual_fallback")
        self.assertEqual(out["avg_monthly"], 1600.0)
        self.assertEqual(out["current_month"], 0.0)

        # With real deposits, measured wins over the manual value.
        self._deposit(self.keaton, self.k_sav, 1, -1600)
        self.db.flush()
        out2 = hysa_contribution_for_account(self.db, [self.keaton.id], manual_fallback=9999)
        self.assertEqual(out2["source"], "measured")
        self.assertNotEqual(out2["avg_monthly"], 9999)

    def test_no_source_at_all(self):
        out = hysa_contribution_for_account(self.db, [self.keaton.id], manual_fallback=None)
        self.assertEqual(out["source"], "none")
        self.assertEqual(out["avg_monthly"], 0.0)
