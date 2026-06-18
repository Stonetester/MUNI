"""add date_of_birth to users

Revision ID: 009
Revises: 008
Create Date: 2026-06-18
"""
from datetime import date

from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    cols = [row[1] for row in conn.execute(sa.text("PRAGMA table_info(users)"))]
    if "date_of_birth" not in cols:
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(sa.Column("date_of_birth", sa.Date(), nullable=True))

    # Seed known DOBs so the Coast FI age is correct (and auto-increments).
    # Keaton is 25 and Katherine is 26 as of 2026-06-18. Exact birthdays are
    # unknown; pick a DOB that yields the right current age (mid-year so a recent
    # or upcoming birthday doesn't flip it). Edit later if exact dates are added.
    conn.execute(
        sa.text("UPDATE users SET date_of_birth = :dob WHERE lower(username) = 'keaton' AND date_of_birth IS NULL"),
        {"dob": date(2001, 1, 1)},  # turns 25 in 2026
    )
    conn.execute(
        sa.text("UPDATE users SET date_of_birth = :dob WHERE lower(username) = 'katherine' AND date_of_birth IS NULL"),
        {"dob": date(2000, 1, 1)},  # turns 26 in 2026
    )


def downgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("date_of_birth")
