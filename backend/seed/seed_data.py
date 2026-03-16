"""
Seed script - loads Keaton & Katherine's real financial data into the database.
Run: python seed/seed_data.py
"""
import sys
import os
import json
from datetime import date, datetime, timedelta
from pathlib import Path

# Add parent dir to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models.user import User
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.recurring_rule import RecurringRule
from app.models.balance_snapshot import BalanceSnapshot
from app.models.life_event import LifeEvent
from app.models.scenario import Scenario
from app.auth import get_password_hash

# ─── Create tables ────────────────────────────────────────────────────────────
Base.metadata.create_all(bind=engine)


def seed():
    db: Session = SessionLocal()
    try:
        # Skip if already seeded
        if db.query(User).first():
            print("Database already seeded. Skipping.")
            return

        print("Seeding database with real financial data...")

        # ── Users ──────────────────────────────────────────────────────────────
        keaton = User(
            username="keaton",
            email="keaton@example.com",
            hashed_password=get_password_hash("finance123"),
            display_name="Keaton Dick",
        )
        katherine = User(
            username="katherine",
            email="katherine@example.com",
            hashed_password=get_password_hash("finance123"),
            display_name="Katherine",
        )
        db.add_all([keaton, katherine])
        db.flush()
        print(f"  Created users: {keaton.id}, {katherine.id}")

        # ── Scenarios ─────────────────────────────────────────────────────────
        baseline = Scenario(
            user_id=keaton.id,
            name="Baseline",
            description="Your actual planned finances",
            is_baseline=True,
        )
        db.add(baseline)
        db.flush()

        # ── Keaton's Accounts ─────────────────────────────────────────────────
        accounts_data = [
            dict(name="Chase Checking", account_type="checking", institution="Chase",
                 balance=1169.87, forecast_enabled=True),
            dict(name="Everbank HYSA", account_type="hysa", institution="Everbank",
                 balance=12526.74, forecast_enabled=True,
                 notes="Joint HYSA — wedding + emergency fund"),
            dict(name="Keaton 401(k)", account_type="401k", institution="Fidelity",
                 balance=68534.76, forecast_enabled=True),
            dict(name="Keaton IRA", account_type="ira", institution="Fidelity",
                 balance=3516.68, forecast_enabled=True),
            dict(name="Student Loans", account_type="student_loan", institution="Navient",
                 balance=-24000.00, forecast_enabled=True,
                 notes="Approx balance — $800/mo payment"),
            dict(name="Camry (Red)", account_type="other", institution=None,
                 balance=8000.00, forecast_enabled=False, notes="Car asset"),
            dict(name="Bluebird", account_type="other", institution=None,
                 balance=6000.00, forecast_enabled=False, notes="Car asset"),
        ]
        keaton_accounts = {}
        for a in accounts_data:
            acc = Account(user_id=keaton.id, **a)
            db.add(acc)
            db.flush()
            keaton_accounts[a["name"]] = acc

        # Katherine's accounts
        kat_checking = Account(user_id=katherine.id, name="Katherine Checking",
                               account_type="checking", institution="Bank of America",
                               balance=2500.00, forecast_enabled=True)
        kat_401k = Account(user_id=katherine.id, name="Katherine 401(k)",
                           account_type="401k", institution="Fidelity",
                           balance=15000.00, forecast_enabled=True)
        db.add_all([kat_checking, kat_401k])
        db.flush()
        print("  Created accounts")

        # ── Categories ────────────────────────────────────────────────────────
        category_defs = [
            # Income
            dict(name="Salary", kind="income", color="#10B981"),
            dict(name="Side Income", kind="income", color="#34D399"),
            dict(name="Bonus", kind="income", color="#6EE7B7"),
            # Expense parents
            dict(name="Housing", kind="expense", color="#f87171"),
            dict(name="Food", kind="expense", color="#fb923c"),
            dict(name="Transportation", kind="expense", color="#facc15"),
            dict(name="Health", kind="expense", color="#a78bfa"),
            dict(name="Entertainment", kind="expense", color="#38bdf8"),
            dict(name="Shopping", kind="expense", color="#f472b6"),
            dict(name="Personal", kind="expense", color="#94a3b8"),
            dict(name="Subscriptions", kind="expense", color="#818cf8"),
            dict(name="Debt", kind="expense", color="#ef4444"),
            dict(name="Family", kind="expense", color="#fb923c"),
            dict(name="Gifts", kind="expense", color="#c084fc"),
            dict(name="Wedding", kind="expense", color="#f9a8d4"),
            dict(name="Work", kind="expense", color="#67e8f9"),
            # Savings
            dict(name="Emergency Fund", kind="savings", color="#14b8a6"),
            dict(name="Wedding Fund", kind="savings", color="#f9a8d4"),
            dict(name="Retirement", kind="savings", color="#818cf8"),
            dict(name="Vacation", kind="savings", color="#34d399"),
        ]
        cat_map: dict[str, Category] = {}
        for c in category_defs:
            cat = Category(user_id=keaton.id, **c)
            db.add(cat)
            db.flush()
            cat_map[c["name"]] = cat

        # Sub-categories
        sub_cats = [
            dict(name="Rent/Utilities", kind="expense", color="#f87171", parent="Housing"),
            dict(name="Electricity", kind="expense", color="#fca5a5", parent="Housing"),
            dict(name="Internet", kind="expense", color="#fca5a5", parent="Housing"),
            dict(name="Eating Out", kind="expense", color="#fb923c", parent="Food"),
            dict(name="Groceries", kind="expense", color="#fdba74", parent="Food"),
            dict(name="Gas", kind="expense", color="#facc15", parent="Transportation"),
            dict(name="Car Expense", kind="expense", color="#fde68a", parent="Transportation"),
            dict(name="Car Repair", kind="expense", color="#fef08a", parent="Transportation"),
            dict(name="Medical", kind="expense", color="#a78bfa", parent="Health"),
            dict(name="Going Out", kind="expense", color="#38bdf8", parent="Entertainment"),
            dict(name="Discretionary", kind="expense", color="#7dd3fc", parent="Entertainment"),
            dict(name="Student Loans", kind="expense", color="#ef4444", parent="Debt"),
            dict(name="Kat", kind="expense", color="#f472b6", parent="Personal"),
            dict(name="Required", kind="expense", color="#94a3b8", parent="Personal"),
            dict(name="Tax", kind="expense", color="#6b7280", parent="Personal"),
            dict(name="Savings Transfer", kind="savings", color="#14b8a6", parent="Emergency Fund"),
        ]
        for c in sub_cats:
            parent_name = c.pop("parent")
            parent_obj = cat_map.get(parent_name)
            cat = Category(user_id=keaton.id, parent_id=parent_obj.id if parent_obj else None, **c)
            db.add(cat)
            db.flush()
            cat_map[c["name"]] = cat
        print("  Created categories")

        # ── Recurring Rules ───────────────────────────────────────────────────
        # Keaton's income (semi-monthly)
        rule_income1 = RecurringRule(
            user_id=keaton.id,
            account_id=keaton_accounts["Chase Checking"].id,
            category_id=cat_map["Salary"].id,
            name="Keaton Paycheck (1st-15th)",
            amount=3037.35,
            frequency="bimonthly",
            start_date=date(2025, 1, 15),
            description="Net take-home after taxes, 401k, benefits. Gross $4877.53/period.",
            is_active=True,
        )
        rule_income2 = RecurringRule(
            user_id=keaton.id,
            account_id=keaton_accounts["Chase Checking"].id,
            category_id=cat_map["Salary"].id,
            name="Keaton Paycheck (16th-end)",
            amount=3037.35,
            frequency="bimonthly",
            start_date=date(2025, 1, 31),
            description="Net take-home. Gross salary: $116,500/yr.",
            is_active=True,
        )
        rule_401k = RecurringRule(
            user_id=keaton.id,
            account_id=keaton_accounts["Keaton 401(k)"].id,
            category_id=cat_map["Retirement"].id,
            name="401k Contribution",
            amount=485.42,
            frequency="bimonthly",
            start_date=date(2025, 1, 15),
            description="10% 401k contribution per paycheck",
            is_active=True,
        )

        # Katherine's income
        kat_income = RecurringRule(
            user_id=katherine.id,
            account_id=kat_checking.id,
            category_id=cat_map["Salary"].id,
            name="Katherine Paycheck (G&P)",
            amount=2353.00,
            frequency="bimonthly",
            start_date=date(2025, 1, 15),
            description="Net pay from G&P. Gross $3062.50/period, 401k $91.88.",
            is_active=True,
        )

        # Joint recurring expenses
        recurring_expenses = [
            dict(name="Student Loan Payment", amount=-800.00, frequency="monthly",
                 cat="Student Loans", account="Chase Checking",
                 desc="Monthly student loan payment"),
            dict(name="Spotify", amount=-12.71, frequency="monthly",
                 cat="Subscriptions", account="Chase Checking"),
            dict(name="Netflix", amount=-7.41, frequency="monthly",
                 cat="Subscriptions", account="Chase Checking"),
            dict(name="Amazon Prime", amount=-15.89, frequency="monthly",
                 cat="Subscriptions", account="Chase Checking"),
            dict(name="ChatGPT Plus", amount=-20.00, frequency="monthly",
                 cat="Subscriptions", account="Chase Checking"),
            dict(name="Peacock", amount=-7.99, frequency="monthly",
                 cat="Subscriptions", account="Chase Checking"),
            dict(name="Planet Fitness", amount=-10.00, frequency="monthly",
                 cat="Subscriptions", account="Chase Checking"),
            dict(name="Patreon", amount=-1.06, frequency="monthly",
                 cat="Subscriptions", account="Chase Checking"),
            dict(name="Google Storage", amount=-0.99, frequency="monthly",
                 cat="Subscriptions", account="Chase Checking"),
            dict(name="EZ Pass", amount=-25.00, frequency="monthly",
                 cat="Car Expense", account="Chase Checking"),
            dict(name="Car Insurance (Annual)", amount=-1238.43, frequency="annual",
                 cat="Car Expense", account="Chase Checking",
                 desc="Annual car insurance payment"),
            dict(name="Electric Bill", amount=-120.00, frequency="monthly",
                 cat="Electricity", account="Chase Checking"),
            dict(name="Internet", amount=-60.00, frequency="monthly",
                 cat="Internet", account="Chase Checking"),
            dict(name="Wedding Savings Transfer", amount=-2000.00, frequency="monthly",
                 cat="Wedding Fund", account="Everbank HYSA",
                 desc="Monthly transfer to wedding/HYSA fund"),
        ]

        for r in recurring_expenses:
            cat_name = r.pop("cat")
            acc_name = r.pop("account")
            desc = r.pop("desc", None)
            rule = RecurringRule(
                user_id=keaton.id,
                account_id=keaton_accounts.get(acc_name, keaton_accounts["Chase Checking"]).id,
                category_id=cat_map.get(cat_name, cat_map["Discretionary"]).id,
                start_date=date(2024, 7, 1),
                description=desc,
                is_active=True,
                **r,
            )
            db.add(rule)

        db.add_all([rule_income1, rule_income2, rule_401k, kat_income])
        db.flush()
        print("  Created recurring rules")

        # ── Balance Snapshots ─────────────────────────────────────────────────
        snapshots = [
            (keaton_accounts["Chase Checking"], date(2026, 3, 1), 1169.87),
            (keaton_accounts["Everbank HYSA"], date(2026, 3, 1), 12526.74),
            (keaton_accounts["Keaton 401(k)"], date(2026, 3, 1), 68534.76),
            (keaton_accounts["Keaton IRA"], date(2026, 3, 1), 3516.68),
            (keaton_accounts["Student Loans"], date(2026, 3, 1), -24000.00),
        ]
        for acc, snap_date, bal in snapshots:
            db.add(BalanceSnapshot(account_id=acc.id, date=snap_date, balance=bal,
                                   notes="Imported from spreadsheet"))

        # ── Life Events ───────────────────────────────────────────────────────
        wedding_breakdown = []
        # Spread $42,702 (wedding only, w/ parent help) over Jun 2025 - Oct 2026
        # With parents covering ~$20k, remaining is ~$42,702
        monthly_save = 2000.0
        for i, month_offset in enumerate(range(0, 17)):
            m_date = date(2025, 6, 1) + timedelta(days=month_offset * 31)
            m_str = f"{m_date.year}-{m_date.month:02d}"
            # Big payment months: deposits, catering, venue
            if month_offset == 0:  # June 2025 - venue deposit
                wedding_breakdown.append({"month": m_str, "amount": 5000.0})
            elif month_offset == 3:  # Sep 2025 - catering deposit
                wedding_breakdown.append({"month": m_str, "amount": 3000.0})
            elif month_offset == 11:  # May 2026 - final venue payment
                wedding_breakdown.append({"month": m_str, "amount": 8000.0})
            elif month_offset == 14:  # Aug 2026 - catering final
                wedding_breakdown.append({"month": m_str, "amount": 6000.0})
            elif month_offset == 15:  # Sep 2026 - misc final
                wedding_breakdown.append({"month": m_str, "amount": 4000.0})
            elif month_offset == 16:  # Oct 2026 - wedding!
                wedding_breakdown.append({"month": m_str, "amount": 10000.0})
            else:
                wedding_breakdown.append({"month": m_str, "amount": monthly_save})

        wedding = LifeEvent(
            user_id=keaton.id,
            name="Wedding",
            event_type="wedding",
            start_date=date(2025, 6, 1),
            end_date=date(2026, 10, 31),
            total_cost=62702.00,
            description=(
                "Full wedding cost $62,702 (wedding only). With parent help: $42,702. "
                "Honeymoon: $6,000. Bach parties: $700. Engagement party: $700. "
                "Wedding savings starting balance (Jun 2025): $21,000."
            ),
            is_active=True,
            monthly_breakdown=wedding_breakdown,
        )

        honeymoon = LifeEvent(
            user_id=keaton.id,
            name="Honeymoon",
            event_type="vacation",
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 30),
            total_cost=6000.00,
            description="Post-wedding honeymoon trip",
            is_active=True,
            monthly_breakdown=[{"month": "2026-11", "amount": 6000.0}],
        )

        db.add_all([wedding, honeymoon])
        db.flush()
        print("  Created life events")

        # ── Transactions ──────────────────────────────────────────────────────
        # Category name normalization
        cat_normalize = {
            "car expense": "Car Expense",
            "car repair": "Car Repair",
            "eating out": "Eating Out",
            "going out": "Going Out",
            "discretionary": "Discretionary",
            "family": "Family",
            "rent/utilities": "Rent/Utilities",
            "medical": "Medical",
            "groceries": "Groceries",
            "subscriptions": "Subscriptions",
            "gas": "Gas",
            "transportation": "Transportation",
            "required": "Required",
            "gifts": "Gifts",
            "shopping": "Shopping",
            "student loans": "Student Loans",
            "student loan": "Student Loans",
            "internet": "Internet",
            "electricity": "Electricity",
            "wedding": "Wedding",
            "work": "Work",
            "worka": "Work",
            "shoppi": "Shopping",
            "kat": "Kat",
            "savings": "Savings Transfer",
            "tax": "Tax",
            "uncategorized": "Discretionary",
        }

        payment_normalize = {
            "credit card": "credit_card",
            "debit card": "debit_card",
            "debit": "debit_card",
            "credit": "credit_card",
        }

        json_path = Path(__file__).parent.parent.parent / "seed_transactions.json"
        if not json_path.exists():
            print(f"  WARNING: {json_path} not found, skipping transactions")
        else:
            with open(json_path) as f:
                raw_txns = json.load(f)

            checking_id = keaton_accounts["Chase Checking"].id
            count = 0
            skipped = 0

            for t in raw_txns:
                try:
                    txn_date = datetime.strptime(t["date"], "%Y-%m-%d").date()
                    # Filter: only keep 2024-2026 data
                    if txn_date.year < 2024 or txn_date.year > 2026:
                        skipped += 1
                        continue

                    cat_raw = t.get("category", "").strip().lower()
                    cat_name = cat_normalize.get(cat_raw, "Discretionary")
                    category = cat_map.get(cat_name) or cat_map.get("Discretionary")

                    pay_raw = (t.get("payment_method") or "").strip().lower()
                    payment = payment_normalize.get(pay_raw, "debit_card")

                    txn = Transaction(
                        user_id=keaton.id,
                        account_id=checking_id,
                        category_id=category.id,
                        date=txn_date,
                        amount=t["amount"],  # already negative (expense)
                        description=t["description"],
                        payment_method=payment,
                        is_verified=True,
                        import_source="Keaton's monthly spending.xlsx",
                        scenario_id=None,  # baseline
                    )
                    db.add(txn)
                    count += 1
                except Exception as e:
                    skipped += 1

            print(f"  Imported {count} transactions ({skipped} skipped)")

        db.commit()
        print("\nSeed complete!")
        print(f"   Keaton login: keaton / finance123")
        print(f"   Katherine login: katherine / finance123")

    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
