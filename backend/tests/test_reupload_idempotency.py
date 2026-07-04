"""Bulk re-upload safety: re-importing statements and paystubs must never
duplicate data, and must ENRICH existing records when the new parse carries
more (contributions/employer split, holdings, fields the parser used to miss).

- /statements/apply: re-import is an enrich (was a 409 reject) — balance
  refreshed, contributions backfilled, holdings reconciled; still one snapshot
  per account+date; a None from the parse never erases stored data.
- POST /paystubs: dedup is per (pay_date, pay_type) so a bonus and a regular
  check on the same pay date can coexist and never overwrite each other;
  overwrite=True updates in place and regenerates the linked transactions once.
"""
from datetime import date
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.database import Base
from app.models.account import Account
from app.models.balance_snapshot import BalanceSnapshot
from app.models.category import Category
from app.models.investment_holding import InvestmentHolding
from app.models.transaction import Transaction
from app.models.user import User
from app.routers.paystubs import PaystubIn, save_paystub
from app.services.statement_apply import apply_parsed_statement


def _fresh_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


class StatementReuploadTests(TestCase):
    def setUp(self):
        self.db = _fresh_db()
        self.u = User(username="k", email="k@e.com", hashed_password="x")
        self.db.add(self.u)
        self.db.flush()
        self.acc = Account(user_id=self.u.id, name="401k", account_type="401k", balance=0)
        self.db.add(self.acc)
        self.db.commit()

    def test_reimport_enriches_instead_of_409(self):
        # Original import: balance only (the pre-2026-07 UI behavior).
        apply_parsed_statement(self.db, self.u, self.acc.id, "2026-03-31", 10000.0, [])
        # Re-import of the same statement, now with contributions + holdings.
        result = apply_parsed_statement(
            self.db, self.u, self.acc.id, "2026-03-31", 10000.0,
            [{"ticker": "FXAIX", "fund_name": "Fidelity 500", "value": 9500.0}],
            contributions=1200.0, employer_contributions=400.0,
        )
        self.assertEqual(result["snapshot_action"], "updated")
        self.assertEqual(self.db.query(BalanceSnapshot).count(), 1)  # no duplicate
        snap = self.db.query(BalanceSnapshot).one()
        self.assertEqual(snap.contributions, 1200.0)
        self.assertEqual(snap.employer_contributions, 400.0)
        self.assertEqual(self.db.query(InvestmentHolding).count(), 1)  # holdings landed

    def test_reimport_none_never_erases(self):
        apply_parsed_statement(self.db, self.u, self.acc.id, "2026-03-31", 10000.0, [],
                               contributions=1200.0, employer_contributions=400.0)
        # A later re-parse that couldn't extract contributions must not wipe them.
        apply_parsed_statement(self.db, self.u, self.acc.id, "2026-03-31", 10000.0, [])
        snap = self.db.query(BalanceSnapshot).one()
        self.assertEqual(snap.contributions, 1200.0)
        self.assertEqual(snap.employer_contributions, 400.0)

    def test_old_statement_reupload_does_not_prune_current_holdings(self):
        # Current state: latest statement (June) defines holdings.
        apply_parsed_statement(
            self.db, self.u, self.acc.id, "2026-06-30", 12000.0,
            [{"ticker": "FXAIX", "fund_name": "Fidelity 500", "value": 12000.0}],
        )
        # Re-uploading an OLD statement (March) listing a since-sold fund must only
        # backfill, never overwrite current values or resurrect/prune positions.
        apply_parsed_statement(
            self.db, self.u, self.acc.id, "2026-03-31", 10000.0,
            [{"ticker": "OLDFUND", "fund_name": "Old Fund", "value": 10000.0}],
        )
        holdings = {h.ticker: h for h in self.db.query(InvestmentHolding).all()}
        self.assertEqual(holdings["FXAIX"].current_value, 12000.0)  # untouched
        self.assertIn("OLDFUND", holdings)  # backfilled, not pruned (old stmt isn't authoritative)
        self.assertEqual(self.db.query(BalanceSnapshot).count(), 2)


class PaystubReuploadTests(TestCase):
    def setUp(self):
        self.db = _fresh_db()
        self.u = User(username="k", email="k@e.com", hashed_password="x")
        self.db.add(self.u)
        self.db.flush()
        self.db.add(Account(user_id=self.u.id, name="Checking", account_type="checking", balance=100))
        self.db.add(Category(user_id=self.u.id, name="Salary", kind="income"))
        self.db.commit()

    def _stub(self, **kw):
        base = dict(pay_date=date(2026, 6, 22), pay_type="regular",
                    gross_pay=5455.63, net_pay=3503.78, deduction_401k=380.0)
        base.update(kw)
        return PaystubIn(**base)

    def test_duplicate_409_then_overwrite_updates_in_place(self):
        save_paystub(self._stub(employer_401k=0.0), current_user=self.u, db=self.db)
        with self.assertRaises(HTTPException) as ctx:
            save_paystub(self._stub(employer_401k=327.34), current_user=self.u, db=self.db)
        self.assertEqual(ctx.exception.status_code, 409)
        # Overwrite: the re-parse that now captures employer_401k updates the stub
        # and regenerates transactions exactly once (net pay + employer 401k).
        out = save_paystub(self._stub(employer_401k=327.34), overwrite=True,
                           current_user=self.u, db=self.db)
        self.assertEqual(out.employer_401k, 327.34)
        from app.models.paystub import Paystub
        self.assertEqual(self.db.query(Paystub).count(), 1)
        txns = self.db.query(Transaction).filter(Transaction.import_source.like("paystub:%")).all()
        self.assertEqual(len(txns), 2)  # net pay + employer 401k, no stale extras

    def test_bonus_and_regular_same_date_do_not_collide(self):
        save_paystub(self._stub(), current_user=self.u, db=self.db)
        # A bonus check on the SAME pay date is a different stub — must save cleanly,
        # not 409 against (or overwrite) the regular check.
        out = save_paystub(
            self._stub(pay_type="bonus", gross_pay=2000.0, net_pay=1300.0,
                       bonus_pay=2000.0, regular_pay=0.0, deduction_401k=0.0),
            current_user=self.u, db=self.db,
        )
        self.assertEqual(out.pay_type, "bonus")
        from app.models.paystub import Paystub
        self.assertEqual(self.db.query(Paystub).count(), 2)

    def test_reclassified_same_check_still_matches(self):
        # Same physical check (same date + net pay) parsed as regular before and
        # bonus now — the date-only fallback catches it so it updates, not dupes.
        save_paystub(self._stub(), current_user=self.u, db=self.db)
        with self.assertRaises(HTTPException):
            save_paystub(self._stub(pay_type="bonus", bonus_pay=5455.63, regular_pay=0.0),
                         current_user=self.u, db=self.db)
        save_paystub(self._stub(pay_type="bonus", bonus_pay=5455.63, regular_pay=0.0),
                     overwrite=True, current_user=self.u, db=self.db)
        from app.models.paystub import Paystub
        self.assertEqual(self.db.query(Paystub).count(), 1)
        self.assertEqual(self.db.query(Paystub).one().pay_type, "bonus")
