"""add contributions to balance_snapshots

Revision ID: 010
Revises: 009
Create Date: 2026-06-18

Stores money ADDED to the account during the period covered by a statement, so
investment returns can net out contributions (deposits aren't "gains").
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    cols = [row[1] for row in conn.execute(sa.text("PRAGMA table_info(balance_snapshots)"))]
    if "contributions" not in cols:
        with op.batch_alter_table("balance_snapshots") as batch_op:
            batch_op.add_column(sa.Column("contributions", sa.Float(), nullable=True))


def downgrade():
    with op.batch_alter_table("balance_snapshots") as batch_op:
        batch_op.drop_column("contributions")
