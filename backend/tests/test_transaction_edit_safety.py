"""Safe transaction edit/delete (2026-07-04).

Before the fix, the 30-minute Sheets sync silently undid app-side changes to
sheets-imported transactions: deletes re-imported, amount/category edits were
clobbered back to sheet values, description/date edits duplicated the row.
These tests pin the contract:

- deleting a sheets row writes a tombstone (hash + upsert key)
- editing a sheets row sets user_modified; identity edits tombstone the ORIGINAL
- paystub-managed rows reject direct edit/delete with a pointer to the paystub
- bulk clears wipe tombstones (clean resync is their whole point)
"""
from datetime import date
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.database import Base
from app.models.import_tombstone import ImportTombstone
from app.models.transaction import Transaction
from app.models.user import User
from app.routers.transactions import (
    delete_all_sheets_transactions,
    delete_transaction,
    update_transaction,
)
from app.schemas.transaction import TransactionUpdate
from app.services.google_sheets_sync import _dedup_desc_key, _dedup_hash


def _fresh_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


class TransactionEditSafetyTests(TestCase):
    def setUp(self):
        self.db = _fresh_db()
        self.user = User(username="keaton", email="k@e.com", hashed_password="x")
        self.db.add(self.user)
        self.db.flush()

    def _sheets_txn(self, desc="Wawa", amount=-12.40, on=date(2026, 7, 1), source="sheets:JUL2026"):
        txn = Transaction(
            user_id=self.user.id, date=on, amount=amount, description=desc,
            import_source=source,
        )
        self.db.add(txn)
        self.db.commit()
        self.db.refresh(txn)
        return txn

    # ── delete ──

    def test_delete_sheets_row_writes_tombstone(self):
        txn = self._sheets_txn()
        expected_hash = _dedup_hash(txn.date, txn.description, txn.amount)
        expected_key = _dedup_desc_key(txn.date, txn.description)

        delete_transaction(txn.id, current_user=self.user, db=self.db)

        self.assertIsNone(self.db.query(Transaction).filter_by(id=txn.id).first())
        ts = self.db.query(ImportTombstone).one()
        self.assertEqual(ts.dedup_hash, expected_hash)
        self.assertEqual(ts.desc_key, expected_key)
        self.assertEqual(ts.reason, "deleted")

    def test_delete_legacy_null_source_row_writes_tombstone(self):
        txn = self._sheets_txn(source=None)
        delete_transaction(txn.id, current_user=self.user, db=self.db)
        self.assertEqual(self.db.query(ImportTombstone).count(), 1)

    def test_delete_manual_row_writes_no_tombstone(self):
        txn = self._sheets_txn(source="csv")
        delete_transaction(txn.id, current_user=self.user, db=self.db)
        self.assertEqual(self.db.query(ImportTombstone).count(), 0)

    # ── edit ──

    def test_amount_edit_sets_user_modified_and_tombstones_original(self):
        txn = self._sheets_txn(amount=-12.40)
        original_hash = _dedup_hash(txn.date, txn.description, -12.40)

        update_transaction(txn.id, TransactionUpdate(amount=-15.00), current_user=self.user, db=self.db)

        self.db.refresh(txn)
        self.assertEqual(txn.amount, -15.00)
        self.assertTrue(txn.user_modified)
        ts = self.db.query(ImportTombstone).one()
        self.assertEqual(ts.dedup_hash, original_hash)
        self.assertEqual(ts.reason, "edited")

    def test_category_only_edit_sets_user_modified_without_tombstone(self):
        txn = self._sheets_txn()
        update_transaction(txn.id, TransactionUpdate(category_id=None, notes="mine"), current_user=self.user, db=self.db)
        self.db.refresh(txn)
        self.assertTrue(txn.user_modified)
        # identity unchanged — original sheet row still matches this DB row, no tombstone needed
        self.assertEqual(self.db.query(ImportTombstone).count(), 0)

    def test_noop_edit_does_not_take_ownership(self):
        txn = self._sheets_txn(amount=-12.40)
        update_transaction(txn.id, TransactionUpdate(amount=-12.40), current_user=self.user, db=self.db)
        self.db.refresh(txn)
        self.assertFalse(txn.user_modified)
        self.assertEqual(self.db.query(ImportTombstone).count(), 0)

    # ── paystub-managed rows ──

    def test_paystub_row_rejects_edit_and_delete(self):
        txn = self._sheets_txn(desc="Salary", amount=3000, source="paystub:42")
        with self.assertRaises(HTTPException) as ctx:
            update_transaction(txn.id, TransactionUpdate(amount=1), current_user=self.user, db=self.db)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("paystub #42", ctx.exception.detail)
        with self.assertRaises(HTTPException):
            delete_transaction(txn.id, current_user=self.user, db=self.db)
        # untouched
        self.db.refresh(txn)
        self.assertEqual(txn.amount, 3000)

    # ── bulk clear resets tombstones ──

    def test_bulk_sheets_clear_wipes_tombstones(self):
        txn = self._sheets_txn()
        delete_transaction(txn.id, current_user=self.user, db=self.db)
        self.assertEqual(self.db.query(ImportTombstone).count(), 1)
        self._sheets_txn(desc="Chipotle")
        delete_all_sheets_transactions(current_user=self.user, db=self.db)
        self.assertEqual(self.db.query(ImportTombstone).count(), 0)
        self.assertEqual(self.db.query(Transaction).count(), 0)


class SyncRespectsSafetyTests(TestCase):
    """The sync-side contract, tested at the data level the sync reads."""

    def setUp(self):
        self.db = _fresh_db()
        self.user = User(username="keaton", email="k@e.com", hashed_password="x")
        self.db.add(self.user)
        self.db.flush()

    def test_tombstone_lookup_sets_match_router_writes(self):
        txn = Transaction(
            user_id=self.user.id, date=date(2026, 7, 1), amount=-12.40,
            description="Wawa", import_source="sheets:JUL2026",
        )
        self.db.add(txn)
        self.db.commit()
        delete_transaction(txn.id, current_user=self.user, db=self.db)

        tombstones = self.db.query(ImportTombstone).filter_by(user_id=self.user.id).all()
        hashes = {t.dedup_hash for t in tombstones}
        keys = {t.desc_key for t in tombstones}
        # Exactly what sync_user_sheet computes for the same sheet row:
        self.assertIn(_dedup_hash(date(2026, 7, 1), "Wawa", -12.40), hashes)
        self.assertIn(_dedup_desc_key(date(2026, 7, 1), "Wawa"), keys)
