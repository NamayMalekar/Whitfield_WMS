"""Audit log writes and reads.

Entries are chained: each row stores the hash of the previous row, so any later
edit to history breaks verification. Combined with the ORM guards in models.py,
the log is append-only in practice, not just by convention.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.database.models import AuditLog, User
from core.utils.locking import critical_section


def record(
    db: Session,
    *,
    action: str,
    user: Optional[User] = None,
    entity_type: str = "",
    entity_id: str = "",
    warehouse_location: str = "",
    details: Optional[Dict[str, Any]] = None,
    ip_address: str = "",
    flush: bool = True,
) -> AuditLog:
    """Append one entry. Caller owns the surrounding transaction."""
    with critical_section(db):
        last = db.query(AuditLog).order_by(AuditLog.sequence.desc()).first()
        entry = AuditLog(
            sequence=(last.sequence + 1) if last else 1,
            user_id=user.id if user else None,
            username=user.username if user else "system",
            role=user.role.value if user else "SYSTEM",
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id or ""),
            warehouse_location=warehouse_location,
            details=details or {},
            ip_address=ip_address,
            timestamp=datetime.utcnow(),
            prev_hash=last.entry_hash if last else "",
        )
        entry.entry_hash = entry.compute_hash()
        db.add(entry)
        if flush:
            db.flush()
    return entry


def list_entries(
    db: Session,
    *,
    username: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    warehouse_location: Optional[str] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> Tuple[int, List[AuditLog]]:
    query = db.query(AuditLog)
    if username:
        query = query.filter(AuditLog.username == username)
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if warehouse_location:
        query = query.filter(AuditLog.warehouse_location == warehouse_location)
    if since:
        query = query.filter(AuditLog.timestamp >= since)
    if until:
        query = query.filter(AuditLog.timestamp <= until)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            AuditLog.action.ilike(pattern)
            | AuditLog.entity_id.ilike(pattern)
            | AuditLog.username.ilike(pattern)
        )

    total = query.with_entities(func.count(AuditLog.id)).scalar() or 0
    entries = (
        query.order_by(AuditLog.sequence.desc()).limit(min(limit, 500)).offset(offset).all()
    )
    return total, entries


def verify_chain(db: Session) -> Tuple[bool, int, Optional[int]]:
    """Recompute every hash. Returns (ok, checked, first_broken_sequence)."""
    entries = db.query(AuditLog).order_by(AuditLog.sequence.asc()).all()
    previous_hash = ""
    for entry in entries:
        if entry.prev_hash != previous_hash or entry.compute_hash() != entry.entry_hash:
            return False, len(entries), entry.sequence
        previous_hash = entry.entry_hash
    return True, len(entries), None
