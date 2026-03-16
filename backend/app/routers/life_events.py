from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.life_event import LifeEvent
from app.models.user import User
from app.schemas.life_event import LifeEventCreate, LifeEventOut, LifeEventUpdate

router = APIRouter(prefix="/events", tags=["life-events"])


def get_event_or_404(event_id: int, user: User, db: Session) -> LifeEvent:
    event = (
        db.query(LifeEvent)
        .filter(LifeEvent.id == event_id, LifeEvent.user_id == user.id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Life event not found")
    return event


@router.get("", response_model=List[LifeEventOut])
def list_life_events(
    scenario_id: Optional[int] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(LifeEvent).filter(LifeEvent.user_id == current_user.id)
    if scenario_id is not None:
        query = query.filter(LifeEvent.scenario_id == scenario_id)
    if is_active is not None:
        query = query.filter(LifeEvent.is_active == is_active)
    return query.order_by(LifeEvent.start_date).all()


@router.post("", response_model=LifeEventOut, status_code=status.HTTP_201_CREATED)
def create_life_event(
    event_in: LifeEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = event_in.model_dump()
    # Serialize monthly_breakdown list of pydantic models to plain dicts
    if data.get("monthly_breakdown"):
        data["monthly_breakdown"] = [
            m if isinstance(m, dict) else m.model_dump()
            for m in data["monthly_breakdown"]
        ]
    event = LifeEvent(**data, user_id=current_user.id)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.put("/{event_id}", response_model=LifeEventOut)
def update_life_event(
    event_id: int,
    event_in: LifeEventUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = get_event_or_404(event_id, current_user, db)
    data = event_in.model_dump(exclude_unset=True)
    if "monthly_breakdown" in data and data["monthly_breakdown"]:
        data["monthly_breakdown"] = [
            m if isinstance(m, dict) else m.model_dump()
            for m in data["monthly_breakdown"]
        ]
    for field, value in data.items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_life_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = get_event_or_404(event_id, current_user, db)
    db.delete(event)
    db.commit()
