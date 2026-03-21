"""Add name and is_active columns to home_buying_goals for multi-profile support

Revision ID: 003
Revises: 002
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002_paystub_bonus_fields"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "home_buying_goals" not in tables:
        # Table never existed — create it fresh with all columns
        op.create_table(
            "home_buying_goals",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True, server_default="1"),
            sa.Column("target_price_min", sa.Float(), nullable=True),
            sa.Column("target_price_max", sa.Float(), nullable=True),
            sa.Column("target_date", sa.String(), nullable=True),
            sa.Column("down_payment_target", sa.Float(), nullable=True),
            sa.Column("current_savings", sa.Float(), nullable=True),
            sa.Column("monthly_savings_contribution", sa.Float(), nullable=True),
            sa.Column("mortgage_structure", sa.String(), nullable=True),
            sa.Column("keaton_income", sa.Float(), nullable=True),
            sa.Column("katherine_income", sa.Float(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
    else:
        # Table exists — only add columns that are missing
        existing = {col["name"] for col in inspector.get_columns("home_buying_goals")}
        with op.batch_alter_table("home_buying_goals") as batch_op:
            if "name" not in existing:
                batch_op.add_column(sa.Column("name", sa.String(), nullable=True))
            if "is_active" not in existing:
                batch_op.add_column(sa.Column("is_active", sa.Boolean(), nullable=True, server_default="1"))
        if "name" not in existing:
            op.execute("UPDATE home_buying_goals SET name = 'Default' WHERE name IS NULL")
        if "is_active" not in existing:
            op.execute("UPDATE home_buying_goals SET is_active = 1 WHERE is_active IS NULL")


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if "home_buying_goals" in tables:
        with op.batch_alter_table("home_buying_goals") as batch_op:
            batch_op.drop_column("name")
            batch_op.drop_column("is_active")
