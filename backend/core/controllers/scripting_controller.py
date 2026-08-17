"""Routine checks and custom scripts, with every run recorded."""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from core.crud import audit_crud, script_crud
from core.database.models import ScriptStatus, User
from core.modules import routine_checker
from core.modules.routine_checker import ScriptRejected
from core.utils.errors import ValidationError


def list_builtin_checks() -> List[Dict[str, str]]:
    return [
        {
            "key": key,
            "name": spec["name"],
            "description": spec["description"],
            "severity": spec["severity"],
        }
        for key, spec in routine_checker.BUILTIN_CHECKS.items()
    ]


def _status_for(findings) -> ScriptStatus:
    if any(f.severity == "critical" for f in findings):
        return ScriptStatus.FLAGGED
    return ScriptStatus.FLAGGED if findings else ScriptStatus.PASSED


def run_builtin(
    db: Session, checks: Optional[List[str]], warehouse_code: Optional[str], user: User,
    ip_address: str = "",
) -> Dict[str, Any]:
    name = "Morning routine" if not checks else f"Checks: {', '.join(checks)}"
    run = script_crud.start_run(db, name=name, kind="builtin", user=user)
    findings = routine_checker.run_builtin_checks(db, checks, warehouse_code)
    summary = (
        f"{len(findings)} finding(s) across "
        f"{warehouse_code or 'all warehouses'}."
    )
    script_crud.finish_run(
        db, run,
        status=_status_for(findings),
        findings=[f.to_dict() for f in findings],
        output=summary,
        duration_ms=0,
    )
    audit_crud.record(
        db, action="ROUTINE_CHECK_RUN", user=user, entity_type="script_run", entity_id=run.id,
        warehouse_location=warehouse_code or "",
        details={"checks": checks or routine_checker.MORNING_ROUTINE, "findings": len(findings)},
        ip_address=ip_address,
    )
    db.commit()
    db.refresh(run)
    return run


def run_custom(
    db: Session, name: str, source: str, warehouse_code: Optional[str], user: User,
    ip_address: str = "",
) -> Dict[str, Any]:
    run = script_crud.start_run(db, name=name, kind="custom", source=source, user=user)
    try:
        outcome = routine_checker.run_custom_script(db, source, warehouse_code)
    except ScriptRejected as exc:
        script_crud.finish_run(
            db, run, status=ScriptStatus.FAILED, findings=[], output=str(exc), duration_ms=0
        )
        db.commit()
        raise ValidationError(str(exc)) from exc

    findings = outcome["findings"]
    if outcome["timed_out"]:
        status = ScriptStatus.TIMEOUT
    elif outcome["error"]:
        status = ScriptStatus.FAILED
    else:
        status = _status_for(findings)

    output = outcome["output"]
    if outcome["error"]:
        output = f"{output}\n{outcome['error']}".strip()

    script_crud.finish_run(
        db, run,
        status=status,
        findings=[f.to_dict() for f in findings],
        output=output or "Check completed with no output.",
        duration_ms=outcome["duration_ms"],
    )
    audit_crud.record(
        db, action="CUSTOM_SCRIPT_RUN", user=user, entity_type="script_run", entity_id=run.id,
        warehouse_location=warehouse_code or "",
        details={"name": name, "status": status.value, "findings": len(findings)},
        ip_address=ip_address,
    )
    db.commit()
    db.refresh(run)
    return run


def history(db: Session, limit: int = 50):
    return script_crud.list_runs(db, limit)


def sample_script() -> str:
    return routine_checker.SAMPLE_SCRIPT
