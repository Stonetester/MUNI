"""safe transaction edit/delete: tombstones + user_modified flag

Before this, app-side edits and deletes of Sheets-imported transactions were
silently undone by the 30-minute sync: deletes re-imported, amount/category
edits clobbered back to sheet values, description/date edits duplicated.

- `transactions.user_modified` — app-edited imported rows become app-owned;
  the sync upsert leaves them alone.
- `import_tombstones` — deleted (or identity-edited) imported rows are
  remembered by dedup hash + upsert key so the sync never re-imports them.

Revision ID: 015
Revises: 014
"""
import sqlalchemy as sa
from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def _has_column(conn, table: str, column: str) -> bool:
    rows = conn.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()
    return any(r[1] == column for r in rows)


def _has_table(conn, table: str) -> bool:
    rows = conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"), {"t": table}
    ).fetchall()
    return bool(rows)


def upgrade() -> None:
    conn = op.get_bind()
    if not _has_column(conn, "transactions", "user_modified"):
        op.add_column(
            "transactions",
            sa.Column("user_modified", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if not _has_table(conn, "import_tombstones"):
        op.create_table(
            "import_tombstones",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "user_id", sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
            ),
            sa.Column("dedup_hash", sa.String(), nullable=False, index=True),
            sa.Column("desc_key", sa.String(), nullable=False, index=True),
            sa.Column("date", sa.Date(), nullable=True),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("amount", sa.Float(), nullable=True),
            sa.Column("reason", sa.String(), nullable=False, server_default="deleted"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("import_tombstones")
    op.drop_column("transactions", "user_modified")
