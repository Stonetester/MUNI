from types import SimpleNamespace
from unittest import TestCase

from app.services.transaction_math import (
    counts_as_expense,
    counts_as_income,
    counts_in_forecast_cash_flow,
    counts_in_recurring_forecast,
    is_one_off,
)


def transaction(amount, kind=None, description="", import_source=None, notes=None):
    category = SimpleNamespace(kind=kind) if kind else None
    return SimpleNamespace(
        amount=amount,
        category=category,
        description=description,
        import_source=import_source,
        notes=notes,
    )


class TransactionMathTests(TestCase):
    def test_true_income_and_expense(self):
        self.assertTrue(counts_as_income(transaction(100, "income")))
        self.assertTrue(counts_as_expense(transaction(-40, "expense")))

    def test_savings_and_transfers_are_not_income_or_expenses(self):
        for kind in ("savings", "transfer"):
            self.assertFalse(counts_as_income(transaction(100, kind)))
            self.assertFalse(counts_as_expense(transaction(-100, kind)))

    def test_forecast_keeps_savings_but_not_neutral_transfers(self):
        self.assertTrue(counts_in_forecast_cash_flow(transaction(-100, "savings")))
        self.assertFalse(counts_in_forecast_cash_flow(transaction(-100, "transfer")))

    def test_one_off_counts_in_actuals_but_not_recurring_forecast(self):
        one_off = transaction(-500, "expense", notes="Reviewed [one-off]")
        self.assertTrue(is_one_off(one_off))
        self.assertTrue(counts_as_expense(one_off))
        self.assertTrue(counts_in_forecast_cash_flow(one_off))
        self.assertFalse(counts_in_recurring_forecast(one_off))

    def test_employer_401k_is_not_spendable_income_or_forecast_cash(self):
        employer_401k = transaction(
            125,
            "income",
            description="Employer 401k Contribution",
            import_source="paystub:1",
        )
        self.assertFalse(counts_as_income(employer_401k))
        self.assertFalse(counts_in_forecast_cash_flow(employer_401k))
