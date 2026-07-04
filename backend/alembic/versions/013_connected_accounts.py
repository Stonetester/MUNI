"""connected card/checking feed (SimpleFIN Bridge)

Two tables backing the end-of-day spend digest: the household's single
SimpleFIN connection (access URL from a claimed setup token) and the
accounts visible through it (owner-labeled for digest grouping).

Feed data is digest/display only — it is never written into `transactions`;
Google Sheets stay the source of truth.

Revision ID: 013
Revises: 012
"""
import sqlalchemy as sa
from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def _has_table(conn, table: str) -> bool:
    rows = conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"), {"t": table}
    ).fetchall()
    return bool(rows)


def upgrade() -> None:
    conn = op.get_bind()
    if not _has_table(conn, "simplefin_connections"):
        op.create_table(
            "simplefin_connections",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("access_url", sa.String(), nullable=False),
            sa.Column("claimed_at", sa.DateTime(), nullable=False),
            sa.Column("last_synced_at", sa.DateTime(), nullable=True),
            sa.Column("last_error", sa.String(), nullable=True),
            sa.Column("digest_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("last_digest_at", sa.DateTime(), nullable=True),
        )
    if not _has_table(conn, "connected_accounts"):
        op.create_table(
            "connected_accounts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "connection_id",
                sa.Integer(),
                sa.ForeignKey("simplefin_connections.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("simplefin_id", sa.String(), nullable=False, unique=True, index=True),
            sa.Column("org_name", sa.String(), nullable=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("nickname", sa.String(), nullable=True),
            sa.Column(
                "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
            ),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("balance", sa.String(), nullable=True),
            sa.Column("balance_date", sa.DateTime(), nullable=True),
            sa.Column("currency", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("connected_accounts")
    op.drop_table("simplefin_connections")
