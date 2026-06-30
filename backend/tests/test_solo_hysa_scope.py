"""Regression test for the solo-mode joint-HYSA contribution scope fix.

Bug: in the per-individual (solo) forecast, a joint HYSA's contribution was measured
from BOTH partners' EverBank deposits (~$3,000/mo) while only the logged-in user's cash
outflow left checking (~$1,500/mo) -> solo net worth inflated by the partner's half.

Fix: `run_forecast` passes `solo_hysa_user_id=user.id` so a joint HYSA is measured from
only the logged-in user's deposits in solo mode. `run_joint_forecast` keeps both.
"""
from datetime import date
from unittest import TestCase

from dateutil.relativedelta import relativedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 - registers all model tables
from app.database import Base
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.services.forecasting import run_forecast, run_joint_forecast


class SoloHysaScopeTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()

        # Two household users.
        self.keaton = User(username="keaton", email="k@example.com", hashed_password="x")
        self.kath = User(username="kath", email="kat@example.com", hashed_password="x")
        self.db.add_all([self.keaton, self.kath])
        self.db.flush()

        # A joint HYSA owned by Keaton, joint with Katherine.
        self.hysa = Account(
            user_id=self.keaton.id, name="EverBank", account_type="hysa",
            balance=10000, is_joint=True, joint_user_id=self.kath.id,
        )
        # Each user needs a checking account / something so the forecast runs.
        self.db.add_all([
            self.hysa,
            Account(user_id=self.keaton.id, name="K Checking", account_type="checking", balance=2000),
            Account(user_id=self.kath.id, name="Kat Checking", account_type="checking", balance=2000),
        ])
        self.db.flush()

        # Savings-kind category per user (the kind the HYSA measurement looks for).
        self.k_cat = Category(user_id=self.keaton.id, name="Savings Transfer", kind="savings")
        self.kat_cat = Category(user_id=self.kath.id, name="Savings Transfer", kind="savings")
        self.db.add_all([self.k_cat, self.kat_cat])
        self.db.flush()

        # Each user deposits into the HYSA every completed month for the last 6 months:
        # Keaton $1,500/mo, Katherine $1,500/mo -> joint $3,000/mo, solo-Keaton $1,500/mo.
        today = date.today()
        first_of_month = today.replace(day=1)
        for i in range(1, 7):  # last 6 completed months
            mday = (first_of_month - relativedelta(months=i)).replace(day=10)
            self.db.add(Transaction(
                user_id=self.keaton.id, category_id=self.k_cat.id, date=mday,
                amount=-1500.0, description="EverBank deposit",
            ))
            self.db.add(Transaction(
                user_id=self.kath.id, category_id=self.kat_cat.id, date=mday,
                amount=-1500.0, description="EverBank deposit",
            ))
        self.db.commit()

    def _hysa_contrib(self, resp):
        rows = [af for af in resp.account_forecasts if af.account_id == self.hysa.id]
        self.assertEqual(len(rows), 1, "HYSA should appear exactly once")
        return rows[0]

    def test_solo_forecast_uses_only_logged_in_users_half(self):
        resp = run_forecast(self.keaton, self.db, scenario_id=None, months=12)
        af = self._hysa_contrib(resp)
        # Solo Keaton: only his $1,500/mo deposits, not the joint $3,000.
        self.assertAlmostEqual(af.monthly_contribution, 1500.0, places=2)
        self.assertEqual(af.contribution_source, "measured")

    def test_joint_forecast_sums_both_partners(self):
        resp = run_joint_forecast(self.db, months=12)
        af = self._hysa_contrib(resp)
        # Joint: both partners' deposits summed once -> $3,000/mo.
        self.assertAlmostEqual(af.monthly_contribution, 3000.0, places=2)
        self.assertEqual(af.contribution_source, "measured")
