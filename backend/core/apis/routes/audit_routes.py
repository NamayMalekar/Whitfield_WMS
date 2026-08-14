"""Audit log."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from commons.auth.jwt import get_current_user
from commons.auth.rbac import require_permission
from core.apis.schemas.audit_schemas import AuditLogPage, ChainVerification
from core.controllers import audit_controller
from core.database.models import User
from core.database.session import get_db

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs", response_model=AuditLogPage)
def logs(
    username: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    warehouse_location: Optional[str] = None,
    search: Optional[str] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """New hires see their own trail; veterans and admins see everything."""
    return audit_controller.list_entries(
        db,
        current_user,
        username=username,
        action=action,
        entity_type=entity_type,
        warehouse_location=warehouse_location,
        search=search,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )


@router.get("/verify", response_model=ChainVerification)
def verify(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("audit:verify")),
):
    """Recompute the hash chain end to end."""
    return audit_controller.verify_chain(db)
