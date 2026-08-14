"""User persistence."""
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from commons.auth.security import hash_password
from core.database.models import PasswordResetToken, Role, User, Warehouse
from core.utils.errors import ConflictError, NotFoundError

RESET_TOKEN_TTL_MINUTES = 30


def get_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username.lower().strip()).first()


def get_by_id(db: Session, user_id: str) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def list_users(db: Session) -> List[User]:
    return db.query(User).order_by(User.created_at.asc()).all()


def create_user(
    db: Session,
    *,
    username: str,
    email: str,
    full_name: str,
    password: str,
    role: Role = Role.NEWHIRE,
    warehouse_code: Optional[str] = None,
) -> User:
    username = username.lower().strip()
    if get_by_username(db, username):
        raise ConflictError(f"Username '{username}' is already taken.")
    if db.query(User).filter(User.email == email).first():
        raise ConflictError(f"Email '{email}' is already registered.")

    warehouse = None
    if warehouse_code:
        warehouse = db.query(Warehouse).filter(Warehouse.code == warehouse_code.upper()).first()
        if warehouse is None:
            raise NotFoundError(f"Warehouse '{warehouse_code}' does not exist.")

    user = User(
        username=username,
        email=email.lower().strip(),
        full_name=full_name.strip(),
        hashed_password=hash_password(password),
        role=role,
        warehouse_id=warehouse.id if warehouse else None,
    )
    db.add(user)
    db.flush()
    return user


def touch_login(db: Session, user: User) -> None:
    user.last_login_at = datetime.utcnow()
    db.flush()


def get_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.lower().strip()).first()


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_reset_token(db: Session, user: User) -> str:
    """Returns the raw token - only ever visible once, to the caller.

    Any older, unused tokens for this account are invalidated first so a
    stale link left over from an earlier request can't still be redeemed.
    """
    (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .update({"used_at": datetime.utcnow()})
    )
    raw_token = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw_token),
            expires_at=datetime.utcnow() + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
        )
    )
    db.flush()
    return raw_token


def consume_reset_token(db: Session, raw_token: str) -> User:
    """Validates a reset token and marks it used. Raises NotFoundError on
    anything wrong with it (unknown, expired, or already used) - the same
    generic error either way, so a bad token can't be used to fingerprint
    which tokens are real."""
    record = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == _hash_token(raw_token))
        .first()
    )
    if (
        record is None
        or record.used_at is not None
        or record.expires_at < datetime.utcnow()
    ):
        raise NotFoundError("This reset link is invalid or has expired. Request a new one.")
    record.used_at = datetime.utcnow()
    user = get_by_id(db, record.user_id)
    if user is None:
        raise NotFoundError("This reset link is invalid or has expired. Request a new one.")
    db.flush()
    return user
