"""
Dedicated import router - thin wrapper that delegates to the transactions import endpoint.
Kept as a separate router for API clarity.
"""
from typing import Optional

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.transaction import ImportResult
from app.services.import_service import import_transactions

router = APIRouter(prefix="/import", tags=["import"])


@router.post("", response_model=ImportResult)
async def import_file(
    file: UploadFile = File(...),
    account_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    filename = (file.filename or "upload.csv").lower()

    return import_transactions(
        content=content,
        filename=filename,
        user=current_user,
        db=db,
        account_id=account_id,
    )
