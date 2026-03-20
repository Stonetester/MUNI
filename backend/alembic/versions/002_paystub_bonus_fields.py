"""Add bonus_pay and pay_type to paystubs

Revision ID: 002_paystub_bonus_fields
Revises: 001_initial_schema
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = "002_paystub_bonus_fields"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("paystubs") as batch_op:
        batch_op.add_column(sa.Column("pay_type",  sa.String(), nullable=True, server_default="regular"))
        batch_op.add_column(sa.Column("bonus_pay", sa.Float(),  nullable=True, server_default="0.0"))


def downgrade():
    with op.batch_alter_table("paystubs") as batch_op:
        batch_op.drop_column("bonus_pay")
        batch_op.drop_column("pay_type")
