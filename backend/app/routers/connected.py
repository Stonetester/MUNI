"""Connected cards/checking (SimpleFIN) + daily spend digest endpoints.

Feed data is digest/preview only — never written into `transactions`.
Google Sheets remain the source of truth for transactions.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.connected_account import ConnectedAccount, SimplefinConnection
from app.models.user import User
from app.services import simplefin, spend_digest

router = APIRouter(prefix="/connected", tags=["connected"])


class ClaimIn(BaseModel):
    setup_token: str


class AccountPatch(BaseModel):
    owner: Optional[str] = None  # username, or "joint" to clear; None = leave unchanged
    enabled: Optional[bool] = None
    nickname: Optional[str] = None


class DigestSettingsIn(BaseModel):
    digest_enabled: bool


def _status_payload(db: Session, connection: Optional[SimplefinConnection]) -> dict:
    if connection is None:
        return {"connected": False}
    return {
        "connected": True,
        "claimed_at": connection.claimed_at,
        "last_synced_at": connection.last_synced_at,
        "last_error": connection.last_error,
        "digest_enabled": connection.digest_enabled,
        "last_digest_at": connection.last_digest_at,
        "digest_channel": settings.SLACK_SPEND_CHANNEL,
        "digest_time": f"{settings.SPEND_DIGEST_HOUR:02d}:{settings.SPEND_DIGEST_MINUTE:02d} {settings.DIGEST_TIMEZONE}",
        "slack_configured": bool(settings.SLACK_BOT_TOKEN),
        "accounts": [
            {
                "id": a.id,
                "name": a.name,
                "nickname": a.nickname,
                "org_name": a.org_name,
                "user_id": a.user_id,
                "owner": a.user.username if a.user else None,
                "enabled": a.enabled,
                "balance": a.balance,
                "balance_date": a.balance_date,
                "currency": a.currency,
            }
            for a in sorted(connection.accounts, key=lambda x: (x.org_name or "", x.name))
        ],
    }


@router.get("/status")
def get_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _status_payload(db, spend_digest.get_connection(db))


@router.post("/claim")
def claim_token(
    body: ClaimIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Claim a one-time SimpleFIN setup token and pull the initial account list."""
    if spend_digest.get_connection(db) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A SimpleFIN connection already exists — disconnect it first.",
        )
    try:
        access_url = simplefin.claim_setup_token(body.setup_token)
    except simplefin.SimplefinError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    connection = SimplefinConnection(access_url=access_url, claimed_at=datetime.utcnow())
    db.add(connection)
    db.commit()
    db.refresh(connection)

    # Initial account pull (no transactions needed — accounts always come back).
    try:
        payload = simplefin.fetch_accounts(access_url, include_pending=False)
        spend_digest.refresh_accounts(db, connection, payload)
        connection.last_synced_at = datetime.utcnow()
        db.commit()
    except simplefin.SimplefinError as e:
        connection.last_error = str(e)
        db.commit()

    return _status_payload(db, connection)


@router.patch("/accounts/{account_id}")
def patch_account(
    account_id: int,
    body: AccountPatch,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set an account's owner (Keaton / Katherine / null=Joint), toggle, or rename."""
    acc = db.query(ConnectedAccount).filter(ConnectedAccount.id == account_id).first()
    if acc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connected account not found.")
    if body.owner is not None:
        if body.owner.lower() == "joint":
            acc.user_id = None
        else:
            owner = db.query(User).filter(User.username == body.owner.lower()).first()
            if owner is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown user '{body.owner}'.")
            acc.user_id = owner.id
    if body.enabled is not None:
        acc.enabled = body.enabled
    if body.nickname is not None:
        acc.nickname = body.nickname or None
    db.commit()
    return {"ok": True}


@router.patch("/settings")
def patch_settings(
    body: DigestSettingsIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connection = spend_digest.get_connection(db)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SimpleFIN not connected.")
    connection.digest_enabled = body.digest_enabled
    db.commit()
    return {"ok": True, "digest_enabled": connection.digest_enabled}


@router.get("/today")
def today_preview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Today's card activity, grouped exactly like the digest (live feed pull)."""
    data = spend_digest.gather_digest_data(db)
    data["preview_message"] = spend_digest.build_slack_message(data)
    return data


@router.post("/send-digest")
def send_digest_now(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually send the spend digest to Slack right now."""
    result = spend_digest.send_daily_spend_digest()
    if not result.get("sent"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=result.get("reason") or "Slack post failed — check SLACK_BOT_TOKEN.",
        )
    return result


@router.delete("")
def disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove the SimpleFIN connection and its account rows (feed only — no transactions touched)."""
    connection = spend_digest.get_connection(db)
    if connection is None:
        return {"ok": True}
    db.delete(connection)
    db.commit()
    return {"ok": True}
