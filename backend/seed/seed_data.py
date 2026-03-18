"""
Seed script - creates users and default categories only.
No personal financial data is pre-loaded.
Run: python seed/seed_data.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models.user import User
from app.models.category import Category
from app.models.scenario import Scenario
from app.auth import get_password_hash

Base.metadata.create_all(bind=engine)


def seed():
    db: Session = SessionLocal()
    try:
        if db.query(User).first():
            print("Database already seeded. Skipping.")
            return

        print("Seeding database with users and categories...")

        # ── Users ──────────────────────────────────────────────────────────────
        keaton = User(
            username="keaton",
            email="keaton@example.com",
            hashed_password=get_password_hash("finance123"),
            display_name="Keaton",
        )
        katherine = User(
            username="katherine",
            email="katherine@example.com",
            hashed_password=get_password_hash("finance123"),
            display_name="Katherine",
        )
        db.add_all([keaton, katherine])
        db.flush()
        print(f"  Created users: keaton, katherine")

        # ── Baseline Scenario ─────────────────────────────────────────────────
        baseline = Scenario(
            user_id=keaton.id,
            name="Baseline",
            description="Your actual planned finances",
            is_baseline=True,
        )
        db.add(baseline)
        db.flush()

        # ── Default Categories ────────────────────────────────────────────────
        category_defs = [
            # Income
            dict(name="Salary",        kind="income",  color="#10B981"),
            dict(name="Side Income",   kind="income",  color="#34D399"),
            dict(name="Bonus",         kind="income",  color="#6EE7B7"),
            # Expense parents
            dict(name="Housing",       kind="expense", color="#f87171"),
            dict(name="Food",          kind="expense", color="#fb923c"),
            dict(name="Transportation",kind="expense", color="#facc15"),
            dict(name="Health",        kind="expense", color="#a78bfa"),
            dict(name="Entertainment", kind="expense", color="#38bdf8"),
            dict(name="Shopping",      kind="expense", color="#f472b6"),
            dict(name="Personal",      kind="expense", color="#94a3b8"),
            dict(name="Subscriptions", kind="expense", color="#818cf8"),
            dict(name="Debt",          kind="expense", color="#ef4444"),
            dict(name="Family",        kind="expense", color="#fb923c"),
            dict(name="Gifts",         kind="expense", color="#c084fc"),
            dict(name="Wedding",       kind="expense", color="#f9a8d4"),
            dict(name="Work",          kind="expense", color="#67e8f9"),
            # Savings
            dict(name="Emergency Fund",kind="savings", color="#14b8a6"),
            dict(name="Wedding Fund",  kind="savings", color="#f9a8d4"),
            dict(name="Retirement",    kind="savings", color="#818cf8"),
            dict(name="Vacation",      kind="savings", color="#34d399"),
        ]
        cat_map: dict[str, Category] = {}
        for c in category_defs:
            cat = Category(user_id=keaton.id, **c)
            db.add(cat)
            db.flush()
            cat_map[c["name"]] = cat

        # Sub-categories
        sub_cats = [
            dict(name="Rent/Utilities",  kind="expense", color="#f87171",  parent="Housing"),
            dict(name="Electricity",     kind="expense", color="#fca5a5",  parent="Housing"),
            dict(name="Internet",        kind="expense", color="#fca5a5",  parent="Housing"),
            dict(name="Eating Out",      kind="expense", color="#fb923c",  parent="Food"),
            dict(name="Groceries",       kind="expense", color="#fdba74",  parent="Food"),
            dict(name="Gas",             kind="expense", color="#facc15",  parent="Transportation"),
            dict(name="Car Expense",     kind="expense", color="#fde68a",  parent="Transportation"),
            dict(name="Car Repair",      kind="expense", color="#fef08a",  parent="Transportation"),
            dict(name="Medical",         kind="expense", color="#a78bfa",  parent="Health"),
            dict(name="Going Out",       kind="expense", color="#38bdf8",  parent="Entertainment"),
            dict(name="Discretionary",   kind="expense", color="#7dd3fc",  parent="Entertainment"),
            dict(name="Student Loans",   kind="expense", color="#ef4444",  parent="Debt"),
            dict(name="Required",        kind="expense", color="#94a3b8",  parent="Personal"),
            dict(name="Tax",             kind="expense", color="#6b7280",  parent="Personal"),
            dict(name="Savings Transfer",kind="savings", color="#14b8a6",  parent="Emergency Fund"),
        ]
        for c in sub_cats:
            parent_name = c.pop("parent")
            parent_obj = cat_map.get(parent_name)
            cat = Category(user_id=keaton.id, parent_id=parent_obj.id if parent_obj else None, **c)
            db.add(cat)
            db.flush()
            cat_map[c["name"]] = cat

        print("  Created default categories")

        db.commit()
        print("\nSeed complete!")
        print("  Keaton login:    keaton / finance123")
        print("  Katherine login: katherine / finance123")
        print("")
        print("  Next steps:")
        print("  1. Add accounts via the Accounts page")
        print("  2. Import transactions via Transactions > Import CSV/XLSX")
        print("  3. Add recurring income/expenses via Budget > Recurring Rules")

    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
