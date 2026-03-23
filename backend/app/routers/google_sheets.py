from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.sync_config import SyncConfig
from app.models.user import User
from app.services.google_sheets_sync import sync_user_sheet

router = APIRouter(prefix="/sync/google-sheets", tags=["google-sheets"])


class SyncConfigIn(BaseModel):
    sheet_id: Optional[str] = None
    is_enabled: bool = True


class SyncConfigOut(BaseModel):
    sheet_id: Optional[str]
    is_enabled: bool
    last_sync_at: Optional[datetime]
    last_sync_status: Optional[str]
    last_sync_message: Optional[str]

    model_config = {"from_attributes": True}


class SyncResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str]
    last_sync_at: datetime
    status: str


def _get_or_create_config(user_id: int, db: Session) -> SyncConfig:
    cfg = db.query(SyncConfig).filter(SyncConfig.user_id == user_id).first()
    if not cfg:
        cfg = SyncConfig(user_id=user_id, last_sync_status="never")
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/config", response_model=SyncConfigOut)
def get_sync_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_or_create_config(current_user.id, db)


@router.put("/config", response_model=SyncConfigOut)
def update_sync_config(
    data: SyncConfigIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cfg = _get_or_create_config(current_user.id, db)
    cfg.sheet_id = data.sheet_id
    cfg.is_enabled = data.is_enabled
    db.commit()
    db.refresh(cfg)
    return cfg


@router.post("/run", response_model=SyncResult)
def run_sync_now(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually trigger a sync for the current user."""
    cfg = _get_or_create_config(current_user.id, db)
    if not cfg.sheet_id:
        raise HTTPException(status_code=400, detail="No Sheet ID configured. Add it in Settings first.")

    result = sync_user_sheet(current_user.id, cfg.sheet_id, db)

    now = datetime.utcnow()
    cfg.last_sync_at = now
    cfg.last_sync_status = "error" if result["errors"] else "success"
    cfg.last_sync_message = (
        "; ".join(result["errors"]) if result["errors"]
        else f"Imported {result['imported']}, updated {result.get('updated', 0)}, skipped {result['skipped']}"
    )
    db.commit()

    return SyncResult(
        imported=result["imported"],
        skipped=result["skipped"],
        errors=result["errors"],
        last_sync_at=now,
        status=cfg.last_sync_status,
    )
