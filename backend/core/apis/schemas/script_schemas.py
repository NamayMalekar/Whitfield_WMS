"""Scripting engine contracts."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from core.database.models import ScriptStatus


class BuiltinCheck(BaseModel):
    key: str
    name: str
    description: str
    severity: str


class RunBuiltinRequest(BaseModel):
    checks: Optional[List[str]] = None
    warehouse_code: Optional[str] = None


class RunCustomScriptRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    source: str = Field(..., min_length=5, max_length=20_000)
    warehouse_code: Optional[str] = None


class Finding(BaseModel):
    check: str
    severity: str
    warehouse_code: Optional[str] = None
    entity: Optional[str] = None
    message: str
    data: Dict[str, Any] = {}


class ScriptRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    kind: str
    status: ScriptStatus
    findings: List[Finding] = []
    output: str = ""
    duration_ms: int
    triggered_by: str
    started_at: datetime
    finished_at: Optional[datetime] = None
