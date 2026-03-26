"""Notifications router — email settings and digest preview/send."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.email_service import (
    build_weekly_digest_html,
    _gather_week_data,
    send_weekly_digest_for_user,
    _gather_snapshot_data,
    send_snapshot_reminder_for_user,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


class EmailSettingsIn(BaseModel):
    notification_email: Optional[str] = None
    weekly_digest_enabled: bool = True


@router.get("/settings")
def get_notification_settings(current_user: User = Depends(get_current_user)):
    """Return current notification settings for the user."""
    return {
        "notification_email": getattr(current_user, "notification_email", None) or current_user.email,
        "weekly_digest_enabled": True,  # always on when email is set
    }


@router.put("/settings")
def update_notification_settings(
    body: EmailSettingsIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the email address for notifications."""
    # Store on user model if column exists, otherwise just return it
    if hasattr(current_user, "notification_email"):
        current_user.notification_email = body.notification_email
        db.commit()
    return {
        "notification_email": body.notification_email,
        "weekly_digest_enabled": body.weekly_digest_enabled,
    }


@router.get("/weekly-preview")
def preview_weekly_digest(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the weekly digest data (for frontend preview)."""
    data = _gather_week_data(current_user, db)
    return data


@router.get("/snapshot-preview")
def preview_snapshot_reminder(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return list of stale accounts for the snapshot reminder preview."""
    return _gather_snapshot_data(current_user, db)


@router.post("/send-snapshot")
def send_snapshot_now(
    body: dict = {},
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually send the snapshot reminder email."""
    email = body.get("email") or getattr(current_user, "notification_email", None) or current_user.email
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No email address configured.",
        )
    stale = _gather_snapshot_data(current_user, db)
    if not stale:
        return {"sent": False, "reason": "No stale accounts to remind about.", "to": email}
    success = send_snapshot_reminder_for_user(current_user, email, db)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to send email. Check SMTP configuration.",
        )
    return {"sent": True, "to": email, "stale_count": len(stale)}


@router.post("/send-weekly")
def send_weekly_now(
    body: dict = {},
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually trigger a weekly digest email."""
    email = body.get("email") or getattr(current_user, "notification_email", None) or current_user.email
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No email address configured. Set one in notification settings.",
        )
    success = send_weekly_digest_for_user(current_user, email, db)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to send email. Check SMTP configuration (SMTP_USER, SMTP_PASSWORD).",
        )
    return {"sent": True, "to": email}
