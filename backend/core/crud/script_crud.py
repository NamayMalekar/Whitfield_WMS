"""Script run history."""
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from core.database.models import ScriptRun, ScriptStatus, User


def start_run(
    db: Session, *, name: str, kind: str, source: str = "", user: Optional[User] = None
) -> ScriptRun:
    run = ScriptRun(
        name=name,
        kind=kind,
        source=source,
        status=ScriptStatus.RUNNING,
        triggered_by_id=user.id if user else None,
        triggered_by=user.username if user else "scheduler",
        started_at=datetime.utcnow(),
    )
    db.add(run)
    db.flush()
    return run


def finish_run(
    db: Session,
    run: ScriptRun,
    *,
    status: ScriptStatus,
    findings: List[dict],
    output: str,
    duration_ms: int,
) -> ScriptRun:
    run.status = status
    run.findings = findings
    run.output = output[:20_000]
    run.duration_ms = duration_ms
    run.finished_at = datetime.utcnow()
    db.flush()
    return run


def list_runs(db: Session, limit: int = 50) -> List[ScriptRun]:
    return db.query(ScriptRun).order_by(ScriptRun.started_at.desc()).limit(limit).all()


def get_run(db: Session, run_id: str) -> Optional[ScriptRun]:
    return db.query(ScriptRun).filter(ScriptRun.id == run_id).first()
