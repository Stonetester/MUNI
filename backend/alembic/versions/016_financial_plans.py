"""saved AI financial plans

Revision ID: 016
Revises: 015
"""
import sqlalchemy as sa
from alembic import op

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "financial_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("objective", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model_used", sa.String(), nullable=True),
        sa.Column("is_joint", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("allocations_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("monthly_income", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("proposed_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("validation_status", sa.String(), nullable=False, server_default="needs_review"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_financial_plans_user_id", "financial_plans", ["user_id"])
    op.create_index("ix_financial_plans_session_id", "financial_plans", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_financial_plans_session_id", table_name="financial_plans")
    op.drop_index("ix_financial_plans_user_id", table_name="financial_plans")
    op.drop_table("financial_plans")
