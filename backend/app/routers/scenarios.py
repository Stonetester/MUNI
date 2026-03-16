from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.life_event import LifeEvent
from app.models.recurring_rule import RecurringRule
from app.models.scenario import Scenario
from app.models.user import User
from app.schemas.scenario import ScenarioCreate, ScenarioOut, ScenarioUpdate, ScenarioCompare
from app.services.forecasting import run_forecast

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


def get_scenario_or_404(scenario_id: int, user: User, db: Session) -> Scenario:
    scenario = (
        db.query(Scenario)
        .filter(Scenario.id == scenario_id, Scenario.user_id == user.id)
        .first()
    )
    if not scenario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    return scenario


@router.get("", response_model=List[ScenarioOut])
def list_scenarios(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Scenario)
        .filter(Scenario.user_id == current_user.id)
        .order_by(Scenario.name)
        .all()
    )


@router.post("", response_model=ScenarioOut, status_code=status.HTTP_201_CREATED)
def create_scenario(
    scenario_in: ScenarioCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scenario = Scenario(**scenario_in.model_dump(), user_id=current_user.id)
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.put("/{scenario_id}", response_model=ScenarioOut)
def update_scenario(
    scenario_id: int,
    scenario_in: ScenarioUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scenario = get_scenario_or_404(scenario_id, current_user, db)
    for field, value in scenario_in.model_dump(exclude_unset=True).items():
        setattr(scenario, field, value)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(
    scenario_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scenario = get_scenario_or_404(scenario_id, current_user, db)
    db.delete(scenario)
    db.commit()


@router.post("/{scenario_id}/clone", response_model=ScenarioOut)
def clone_scenario(
    scenario_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    source = get_scenario_or_404(scenario_id, current_user, db)

    clone = Scenario(
        user_id=current_user.id,
        name=f"{source.name} (Copy)",
        description=source.description,
        is_baseline=False,
        parent_id=source.id,
    )
    db.add(clone)
    db.flush()  # get clone.id

    # Clone recurring rules
    source_rules = (
        db.query(RecurringRule)
        .filter(RecurringRule.scenario_id == source.id)
        .all()
    )
    for rule in source_rules:
        new_rule = RecurringRule(
            user_id=rule.user_id,
            account_id=rule.account_id,
            category_id=rule.category_id,
            scenario_id=clone.id,
            name=rule.name,
            amount=rule.amount,
            frequency=rule.frequency,
            start_date=rule.start_date,
            end_date=rule.end_date,
            next_date=rule.next_date,
            description=rule.description,
            is_active=rule.is_active,
        )
        db.add(new_rule)

    # Clone life events
    source_events = (
        db.query(LifeEvent)
        .filter(LifeEvent.scenario_id == source.id)
        .all()
    )
    for event in source_events:
        new_event = LifeEvent(
            user_id=event.user_id,
            scenario_id=clone.id,
            name=event.name,
            event_type=event.event_type,
            start_date=event.start_date,
            end_date=event.end_date,
            total_cost=event.total_cost,
            description=event.description,
            is_active=event.is_active,
            monthly_breakdown=event.monthly_breakdown,
        )
        db.add(new_event)

    db.commit()
    db.refresh(clone)
    return clone


@router.get("/compare", response_model=ScenarioCompare)
def compare_scenarios(
    baseline_id: int = Query(...),
    scenario_id: int = Query(...),
    months: int = Query(default=60),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_scenario_or_404(baseline_id, current_user, db)
    get_scenario_or_404(scenario_id, current_user, db)

    baseline_forecast = run_forecast(
        user=current_user, db=db, scenario_id=baseline_id, months=months
    )
    scenario_forecast = run_forecast(
        user=current_user, db=db, scenario_id=scenario_id, months=months
    )

    monthly_deltas = []
    for bp, sp in zip(baseline_forecast.points, scenario_forecast.points):
        monthly_deltas.append({
            "month": bp.month,
            "baseline_net_worth": bp.net_worth,
            "scenario_net_worth": sp.net_worth,
            "delta_net_worth": sp.net_worth - bp.net_worth,
            "baseline_cash": bp.cash,
            "scenario_cash": sp.cash,
            "delta_cash": sp.cash - bp.cash,
        })

    return ScenarioCompare(
        baseline_id=baseline_id,
        scenario_id=scenario_id,
        months=months,
        baseline_net_worth_end=baseline_forecast.ending_net_worth,
        scenario_net_worth_end=scenario_forecast.ending_net_worth,
        delta_net_worth=scenario_forecast.ending_net_worth - baseline_forecast.ending_net_worth,
        baseline_cash_end=baseline_forecast.points[-1].cash if baseline_forecast.points else 0,
        scenario_cash_end=scenario_forecast.points[-1].cash if scenario_forecast.points else 0,
        delta_cash=(
            (scenario_forecast.points[-1].cash if scenario_forecast.points else 0)
            - (baseline_forecast.points[-1].cash if baseline_forecast.points else 0)
        ),
        monthly_deltas=monthly_deltas,
    )
