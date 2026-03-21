"""Add name and is_active columns to home_buying_goals for multi-profile support

Revision ID: 003
Revises: 002
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("home_buying_goals") as batch_op:
        batch_op.add_column(sa.Column("name", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("is_active", sa.Boolean(), nullable=True, server_default="1"))

    # Set sensible defaults on existing rows
    op.execute("UPDATE home_buying_goals SET name = 'Default' WHERE name IS NULL")
    op.execute("UPDATE home_buying_goals SET is_active = 1 WHERE is_active IS NULL")


def downgrade():
    with op.batch_alter_table("home_buying_goals") as batch_op:
        batch_op.drop_column("name")
        batch_op.drop_column("is_active")
