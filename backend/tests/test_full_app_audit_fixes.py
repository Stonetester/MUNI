"""Regression tests for the 2026-07-03 full-app audit fixes:

- Statement import: period/employer contributions survive the parse -> apply path
  (UI uploads used to save NULL contributions, silently dropping snapshots out of
  the XIRR return window), and a re-upload backfills a NULL-contribution snapshot.
- Employer 401k match: measured statement employer_contributions beat the manual
  percent fallback (savings-goal card), and the FORECAST 401k contribution no longer
  omits the employer match for people whose paystubs don't print it (Katherine).
- /financial-profile/infer-salary: semi-monthly earners are no longer classified
  bi-weekly (which overstated annual salary by ~8%), and averages skip NULL rows.
- /savings-goal: the `joint` query param is honored (joint=False -> only the
  caller's block), while the joint roll-up always spans the whole household.
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
from app.models.financial_profile import FinancialProfile
from app.models.paystub import Paystub
from app.models.user import User
from app.services.savings_goal import _k401_monthly, compute_savings_goals
from app.services.statement_apply import apply_parsed_statement
from app.services.statement_parser import _sum_employer_contributions


def _fresh_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _semi_monthly_stubs(db, uid, ee401k, er401k, gross, months=6):
    first = date.today().replace(day=1)
    for i in range(months):
        m = first - relativedelta(months=i)
        for day in (7, 22):
            db.add(Paystub(
                user_id=uid, pay_date=m.replace(day=day), pay_type="regular",
                net_pay=gross - 800, gross_pay=gross,
                deduction_401k=ee401k, employer_401k=er401k,
                period_start=m.replace(day=1 if day == 7 else 16),
                period_end=m.replace(day=15 if day == 7 else 28),
            ))
    db.commit()


class StatementContributionsTests(TestCase):
    def setUp(self):
        self.db = _fresh_db()
        self.u = User(username="k", email="k@e.com", hashed_password="x")
        self.db.add(self.u)
        self.db.flush()
        self.acc = Account(user_id=self.u.id, name="401k", account_type="401k", balance=0)
        self.db.add(self.acc)
        self.db.commit()

    def test_apply_persists_contributions_and_employer_split(self):
        apply_parsed_statement(
            self.db, self.u, self.acc.id, "2026-03-31", 10000.0, [],
            contributions=1200.0, employer_contributions=400.0,
        )
        snap = self.db.query(BalanceSnapshot).one()
        self.assertEqual(snap.contributions, 1200.0)
        self.assertEqual(snap.employer_contributions, 400.0)

    def test_parser_splits_employer_contributions(self):
        fidelity = "Your Contributions $800.00\nEmployer Contributions $400.00\n"
        self.assertEqual(_sum_employer_contributions(fidelity, "Fidelity"), 400.0)
        jh = "EE ELECTIVE DEFERRAL 760.00 4,560.00\nSAFE HARBOR NON-ELECTIVE CONTR 654.68 3,928.08\n"
        self.assertEqual(_sum_employer_contributions(jh, "John Hancock"), 654.68)
        # Schwab/EverBank don't itemize employer money -> None, not 0
        self.assertIsNone(_sum_employer_contributions("Deposits 375.00 675.00", "Schwab"))

    def test_snapshot_reupload_backfills_null_contributions(self):
        from app.routers.balance_snapshots import create_balance_snapshot
        from app.schemas.balance_snapshot import BalanceSnapshotCreate

        # Original UI-era save: no contributions recorded.
        self.db.add(BalanceSnapshot(account_id=self.acc.id, date=date(2026, 3, 31), balance=10000.0))
        self.db.commit()
        out = create_balance_snapshot(
            BalanceSnapshotCreate(
                account_id=self.acc.id, date=date(2026, 3, 31), balance=10000.0,
                contributions=1200.0, employer_contributions=400.0,
            ),
            current_user=self.u, db=self.db,
        )
        self.assertEqual(out.contributions, 1200.0)
        self.assertEqual(out.employer_contributions, 400.0)
        self.assertEqual(self.db.query(BalanceSnapshot).count(), 1)  # still deduped


class MeasuredEmployerMatchTests(TestCase):
    """Katherine-style: no employer match on the stub. Statement-measured employer
    contributions must beat the manual percent, in BOTH the savings-goal card and
    the forecast contribution config."""

    def setUp(self):
        self.db = _fresh_db()
        self.u = User(username="katherine", email="kat@e.com", hashed_password="x")
        self.db.add(self.u)
        self.db.flush()
        self.acc = Account(user_id=self.u.id, name="Fidelity 401k", account_type="401k", balance=12000)
        self.db.add(self.acc)
        self.db.flush()
        _semi_monthly_stubs(self.db, self.u.id, ee401k=192.94, er401k=0.0, gross=3215.62)
        # Quarterly statements with employer split recorded: $786/quarter = $262/mo.
        today = date.today()
        for months_ago, contrib, er in ((9, 2400.0, 786.0), (6, 2400.0, 786.0), (3, 2400.0, 786.0), (0, 2400.0, 786.0)):
            self.db.add(BalanceSnapshot(
                account_id=self.acc.id, date=today - relativedelta(months=months_ago),
                balance=10000 + (9 - months_ago) * 900,
                contributions=contrib, employer_contributions=er,
            ))
        self.prof = FinancialProfile(
            user_id=self.u.id, pay_frequency="semi_monthly",
            employer_401k_percent=3.0, gross_annual_salary=None,
        )
        self.db.add(self.prof)
        self.db.commit()

    def test_savings_goal_prefers_measured_statement_employer(self):
        _, er = _k401_monthly(self.prof, self.db, self.u.id)
        # Measured pace ~$262/mo, NOT 3% x paystub salary (= $192.94).
        self.assertGreater(er, 230.0)
        self.assertLess(er, 300.0)

    def test_forecast_401k_contribution_includes_employer_estimate(self):
        from app.services.forecasting import _build_compound_account_config
        _, contrib, _, _ = _build_compound_account_config([self.acc], self.db, self.u.id)
        ee_monthly = 192.94 * 2  # employee side from stubs
        # Before the fix the forecast used the employee side alone.
        self.assertGreater(contrib[self.acc.id], ee_monthly + 100.0)

    def test_forecast_falls_back_to_percent_without_statements(self):
        self.db.query(BalanceSnapshot).delete()
        self.db.commit()
        from app.services.forecasting import _build_compound_account_config
        _, contrib, _, _ = _build_compound_account_config([self.acc], self.db, self.u.id)
        ee_monthly = 192.94 * 2
        expected_er = 0.03 * (3215.62 * 2)  # 3% x paystub monthly salary
        self.assertAlmostEqual(contrib[self.acc.id], ee_monthly + expected_er, delta=2.0)


class InferSalaryTests(TestCase):
    def setUp(self):
        self.db = _fresh_db()
        self.u = User(username="k", email="k@e.com", hashed_password="x")
        self.db.add(self.u)
        self.db.flush()

    def test_semi_monthly_not_misread_as_biweekly(self):
        # Semi-monthly: 24 pays/yr on fixed days (7th/22nd); 14-15 day periods used to
        # classify as bi_weekly -> annual = gross x 26 (an ~8% overstatement).
        _semi_monthly_stubs(self.db, self.u.id, ee401k=380.0, er401k=327.34, gross=5455.63)
        from app.routers.financial_profile import infer_salary_from_paystubs
        out = infer_salary_from_paystubs(limit=6, current_user=self.u, db=self.db)
        self.assertEqual(out["pay_frequency"], "semi_monthly")
        self.assertEqual(out["periods_per_year"], 24)
        self.assertAlmostEqual(out["gross_annual_salary"], 5455.63 * 24, delta=1.0)

    def test_null_rows_do_not_crash_or_skew_averages(self):
        _semi_monthly_stubs(self.db, self.u.id, ee401k=0.0, er401k=0.0, gross=5000.0, months=2)
        # A NULL-numeric row (the class of bug that blanked the paystub list).
        self.db.add(Paystub(user_id=self.u.id, pay_date=date.today(), pay_type="regular",
                            net_pay=None, gross_pay=None))
        self.db.commit()
        from app.routers.financial_profile import infer_salary_from_paystubs
        out = infer_salary_from_paystubs(limit=10, current_user=self.u, db=self.db)
        # Average must come from the 4 real stubs only — not divided by 5.
        self.assertAlmostEqual(out["avg_gross_per_paycheck"], 5000.0, delta=0.5)


class SavingsGoalJointParamTests(TestCase):
    def setUp(self):
        self.db = _fresh_db()
        self.k = User(username="keaton", email="k@e.com", hashed_password="x")
        self.kat = User(username="katherine", email="kat@e.com", hashed_password="x")
        self.db.add_all([self.k, self.kat])
        self.db.commit()

    def test_joint_false_returns_only_current_user(self):
        out = compute_savings_goals(self.db, self.k, joint=False)
        self.assertEqual([p["user_id"] for p in out["people"]], [self.k.id])
        self.assertEqual(out["current_user_id"], self.k.id)
        self.assertIn("joint", out)  # household roll-up still present

    def test_joint_true_returns_everyone(self):
        out = compute_savings_goals(self.db, self.k, joint=True)
        self.assertEqual({p["user_id"] for p in out["people"]}, {self.k.id, self.kat.id})
