"""Audit log reads and chain verification."""
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from commons.auth.rbac import sees_all_warehouses
from core.crud import audit_crud
from core.database.models import Role, User


def list_entries(db: Session, user: User, **filters) -> Dict[str, Any]:
    # New hires only ever see their own trail.
    if user.role == Role.NEWHIRE:
        filters["username"] = user.username

    # Everyone below ADMIN/SUPERADMIN is locked to their own building's
    # activity - including MANAGER, so a Reno manager can't page through
    # Columbus's log (and vice versa). Admins and superadmins see both,
    # which is how they keep an eye on both managers at once.
    if not sees_all_warehouses(user):
        home_code = user.warehouse.code if user.warehouse else None
        filters["warehouse_location"] = home_code or "__none__"

    limit = filters.pop("limit", 100)
    offset = filters.pop("offset", 0)
    total, entries = audit_crud.list_entries(db, limit=limit, offset=offset, **filters)
    return {"total": total, "limit": limit, "offset": offset, "entries": entries}


def verify_chain(db: Session) -> Dict[str, Any]:
    verified, checked, broken = audit_crud.verify_chain(db)
    if verified:
        message = f"All {checked} entries verify against the hash chain."
    else:
        message = (
            f"Chain breaks at entry {broken}. Entries from that point on cannot be trusted - "
            "restore from backup and investigate database access."
        )
    return {
        "verified": verified,
        "entries_checked": checked,
        "first_broken_sequence": broken,
        "message": message,
    }
