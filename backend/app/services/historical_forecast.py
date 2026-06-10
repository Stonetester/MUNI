from collections import defaultdict
from datetime import date
from typing import Iterable

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.balance_snapshot import BalanceSnapshot
from app.models.transaction import Transaction
from app.schemas.forecast import ForecastPoint, NetWorthBreakdownItem
from app.services.forecasting import LIABILITY_TYPES
from app.services.transaction_math import counts_as_expense, counts_as_income


def build_historical_forecast_points(
    db: Session,
    user_ids: Iterable[int],
    account_ids: Iterable[int],
    past_months: int,
) -> list[ForecastPoint]:
    """Build historical net worth from recorded month-end account snapshots."""
    today = date.today()
    current_month_start = today.replace(day=1)
    first_month_start = current_month_start - relativedelta(months=past_months)
    user_ids = list(user_ids)
    account_ids = list(account_ids)
    accounts = (
        db.query(Account)
        .filter(Account.id.in_(account_ids), Account.is_active == True)
        .order_by(Account.name)
        .all()
    )
    snapshots = (
        db.query(BalanceSnapshot)
        .filter(
            BalanceSnapshot.account_id.in_(account_ids),
            BalanceSnapshot.date < current_month_start,
        )
        .order_by(BalanceSnapshot.account_id, BalanceSnapshot.date)
        .all()
    )
    snapshots_by_account: dict[int, list[BalanceSnapshot]] = defaultdict(list)
    for snapshot in snapshots:
        snapshots_by_account[snapshot.account_id].append(snapshot)

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
        if counts_as_income(transaction):
            monthly_income[month] += transaction.amount
        elif counts_as_expense(transaction):
            monthly_expenses[month] += abs(transaction.amount)

    historical_points: list[ForecastPoint] = []
    for i in range(past_months, 0, -1):
        month_start = current_month_start - relativedelta(months=i)
        month_end = current_month_start - relativedelta(months=i - 1, days=1)
        month = month_start.strftime("%Y-%m")
        income = monthly_income[month]
        expenses = monthly_expenses[month]
        net = income - expenses
        breakdown: list[NetWorthBreakdownItem] = []
        assets = 0.0
        liabilities = 0.0
        recorded_count = 0

        for account in accounts:
            eligible = [
                snapshot
                for snapshot in snapshots_by_account.get(account.id, [])
                if snapshot.date <= month_end
            ]
            snapshot = eligible[-1] if eligible else None
            balance = float(snapshot.balance) if snapshot else 0.0
            is_liability = account.account_type in LIABILITY_TYPES or balance < 0
            if snapshot:
                recorded_count += 1
                if is_liability:
                    liabilities += abs(balance)
                elif balance > 0:
                    assets += balance
            breakdown.append(NetWorthBreakdownItem(
                account_id=account.id,
                account_name=account.name,
                account_type=account.account_type,
                balance=round(balance, 2),
                is_liability=is_liability,
                source="recorded snapshot" if snapshot else "no balance recorded",
                as_of=snapshot.date.isoformat() if snapshot else None,
            ))

        net_worth = assets - liabilities
        historical_points.append(ForecastPoint(
            month=month,
            income=income,
            expenses=expenses,
            net=net,
            cash=0.0,
            net_worth=round(net_worth, 2),
            savings_total=0.0,
            low_cash=0.0,
            high_cash=0.0,
            event_impact=0.0,
            net_worth_breakdown=breakdown,
            calculation_method="recorded_snapshots",
            calculation_note=(
                f"Assets minus liabilities using the latest recorded balance on or before "
                f"{month_end.isoformat()}. Coverage: {recorded_count} of {len(accounts)} accounts; "
                "accounts without a recorded balance count as $0."
            ),
        ))

    return historical_points
