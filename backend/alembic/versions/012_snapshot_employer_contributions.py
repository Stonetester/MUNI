"""add employer_contributions to balance_snapshots

The statement parser can split the employer-paid portion out of a period's
contributions (Fidelity "Employer Contributions"; John Hancock SAFE HARBOR /
ER PROFIT SHARING lines). Storing it lets the app MEASURE an employer 401k
match for people whose paystubs don't print it (Katherine), instead of
falling back to the manual employer_401k_percent profile field.

Revision ID: 012
Revises: 011
"""
import sqlalchemy as sa
from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def _has_column(conn, table: str, column: str) -> bool:
    rows = conn.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()
    return any(r[1] == column for r in rows)


def upgrade() -> None:
    conn = op.get_bind()
    if not _has_column(conn, "balance_snapshots", "employer_contributions"):
        op.add_column(
            "balance_snapshots",
            sa.Column("employer_contributions", sa.Float(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("balance_snapshots", "employer_contributions")
