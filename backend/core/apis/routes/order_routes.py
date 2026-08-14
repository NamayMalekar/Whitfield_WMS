"""Orders and the fulfillment pipeline."""
from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from commons.auth.rbac import require_permission, require_staff, scoped_warehouse_code
from core.apis.schemas.order_schemas import (
    KanbanBoard,
    OrderCreate,
    OrderOut,
    OrderStatusUpdate,
    PackOutUpdate,
)
from core.controllers import order_controller
from core.database.models import OrderStatus, User
from core.database.session import get_db

router = APIRouter(prefix="/orders", tags=["orders"])


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("", response_model=List[OrderOut])
def list_orders(
    warehouse_code: Optional[str] = None,
    status: Optional[OrderStatus] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("order:read")),
):
    scoped_code = scoped_warehouse_code(warehouse_code, current_user)
    return order_controller.list_orders(
        db, warehouse_code=scoped_code, status=status, search=search
    )


@router.get("/board", response_model=KanbanBoard)
def kanban_board(
    warehouse_code: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    scoped_code = scoped_warehouse_code(warehouse_code, current_user)
    return order_controller.kanban(db, scoped_code)


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_staff)
):
    return order_controller.get_order(db, order_id, current_user)


@router.post("", response_model=OrderOut, status_code=201)
def create_order(
    payload: OrderCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("order:create")),
):
    scoped_warehouse_code(payload.warehouse_code, current_user)
    return order_controller.create_order(db, payload, current_user, client_ip(request))


@router.post("/{order_id}/confirm", response_model=OrderOut)
def confirm_order(
    order_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("order:confirm")),
):
    """Reserve stock atomically. Returns 409 if another seller took the units first."""
    return order_controller.confirm_order(db, order_id, current_user, client_ip(request))


@router.patch("/{order_id}/status", response_model=OrderOut)
def change_status(
    order_id: str,
    payload: OrderStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("order:advance")),
):
    return order_controller.change_status(db, order_id, payload, current_user, client_ip(request))


@router.patch("/{order_id}/pack-out", response_model=OrderOut)
def set_pack_out(
    order_id: str,
    payload: PackOutUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("order:advance")),
):
    return order_controller.set_pack_out(db, order_id, payload, current_user, client_ip(request))


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel_order(
    order_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("order:cancel")),
):
    return order_controller.cancel_order(db, order_id, current_user, client_ip(request))
