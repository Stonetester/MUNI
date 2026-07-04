"""per-user Slack channel for the daily spend digest

Each partner can route their own card purchases to a personal channel
("#spend-kat") so they only get pinged about their own spending. NULL keeps
that person's purchases in the household digest channel (#coin). Joint
accounts and the household total always stay in the household channel.

Revision ID: 014
Revises: 013
"""
import sqlalchemy as sa
from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def _has_column(conn, table: str, column: str) -> bool:
    rows = conn.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()
    return any(r[1] == column for r in rows)


def upgrade() -> None:
    conn = op.get_bind()
    if not _has_column(conn, "users", "spend_channel"):
        op.add_column("users", sa.Column("spend_channel", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "spend_channel")
