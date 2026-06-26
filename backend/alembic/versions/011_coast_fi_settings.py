"""coast fi settings on financial_profiles

Revision ID: 011
Revises: 010
Create Date: 2026-06-24

Stores user-edited Coast FI assumptions (investment return, inflation, SWR,
retirement age) so they survive page refreshes.
"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    cols = [row[1] for row in conn.execute(sa.text("PRAGMA table_info(financial_profiles)"))]
    with op.batch_alter_table("financial_profiles") as batch_op:
        if "coast_fi_investment_return" not in cols:
            batch_op.add_column(sa.Column("coast_fi_investment_return", sa.Float(), nullable=True))
        if "coast_fi_inflation_rate" not in cols:
            batch_op.add_column(sa.Column("coast_fi_inflation_rate", sa.Float(), nullable=True))
        if "coast_fi_swr" not in cols:
            batch_op.add_column(sa.Column("coast_fi_swr", sa.Float(), nullable=True))
        if "coast_fi_retirement_age" not in cols:
            batch_op.add_column(sa.Column("coast_fi_retirement_age", sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table("financial_profiles") as batch_op:
        batch_op.drop_column("coast_fi_retirement_age")
        batch_op.drop_column("coast_fi_swr")
        batch_op.drop_column("coast_fi_inflation_rate")
        batch_op.drop_column("coast_fi_investment_return")
