"""Recent-pace contribution estimates.

The future contribution estimate must reflect the RECENT pace, not an old
high-contribution stretch the user has since cut back from.

- 401k: recent paystubs (employee + employer) win.
- Other investment accounts: average only the recent statement window.
- The all-time (lifetime) statement average is surfaced separately for display, never
  used to project.
"""
from datetime import date
from unittest import TestCase

from dateutil.relativedelta import relativedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 - registers all model tables
from app.database import Base
from app.models.account import Account
from app.models.balance_snapshot import BalanceSnapshot
from app.models.paystub import Paystub
from app.models.user import User
from app.services.forecasting import run_forecast


class RecentContributionEstimateTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()

        self.user = User(username="keaton", email="k@example.com", hashed_password="x")
        self.db.add(self.user)
        self.db.flush()

        self.k401 = Account(
            user_id=self.user.id, name="401k JH", account_type="401k", balance=60000,
        )
        self.db.add_all([
            self.k401,
            Account(user_id=self.user.id, name="Checking", account_type="checking", balance=2000),
        ])
        self.db.flush()

        today = date.today()

        # Statement snapshots: OLD periods contributed HIGH (~$2,500/mo), so a lifetime
        # average would project ~$2,500/mo. We record 8 quarterly snapshots over 2 years.
        # Each snapshot's `contributions` is the amount contributed that quarter.
        for i in range(8, 0, -1):  # 8 quarters ago .. last quarter
            d = (today.replace(day=28) - relativedelta(months=3 * i))
            self.db.add(BalanceSnapshot(
                account_id=self.k401.id, date=d,
                balance=20000 + (8 - i) * 6000, contributions=7500.0,  # ~$2,500/mo
            ))

        # Recent paystubs: contribution has been CUT to $400 employee + $300 employer
        # per check, semi-monthly -> ~$1,400/mo (much lower than the $2,500 lifetime).
        first_of_month = today.replace(day=1)
        for i in range(6):
            for dom in (5, 20):  # semi-monthly
                pd = (first_of_month - relativedelta(months=i)).replace(day=dom)
                if pd >= today:
                    continue
                self.db.add(Paystub(
                    user_id=self.user.id, pay_date=pd, pay_type="regular",
                    net_pay=3500.0, deduction_401k=400.0, employer_401k=300.0,
                ))
        self.db.commit()

    def _k401_forecast(self):
        resp = run_forecast(self.user, self.db, scenario_id=None, months=12)
        rows = [af for af in resp.account_forecasts if af.account_id == self.k401.id]
        self.assertEqual(len(rows), 1)
        return rows[0]

    def test_401k_uses_recent_paystub_rate_not_lifetime(self):
        af = self._k401_forecast()
        # Source must be the recent paystubs, not the statement lifetime average.
        self.assertEqual(af.contribution_source, "paystub")
        # $700/check (400 employee + 300 employer). The monthly figure is per-check ×
        # inferred pay frequency (2 semi-monthly / ~2.17 biweekly) -> ~$1,400-$1,517,
        # and crucially well BELOW the ~$2,500/mo lifetime statement average.
        self.assertGreater(af.monthly_contribution, 1300.0)
        self.assertLess(af.monthly_contribution, 1600.0)
        self.assertLess(af.monthly_contribution, af.lifetime_monthly_contribution)

    def test_lifetime_average_is_surfaced_separately(self):
        af = self._k401_forecast()
        # Lifetime figure is present and clearly HIGHER than the projected recent rate,
        # but it is informational only — the projection used the paystub rate above.
        self.assertIsNotNone(af.lifetime_monthly_contribution)
        self.assertGreater(af.lifetime_monthly_contribution, 2000.0)
        self.assertIn("informational", af.lifetime_contribution_basis)
        self.assertNotAlmostEqual(
            af.monthly_contribution, af.lifetime_monthly_contribution, delta=100.0
        )
