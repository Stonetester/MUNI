"""Tombstones for deleted/renamed imported transactions.

When a user deletes (or edits the identity of) a Sheets-imported transaction
through the app, the row disappears from the DB — and without a marker the
30-minute Sheets sync would happily re-import it from the sheet, silently
undoing the user's action. A tombstone records the original row's dedup hash
and date+description upsert key so the sync skips that sheet row forever.

Bulk clears ("Clear Google Sheets transactions") intentionally do NOT write
tombstones — their whole point is a clean re-import.
"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey

from app.database import Base


class ImportTombstone(Base):
    __tablename__ = "import_tombstones"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # SHA-256 dedup hash (date|description|amount) — blocks the exact row.
    dedup_hash = Column(String, nullable=False, index=True)
    # date|description upsert key — blocks re-import even if the sheet amount changes.
    desc_key = Column(String, nullable=False, index=True)
    # Original row values, kept for display/debugging.
    date = Column(Date, nullable=True)
    description = Column(String, nullable=True)
    amount = Column(Float, nullable=True)
    # "deleted" (row removed in app) or "edited" (identity changed in app).
    reason = Column(String, nullable=False, default="deleted")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
