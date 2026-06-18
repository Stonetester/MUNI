"""add chat_sessions and chat_messages

Revision ID: 006
Revises: 005
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def _has_table(conn, name: str) -> bool:
    return conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:n"), {"n": name}
    ).first() is not None


def upgrade():
    conn = op.get_bind()
    if not _has_table(conn, "chat_sessions"):
        op.create_table(
            "chat_sessions",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("title", sa.String(), nullable=False, server_default="New chat"),
            sa.Column("model_used", sa.String(), nullable=True),
            sa.Column("is_joint", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
    if not _has_table(conn, "chat_messages"):
        op.create_table(
            "chat_messages",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("session_id", sa.Integer(), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("model_used", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )


def downgrade():
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
