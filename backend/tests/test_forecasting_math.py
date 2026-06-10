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
        self.assertAlmostEqual(point.expenses, 93.33, places=2)
        self.assertAlmostEqual(point.net_worth, result.starting_net_worth + point.net, places=2)
