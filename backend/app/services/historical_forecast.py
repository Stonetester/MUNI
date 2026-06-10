from collections import defaultdict
from datetime import date
from typing import Iterable

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models.transaction import Transaction
from app.schemas.forecast import ForecastPoint


def _counts_as_income(transaction: Transaction) -> bool:
    return (
        transaction.amount > 0
        and not (
            transaction.import_source
            and transaction.import_source.startswith("paystub:")
            and transaction.description
            and "Employer 401k" in transaction.description
        )
    )


def build_historical_forecast_points(
    db: Session,
    user_ids: Iterable[int],
    past_months: int,
    starting_net_worth: float,
    starting_cash: float,
) -> list[ForecastPoint]:
    """Backcast historical balances from actual monthly cash flow.

    Exact historical net worth requires complete account snapshots. Most users have
    much deeper transaction history than snapshot history, so anchor the curve to
    today's real balances and walk backward through actual income and expenses.
    """
    today = date.today()
    current_month_start = today.replace(day=1)
    first_month_start = current_month_start - relativedelta(months=past_months)
    user_ids = list(user_ids)

    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id.in_(user_ids),
            Transaction.date >= first_month_start,
            Transaction.date <= today,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )

    monthly_income: dict[str, float] = defaultdict(float)
    monthly_expenses: dict[str, float] = defaultdict(float)
    for transaction in transactions:
        month = transaction.date.strftime("%Y-%m")
        if _counts_as_income(transaction):
            monthly_income[month] += transaction.amount
        elif transaction.amount < 0:
            monthly_expenses[month] += abs(transaction.amount)

    current_month = current_month_start.strftime("%Y-%m")
    current_month_net = monthly_income[current_month] - monthly_expenses[current_month]
    running_net_worth = starting_net_worth - current_month_net
    running_cash = starting_cash - current_month_net
    reverse_points: list[ForecastPoint] = []

    for i in range(1, past_months + 1):
        month_start = current_month_start - relativedelta(months=i)
        month = month_start.strftime("%Y-%m")
        income = monthly_income[month]
        expenses = monthly_expenses[month]
        net = income - expenses

        reverse_points.append(ForecastPoint(
            month=month,
            income=income,
            expenses=expenses,
            net=net,
            cash=running_cash,
            net_worth=running_net_worth,
            savings_total=0.0,
            low_cash=running_cash,
            high_cash=running_cash,
            event_impact=0.0,
        ))
        running_net_worth -= net
        running_cash -= net

    return list(reversed(reverse_points))
