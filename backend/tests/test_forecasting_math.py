from datetime import date
from unittest import TestCase

from dateutil.relativedelta import relativedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 - registers all model tables
from app.database import Base
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.services.forecasting import run_forecast


class ForecastingMathTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()

        self.user = User(username="math", email="math@example.com", hashed_password="x")
        self.db.add(self.user)
        self.db.flush()
        self.db.add_all([
            Account(user_id=self.user.id, name="Checking", account_type="checking", balance=1000),
            Account(user_id=self.user.id, name="Other asset", account_type="other", balance=500),
        ])

        categories = {
            kind: Category(user_id=self.user.id, name=kind.title(), kind=kind)
            for kind in ("income", "expense", "savings", "transfer")
        }
        self.db.add_all(categories.values())
        self.db.flush()

        transaction_date = date.today() - relativedelta(months=1)
        self.db.add_all([
            Transaction(
                user_id=self.user.id,
                category_id=categories["income"].id,
                date=transaction_date,
                amount=1000,
                description="Paycheck",
            ),
            Transaction(
                user_id=self.user.id,
                category_id=categories["expense"].id,
                date=transaction_date,
                amount=-300,
                description="Expense",
            ),
            Transaction(
                user_id=self.user.id,
                category_id=categories["expense"].id,
                date=transaction_date,
                amount=-600,
                description="One-off expense",
                notes="[one-off]",
            ),
            Transaction(
                user_id=self.user.id,
                category_id=categories["savings"].id,
                date=transaction_date,
                amount=-100,
                description="Savings contribution",
            ),
            Transaction(
                user_id=self.user.id,
                category_id=categories["transfer"].id,
                date=transaction_date,
                amount=-900,
                description="Neutral transfer",
            ),
            Transaction(
                user_id=self.user.id,
                category_id=categories["income"].id,
                date=transaction_date,
                amount=125,
                description="Employer 401k Contribution",
                import_source="paystub:1",
            ),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_forecast_uses_positive_expenses_and_preserves_static_assets(self):
        result = run_forecast(user=self.user, db=self.db, scenario_id=None, months=1)
        point = result.points[0]

        self.assertGreaterEqual(point.expenses, 0)
        self.assertAlmostEqual(point.net, point.income - point.expenses, places=2)
        self.assertAlmostEqual(result.total_expenses, point.expenses, places=2)
        self.assertNotIn("Transfer", point.by_category)
        self.assertAlmostEqual(point.income, 233.33, places=2)
        # Savings-kind outflow ($100 "Savings contribution") is NO LONGER counted as a
        # displayed expense (it's saved, not consumed; it still rolls cash forward).
        # Expenses = the two expense-kind txns only: ($300 + $600 one-off) weighted-avg
        # = 900 * (0.5/3 + 0.3/6 + 0.2/12) = 900 * 0.0777... = 70.00.
        self.assertAlmostEqual(point.expenses, 70.0, places=2)
        # Net worth change = displayed net MINUS the savings outflow that left cash. In
        # production that outflow lands in a tracked savings/HYSA account (net worth
        # unchanged by the move); in this fixture there's no receiving account configured,
        # so cash simply drops by the savings outflow. The savings weighted-avg outflow is
        # $100 * (0.5/3 + 0.3/6 + 0.2/12) = 23.33.
        savings_outflow = 23.33
        self.assertAlmostEqual(
            point.net_worth, result.starting_net_worth + point.net - savings_outflow, places=2
        )
