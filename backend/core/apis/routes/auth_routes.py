"""Authentication and user administration."""
from typing import List

from fastapi import APIRouter, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from commons.auth.jwt import get_current_user
from commons.auth.rbac import permissions_for, require_admin
from core.apis.schemas.auth_schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserCreate,
    UserOut,
    UserUpdate,
)
from core.controllers import auth_controller
from core.crud import user_crud
from core.database.models import User
from core.database.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    return auth_controller.login(db, payload.username, payload.password, client_ip(request))


@router.post("/token", response_model=TokenResponse, include_in_schema=False)
def login_form(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """OAuth2 form login so the /docs Authorize button works."""
    return auth_controller.login(db, form.username, form.password, client_ip(request))


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Public and unauthenticated by design - this is how a locked-out
    person gets back in. Always answers the same way either way, so it
    can't be used to enumerate accounts."""
    return auth_controller.forgot_password(db, payload.username_or_email, client_ip(request))


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    return auth_controller.reset_password(db, payload.token, payload.new_password, client_ip(request))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/me/permissions", response_model=List[str])
def my_permissions(current_user: User = Depends(get_current_user)):
    return permissions_for(current_user.role)


@router.get("/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return user_crud.list_users(db)


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return auth_controller.register(db, payload, current_user, client_ip(request))


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    payload: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return auth_controller.update_user(db, user_id, payload, current_user, client_ip(request))
