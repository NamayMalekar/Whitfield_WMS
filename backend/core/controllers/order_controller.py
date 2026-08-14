"""Order business logic and the Kanban view model."""
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from commons.auth.rbac import sees_all_warehouses
from core.controllers.serializers import order_out
from core.crud import audit_crud, order_crud
from core.database.models import Order, OrderStatus, User
from core.utils.locking import serialized

KANBAN_COLUMNS = [
    OrderStatus.RECEIVED,
    OrderStatus.PULLING,
    OrderStatus.PACKING,
    OrderStatus.SHIPPED,
]


def _assert_order_access(order: Order, user: Optional[User]) -> None:
    """A single order belongs to one building - block anyone whose account
    is not that building's, no matter how they reached this order_id."""
    if user is None or sees_all_warehouses(user):
        return
    if order.warehouse_id != user.warehouse_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This order belongs to a different building than your account.",
        )


def list_orders(db: Session, **filters) -> List[Dict[str, Any]]:
    return [order_out(order) for order in order_crud.list_orders(db, **filters)]


def get_order(db: Session, order_id: str, user: Optional[User] = None) -> Dict[str, Any]:
    order = order_crud.get_order(db, order_id)
    _assert_order_access(order, user)
    return order_out(order)


@serialized
def create_order(db: Session, payload, user: User, ip_address: str = "") -> Dict[str, Any]:
    order = order_crud.create_order(
        db,
        customer_name=payload.customer_name,
        destination=payload.destination,
        warehouse_code=payload.warehouse_code,
        priority=payload.priority,
        items=[item.model_dump() for item in payload.items],
        user=user,
    )
    audit_crud.record(
        db, action="ORDER_CREATED", user=user, entity_type="order", entity_id=order.order_number,
        warehouse_location=order.warehouse.code,
        details={"customer": order.customer_name, "lines": len(order.items)},
        ip_address=ip_address,
    )
    db.commit()
    return order_out(order_crud.get_order(db, order.id))


@serialized
def confirm_order(db: Session, order_id: str, user: User, ip_address: str = "") -> Dict[str, Any]:
    _assert_order_access(order_crud.get_order(db, order_id), user)
    order = order_crud.confirm_order(db, order_id, user)
    audit_crud.record(
        db, action="ORDER_CONFIRMED", user=user, entity_type="order",
        entity_id=order.order_number, warehouse_location=order.warehouse.code,
        details={
            "reserved": {item.product.sku: item.quantity for item in order.items},
        },
        ip_address=ip_address,
    )
    db.commit()
    return order_out(order_crud.get_order(db, order_id))


@serialized
def change_status(
    db: Session, order_id: str, payload, user: User, ip_address: str = ""
) -> Dict[str, Any]:
    existing = order_crud.get_order(db, order_id)
    _assert_order_access(existing, user)
    previous = existing.status
    order = order_crud.change_status(db, order_id, payload.status, user)
    audit_crud.record(
        db, action="ORDER_STATUS_CHANGED", user=user, entity_type="order",
        entity_id=order.order_number, warehouse_location=order.warehouse.code,
        details={"from": previous.value, "to": order.status.value, "note": payload.note},
        ip_address=ip_address,
    )
    db.commit()
    return order_out(order_crud.get_order(db, order_id))


@serialized
def cancel_order(db: Session, order_id: str, user: User, ip_address: str = "") -> Dict[str, Any]:
    _assert_order_access(order_crud.get_order(db, order_id), user)
    order = order_crud.cancel_order(db, order_id, user)
    audit_crud.record(
        db, action="ORDER_CANCELLED", user=user, entity_type="order",
        entity_id=order.order_number, warehouse_location=order.warehouse.code,
        details={"released": True},
        ip_address=ip_address,
    )
    db.commit()
    return order_out(order_crud.get_order(db, order_id))


@serialized
def set_pack_out(
    db: Session, order_id: str, payload, user: User, ip_address: str = ""
) -> Dict[str, Any]:
    _assert_order_access(order_crud.get_order(db, order_id), user)
    order = order_crud.set_pack_out(db, order_id, **payload.model_dump())
    audit_crud.record(
        db, action="ORDER_PACKED_OUT", user=user, entity_type="order",
        entity_id=order.order_number, warehouse_location=order.warehouse.code,
        details=payload.model_dump(),
        ip_address=ip_address,
    )
    db.commit()
    return order_out(order_crud.get_order(db, order_id))


def kanban(db: Session, warehouse_code: Optional[str] = None) -> Dict[str, Any]:
    orders = order_crud.list_orders(db, warehouse_code=warehouse_code)
    columns: Dict[str, List[Dict[str, Any]]] = {status.value: [] for status in KANBAN_COLUMNS}
    columns[OrderStatus.DRAFT.value] = []
    for order in orders:
        if order.status == OrderStatus.CANCELLED:
            continue
        columns.setdefault(order.status.value, []).append(order_out(order))
    for key in columns:
        columns[key].sort(key=lambda o: (o["priority"] != "rush", -o["age_hours"]))
    return {"warehouse_code": warehouse_code or "ALL", "columns": columns}
