from datetime import date
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.database import Base
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.routers.dashboard import _month_bounds, get_dashboard


class DashboardMonthTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.user = User(username="keaton", email="k@example.com", hashed_password="x")
        self.db.add(self.user)
        self.db.flush()
        food = Category(user_id=self.user.id, name="Food", kind="expense")
        salary = Category(user_id=self.user.id, name="Salary", kind="income")
        self.db.add_all([food, salary])
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.user.id, category_id=salary.id, date=date(2026, 8, 1), amount=5000, description="Pay"),
            Transaction(user_id=self.user.id, category_id=food.id, date=date(2026, 8, 5), amount=-125, description="Groceries"),
            Transaction(user_id=self.user.id, category_id=food.id, date=date(2026, 7, 31), amount=-999, description="Other month"),
        ])
        self.db.commit()

    @patch("app.routers.dashboard.run_forecast", return_value=SimpleNamespace(points=[]))
    def test_selected_month_drives_summary_and_recent_transactions(self, _forecast):
        result = get_dashboard(month="2026-08", current_user=self.user, db=self.db)
        self.assertEqual(result.month, "2026-08")
        self.assertEqual(result.this_month.income, 5000)
        self.assertEqual(result.this_month.spending, 125)
        self.assertEqual(result.this_month.by_category, {"Food": 125})
        self.assertEqual([item.description for item in result.recent_transactions], ["Groceries", "Pay"])

    def test_rejects_invalid_and_future_months(self):
        with self.assertRaises(HTTPException):
            _month_bounds("August")
        with self.assertRaises(HTTPException):
            _month_bounds("2099-01")
