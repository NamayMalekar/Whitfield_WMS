"""Sign-in, account creation and the current-session payload."""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from commons.auth.jwt import create_access_token
from commons.auth.rbac import assert_can_grant_role, permissions_for
from commons.auth.security import hash_password, verify_password
from commons.logger.logger import get_logger
from core.crud import audit_crud, user_crud
from core.database.models import Role, User, Warehouse
from core.utils.config import settings
from core.utils.errors import NotFoundError, ValidationError

logger = get_logger(__name__)


def login(db: Session, username: str, password: str, ip_address: str = "") -> dict:
    user = user_crud.get_by_username(db, username)
    if user is None or not verify_password(password, user.hashed_password):
        # Same message either way - do not confirm which usernames exist.
        audit_crud.record(
            db, action="LOGIN_FAILED", entity_type="user", entity_id=username,
            details={"reason": "bad credentials"}, ip_address=ip_address,
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username or password is incorrect.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is deactivated. Ask an admin to re-enable it.",
        )

    user_crud.touch_login(db, user)
    audit_crud.record(
        db, action="LOGIN", user=user, entity_type="user", entity_id=user.id,
        warehouse_location=user.warehouse.code if user.warehouse else "",
        ip_address=ip_address,
    )
    db.commit()
    logger.info("login", extra={"username": user.username, "role": user.role.value})

    token = create_access_token(
        user.id, {"username": user.username, "role": user.role.value}
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in_minutes": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        "user": user,
        "permissions": permissions_for(user.role),
    }


def register(db: Session, payload, actor: User, ip_address: str = "") -> User:
    # Signup is admin-gated (the route itself requires ADMIN+), but on top of
    # that: only a SUPERADMIN can hand out ADMIN/SUPERADMIN access, and a
    # MANAGER account must be tied to exactly one building - that's what
    # keeps Reno's manager and Columbus's manager as two separate accounts
    # that can't see or touch each other's side.
    assert_can_grant_role(actor, payload.role)
    if payload.role == Role.MANAGER and not payload.warehouse_code:
        raise ValidationError("A manager account needs a home building.")

    user = user_crud.create_user(
        db,
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        password=payload.password,
        role=payload.role,
        warehouse_code=payload.warehouse_code,
    )
    audit_crud.record(
        db, action="USER_CREATED", user=actor, entity_type="user", entity_id=user.id,
        details={"username": user.username, "role": user.role.value},
        ip_address=ip_address,
    )
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user_id: str, payload, actor: User, ip_address: str = "") -> User:
    user = user_crud.get_by_id(db, user_id)
    if user is None:
        raise NotFoundError("That user does not exist.")

    changes = {}
    if payload.full_name is not None:
        user.full_name = payload.full_name
        changes["full_name"] = payload.full_name
    if payload.role is not None:
        assert_can_grant_role(actor, payload.role)
        changes["role"] = f"{user.role.value} -> {payload.role.value}"
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
        changes["is_active"] = payload.is_active
    if payload.password:
        user.hashed_password = hash_password(payload.password)
        changes["password"] = "reset"
    if payload.warehouse_code:
        warehouse = (
            db.query(Warehouse).filter(Warehouse.code == payload.warehouse_code.upper()).first()
        )
        if warehouse is None:
            raise NotFoundError(f"Warehouse '{payload.warehouse_code}' does not exist.")
        user.warehouse_id = warehouse.id
        changes["warehouse"] = warehouse.code

    audit_crud.record(
        db, action="USER_UPDATED", user=actor, entity_type="user", entity_id=user.id,
        details=changes, ip_address=ip_address,
    )
    db.commit()
    db.refresh(user)
    return user


def forgot_password(db: Session, username_or_email: str, ip_address: str = "") -> dict:
    """Always returns the same generic message, whether or not the account
    exists - that's what stops this endpoint from being used to check who
    has an account here."""
    identifier = username_or_email.strip()
    user = user_crud.get_by_username(db, identifier) or user_crud.get_by_email(db, identifier)
    message = "If that account exists, a password reset link has been sent to it."

    if user is not None and user.is_active:
        raw_token = user_crud.create_reset_token(db, user)
        audit_crud.record(
            db, action="PASSWORD_RESET_REQUESTED", user=user, entity_type="user",
            entity_id=user.id, ip_address=ip_address,
        )
        db.commit()
        # No email/SMS provider is wired up in this environment, so the
        # reset link goes to the server log instead of an inbox. Wire a real
        # mail sender in here before shipping this to production.
        logger.info(
            "password_reset_link",
            extra={"username": user.username, "reset_token": raw_token},
        )
    return {"message": message}


def reset_password(db: Session, token: str, new_password: str, ip_address: str = "") -> dict:
    user = user_crud.consume_reset_token(db, token)
    user.hashed_password = hash_password(new_password)
    audit_crud.record(
        db, action="PASSWORD_RESET_COMPLETED", user=user, entity_type="user",
        entity_id=user.id, ip_address=ip_address,
    )
    db.commit()
    logger.info("password_reset_completed", extra={"username": user.username})
    return {"message": "Password updated. Sign in with your new password."}


def bootstrap_admin_exists(db: Session) -> bool:
    return db.query(User).filter(User.role == Role.ADMIN).first() is not None


def session_payload(user: User) -> dict:
    return {"user": user, "permissions": permissions_for(user.role)}


def find_user(db: Session, username: str) -> Optional[User]:
    return user_crud.get_by_username(db, username)
