"""add is_joint to life_events

Revision ID: 005
Revises: 004
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    cols = [row[1] for row in conn.execute(sa.text("PRAGMA table_info(life_events)"))]
    if "is_joint" not in cols:
        with op.batch_alter_table("life_events") as batch_op:
            batch_op.add_column(sa.Column("is_joint", sa.Boolean(), nullable=False, server_default="0"))


def downgrade():
    with op.batch_alter_table("life_events") as batch_op:
        batch_op.drop_column("is_joint")
