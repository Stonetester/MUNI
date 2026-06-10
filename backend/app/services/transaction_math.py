from app.models.transaction import Transaction


NON_CASH_FLOW_KINDS = {"savings", "transfer"}
ONE_OFF_MARKER = "[one-off]"


def is_employer_401k(transaction: Transaction) -> bool:
    """Employer contributions increase retirement assets, not spendable cash."""
    return bool(
        transaction.import_source
        and transaction.import_source.startswith("paystub:")
        and transaction.description
        and "Employer 401k" in transaction.description
    )


def counts_as_income(transaction: Transaction) -> bool:
    return (
        transaction.amount > 0
        and (not transaction.category or transaction.category.kind not in NON_CASH_FLOW_KINDS)
        and not is_employer_401k(transaction)
    )


def counts_as_expense(transaction: Transaction) -> bool:
    return (
        transaction.amount < 0
        and (not transaction.category or transaction.category.kind not in NON_CASH_FLOW_KINDS)
    )


def is_one_off(transaction: Transaction) -> bool:
    """One-off expenses affect actual cash flow but should not set recurring pace."""
    return bool(transaction.notes and ONE_OFF_MARKER in transaction.notes.lower())


def counts_in_forecast_cash_flow(transaction: Transaction) -> bool:
    """Keep savings transfers for account funding, but exclude neutral transfers."""
    return (
        (not transaction.category or transaction.category.kind != "transfer")
        and not is_employer_401k(transaction)
    )


def counts_in_recurring_forecast(transaction: Transaction) -> bool:
    return counts_in_forecast_cash_flow(transaction) and not is_one_off(transaction)
