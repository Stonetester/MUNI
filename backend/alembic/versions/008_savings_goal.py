"""add monthly_savings_goal to financial_profiles

Revision ID: 008
Revises: 007
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    cols = [row[1] for row in conn.execute(sa.text("PRAGMA table_info(financial_profiles)"))]
    if "monthly_savings_goal" not in cols:
        with op.batch_alter_table("financial_profiles") as batch_op:
            batch_op.add_column(sa.Column("monthly_savings_goal", sa.Float(), nullable=True))


def downgrade():
    with op.batch_alter_table("financial_profiles") as batch_op:
        batch_op.drop_column("monthly_savings_goal")
