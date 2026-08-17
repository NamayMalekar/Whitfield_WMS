"""Row locking that behaves correctly on both PostgreSQL and SQLite.

PostgreSQL/MySQL: real `SELECT ... FOR UPDATE` row locks.
SQLite: the dialect has no row locks, so writers are serialized through a
process-wide reentrant lock. That is honest single-process protection for local
development; run PostgreSQL when more than one API process is serving traffic.
"""
import threading
from contextlib import contextmanager
from functools import wraps

from sqlalchemy.orm import Query, Session

DIALECTS_WITH_ROW_LOCKS = {"postgresql", "mysql", "mariadb", "oracle", "mssql"}

_WRITE_SERIALIZER = threading.RLock()
_DEPTH = threading.local()


def dialect_supports_row_locks(db: Session) -> bool:
    return db.bind is not None and db.bind.dialect.name in DIALECTS_WITH_ROW_LOCKS


def lock_rows(query: Query, db: Session) -> Query:
    """Apply `FOR UPDATE` where the backend supports it."""
    if dialect_supports_row_locks(db):
        return query.with_for_update(nowait=False, of=None)
    return query


@contextmanager
def critical_section(db: Session):
    """Serialize a read-modify-write block when the backend cannot lock rows.

    On entry at the outermost level the session's loaded objects are expired, so
    the block reads current committed state rather than values cached before the
    lock was acquired. Nested entries reuse the same lock and skip that step.

    The lock must be held until the surrounding transaction commits, which is
    why controllers wrap the whole mutate-audit-commit sequence with
    `@serialized` rather than relying on the CRUD layer alone.
    """
    if dialect_supports_row_locks(db):
        yield
        return

    depth = getattr(_DEPTH, "value", 0)
    _WRITE_SERIALIZER.acquire()
    _DEPTH.value = depth + 1
    try:
        if depth == 0:
            # Drop cached attribute values so the block re-reads committed state
            # from the database rather than trusting anything loaded before the
            # lock was held. Pending work in this session is not affected.
            db.expire_all()
        yield
    finally:
        _DEPTH.value = depth
        _WRITE_SERIALIZER.release()


def serialized(fn):
    """Decorator for controller functions whose first argument is the session."""

    @wraps(fn)
    def wrapper(db: Session, *args, **kwargs):
        with critical_section(db):
            return fn(db, *args, **kwargs)

    return wrapper
