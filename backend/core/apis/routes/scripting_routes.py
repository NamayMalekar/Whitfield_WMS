"""Automated checks and the script sandbox."""
from typing import List

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from commons.auth.rbac import require_permission
from core.apis.schemas.script_schemas import (
    BuiltinCheck,
    RunBuiltinRequest,
    RunCustomScriptRequest,
    ScriptRunOut,
)
from core.controllers import scripting_controller
from core.database.models import User
from core.database.session import get_db

router = APIRouter(prefix="/scripts", tags=["scripting"])


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("/checks", response_model=List[BuiltinCheck])
def builtin_checks(_: User = Depends(require_permission("script:run"))):
    return scripting_controller.list_builtin_checks()


@router.get("/sample")
def sample_script(_: User = Depends(require_permission("script:run"))):
    return {"source": scripting_controller.sample_script()}


@router.get("/runs", response_model=List[ScriptRunOut])
def run_history(
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("script:run")),
):
    return scripting_controller.history(db, limit)


@router.post("/run-checks", response_model=ScriptRunOut)
def run_checks(
    payload: RunBuiltinRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("script:run")),
):
    """Run the morning routine, or a named subset of checks."""
    return scripting_controller.run_builtin(
        db, payload.checks, payload.warehouse_code, current_user, client_ip(request)
    )


@router.post("/run-custom", response_model=ScriptRunOut)
def run_custom(
    payload: RunCustomScriptRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("script:write")),
):
    """Run a custom check in the sandbox. Admin only."""
    return scripting_controller.run_custom(
        db, payload.name, payload.source, payload.warehouse_code, current_user, client_ip(request)
    )
