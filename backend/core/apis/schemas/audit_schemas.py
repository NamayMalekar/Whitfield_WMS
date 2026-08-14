"""Audit log contracts."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sequence: int
    username: str
    role: str
    action: str
    entity_type: str
    entity_id: str
    warehouse_location: str
    details: dict = {}
    timestamp: datetime
    entry_hash: str


class AuditLogPage(BaseModel):
    total: int
    limit: int
    offset: int
    entries: List[AuditLogOut]


class ChainVerification(BaseModel):
    verified: bool
    entries_checked: int
    first_broken_sequence: Optional[int] = None
    message: str
