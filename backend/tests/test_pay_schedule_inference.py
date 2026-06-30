"""Pay-frequency inference — semi-monthly must not be misread as biweekly.

Real ACEC pay lands on two fixed days a month (e.g. 7th & 22nd). The gaps are ~15 days,
which a naive gap-median threshold maps to biweekly (26 pays/yr) and overstates the
monthly 401k contribution by ~8%. The day-of-month cluster signal disambiguates it.
"""
from datetime import date
from unittest import TestCase

from dateutil.relativedelta import relativedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.database import Base
from app.models.paystub import Paystub
from app.models.user import User
from app.services.forecasting import _infer_pay_schedule


class PayScheduleInferenceTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.user = User(username="k", email="k@e.com", hashed_password="x")
        self.db.add(self.user)
        self.db.flush()

    def _add(self, d: date):
        self.db.add(Paystub(
            user_id=self.user.id, pay_date=d, pay_type="regular",
            net_pay=3500.0, deduction_401k=380.0, employer_401k=327.34,
        ))

    def test_semi_monthly_on_7th_and_22nd_not_biweekly(self):
        # 12 months of 7th & 22nd pays — gaps alternate ~15/~15, two DOM clusters.
        for i in range(12):
            m = date(2026, 1, 1) - relativedelta(months=i)
            self._add(m.replace(day=7))
            self._add(m.replace(day=22))
        self.db.commit()
        sch = _infer_pay_schedule(self.user.id, self.db)
        self.assertEqual(sch["frequency"], "semi_monthly")

    def test_true_biweekly_stays_biweekly(self):
        # Every 14 days from an anchor — DOM drifts across the calendar.
        d = date(2026, 1, 2)
        for _ in range(14):
            self._add(d)
            d = d - relativedelta(days=14)
        self.db.commit()
        sch = _infer_pay_schedule(self.user.id, self.db)
        self.assertEqual(sch["frequency"], "biweekly")

    def test_monthly_stays_monthly(self):
        for i in range(6):
            self._add((date(2026, 1, 15) - relativedelta(months=i)))
        self.db.commit()
        sch = _infer_pay_schedule(self.user.id, self.db)
        self.assertEqual(sch["frequency"], "monthly")
