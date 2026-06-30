"""Round-2 accuracy fixes:
- Employer 401k match: from paystubs when present (Keaton-style), else
  employer_401k_percent x paystub-derived salary (Katherine-style).
- Foresight: savings-kind outflows are not shown as expenses (still roll cash).
- Paid-off liability (student loan at $0): payments stop being projected.
- HYSA forward figure uses the recent (3-month) average, not the 6-month mean.
"""
from datetime import date
from unittest import TestCase

from dateutil.relativedelta import relativedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.database import Base
from app.models.account import Account
from app.models.category import Category
from app.models.financial_profile import FinancialProfile
from app.models.paystub import Paystub
from app.models.transaction import Transaction
from app.models.user import User
from app.services.forecasting import run_forecast
from app.services.savings_goal import _k401_monthly


def _semi_monthly_stub(uid, d, ee401k, er401k, gross):
    return Paystub(
        user_id=uid, pay_date=d, pay_type="regular", net_pay=gross - 800,
        gross_pay=gross, deduction_401k=ee401k, employer_401k=er401k,
    )


class EmployerMatchTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.u = User(username="k", email="k@e.com", hashed_password="x")
        self.db.add(self.u)
        self.db.flush()

    def _stubs(self, ee, er, gross):
        first = date.today().replace(day=1)
        for i in range(6):
            m = first - relativedelta(months=i)
            self.db.add(_semi_monthly_stub(self.u.id, m.replace(day=7), ee, er, gross))
            self.db.add(_semi_monthly_stub(self.u.id, m.replace(day=22), ee, er, gross))
        self.db.commit()

    def test_employer_match_from_paystub_when_present(self):
        # Keaton-style: employer match printed on the stub.
        self._stubs(ee=380.0, er=327.34, gross=5482.06)
        prof = FinancialProfile(user_id=self.u.id, pay_frequency="semi_monthly")
        self.db.add(prof)
        self.db.commit()
        ee, er = _k401_monthly(prof, self.db, self.u.id)
        self.assertAlmostEqual(ee, 760.0, delta=1.0)       # 380 x 2
        self.assertAlmostEqual(er, 654.68, delta=1.0)      # 327.34 x 2

    def test_employer_match_from_percent_of_paystub_salary_when_absent(self):
        # Katherine-style: NO employer match on stub; use percent x paystub salary.
        self._stubs(ee=192.94, er=0.0, gross=3215.62)
        prof = FinancialProfile(
            user_id=self.u.id, pay_frequency="semi_monthly",
            employer_401k_percent=3.0, gross_annual_salary=None,  # stale/empty on purpose
        )
        self.db.add(prof)
        self.db.commit()
        ee, er = _k401_monthly(prof, self.db, self.u.id)
        self.assertAlmostEqual(ee, 385.88, delta=1.0)      # 192.94 x 2
        # 3% of monthly salary (3215.62 x 2 = 6431.24) = 192.94, NOT $0 from None gross.
        self.assertAlmostEqual(er, 192.94, delta=1.0)
        self.assertGreater(er, 0.0)


class ForecastExclusionTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.u = User(username="k", email="k@e.com", hashed_password="x")
        self.db.add(self.u)
        self.db.flush()
        self.db.add(Account(user_id=self.u.id, name="Checking", account_type="checking", balance=5000))
        # Paid-off student loan (balance 0)
        self.db.add(Account(user_id=self.u.id, name="Student loan", account_type="student_loan", balance=0))
        self.income = Category(user_id=self.u.id, name="Salary", kind="income")
        self.rent = Category(user_id=self.u.id, name="Rent", kind="expense")
        self.sl = Category(user_id=self.u.id, name="Student Loans", kind="expense")
        self.sv = Category(user_id=self.u.id, name="Savings Transfer", kind="savings")
        self.db.add_all([self.income, self.rent, self.sl, self.sv])
        self.db.flush()
        d = date.today() - relativedelta(months=1)
        for m in range(1, 7):
            md = (date.today().replace(day=15) - relativedelta(months=m))
            self.db.add_all([
                Transaction(user_id=self.u.id, category_id=self.income.id, date=md, amount=4000, description="pay"),
                Transaction(user_id=self.u.id, category_id=self.rent.id, date=md, amount=-1200, description="rent"),
                Transaction(user_id=self.u.id, category_id=self.sl.id, date=md, amount=-700, description="loan pmt"),
                Transaction(user_id=self.u.id, category_id=self.sv.id, date=md, amount=-1000, description="everbank"),
            ])
        self.db.commit()

    def test_student_loan_and_savings_not_in_displayed_expenses(self):
        resp = run_forecast(self.u, self.db, scenario_id=None, months=3)
        bc = resp.points[0].by_category
        self.assertNotIn("Student Loans", bc)     # paid off -> not projected
        self.assertNotIn("Savings Transfer", bc)  # saved, not spent
        self.assertIn("Rent", bc)                 # real expense stays
        # Displayed expenses ~ rent only (~1200), not rent + loan + savings (~2900).
        self.assertLess(resp.points[0].expenses, 1500)
