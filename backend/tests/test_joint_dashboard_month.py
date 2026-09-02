from datetime import date
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.database import Base
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.routers.joint import joint_summary, joint_transactions


class JointDashboardMonthTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.keaton = User(username="keaton", email="k@example.com", hashed_password="x")
        self.katherine = User(username="katherine", email="kat@example.com", hashed_password="x")
        self.db.add_all([self.keaton, self.katherine])
        self.db.flush()

        food_k = Category(user_id=self.keaton.id, name="Food", kind="expense")
        food_kat = Category(user_id=self.katherine.id, name="Food", kind="expense")
        utilities = Category(user_id=self.katherine.id, name="Utilities", kind="expense")
        salary = Category(user_id=self.keaton.id, name="Salary", kind="income")
        transfer = Category(user_id=self.keaton.id, name="Transfer", kind="transfer")
        self.db.add_all([food_k, food_kat, utilities, salary, transfer])
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.keaton.id, category_id=salary.id, date=date(2026, 8, 1), amount=5000, description="Pay"),
            Transaction(user_id=self.keaton.id, category_id=food_k.id, date=date(2026, 8, 5), amount=-125, description="Groceries"),
            Transaction(user_id=self.katherine.id, category_id=food_kat.id, date=date(2026, 8, 6), amount=-75, description="Dinner"),
            Transaction(user_id=self.katherine.id, category_id=utilities.id, date=date(2026, 8, 31), amount=-200, description="Power"),
            Transaction(user_id=self.keaton.id, category_id=transfer.id, date=date(2026, 8, 10), amount=-900, description="Move money"),
            Transaction(user_id=self.keaton.id, category_id=food_k.id, date=date(2026, 7, 31), amount=-999, description="Other month"),
        ])
        self.db.commit()

    def test_combines_people_and_merges_same_named_categories(self):
        result = joint_summary(month="2026-08", current_user=self.keaton, db=self.db)
        self.assertEqual(result["month"], "2026-08")
        self.assertEqual(result["this_month_income"], 5000)
        self.assertEqual(result["this_month_spending"], 400)
        self.assertEqual(result["savings"], 4600)
        self.assertEqual(result["transaction_count"], 5)
        self.assertEqual(result["by_category"], {"Food": 200, "Utilities": 200})

    def test_joint_transaction_page_uses_same_month_bounds(self):
        result = joint_transactions(limit=50, offset=0, month="2026-08", current_user=self.keaton, db=self.db)
        self.assertEqual(result["total"], 5)
        self.assertTrue(all(item["date"].month == 8 for item in result["items"]))
        expense_flags = {item["description"]: item["is_expense"] for item in result["items"]}
        self.assertTrue(expense_flags["Groceries"])
        self.assertFalse(expense_flags["Move money"])

    def test_rejects_invalid_and_future_months(self):
        with self.assertRaises(HTTPException):
            joint_summary(month="August", current_user=self.keaton, db=self.db)
        with self.assertRaises(HTTPException):
            joint_summary(month="2099-01", current_user=self.keaton, db=self.db)
