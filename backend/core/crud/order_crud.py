"""Order persistence, including the concurrency-safe confirmation path."""
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from core.crud import inventory_crud
from core.database.models import (
    Order,
    OrderItem,
    OrderStatus,
    User,
)
from core.utils.errors import ConflictError, NotFoundError
from core.utils.locking import critical_section, lock_rows

# Forward-only pipeline; cancelling is handled separately.
ALLOWED_TRANSITIONS = {
    OrderStatus.DRAFT: {OrderStatus.RECEIVED, OrderStatus.CANCELLED},
    OrderStatus.RECEIVED: {OrderStatus.PULLING, OrderStatus.CANCELLED},
    OrderStatus.PULLING: {OrderStatus.PACKING, OrderStatus.RECEIVED, OrderStatus.CANCELLED},
    OrderStatus.PACKING: {OrderStatus.SHIPPED, OrderStatus.PULLING, OrderStatus.CANCELLED},
    OrderStatus.SHIPPED: set(),
    OrderStatus.CANCELLED: set(),
}


def next_order_number(db: Session) -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    count = db.query(Order).filter(Order.order_number.like(f"WF-{today}-%")).count()
    return f"WF-{today}-{count + 1:04d}"


def get_order(db: Session, order_id: str) -> Order:
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product), joinedload(Order.warehouse))
        .filter(Order.id == order_id)
        .first()
    )
    if order is None:
        raise NotFoundError(f"Order '{order_id}' does not exist.")
    return order


def list_orders(
    db: Session,
    *,
    warehouse_code: Optional[str] = None,
    status: Optional[OrderStatus] = None,
    search: Optional[str] = None,
    limit: int = 200,
) -> List[Order]:
    query = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.product), joinedload(Order.warehouse)
    )
    if warehouse_code:
        warehouse = inventory_crud.get_warehouse(db, warehouse_code)
        query = query.filter(Order.warehouse_id == warehouse.id)
    if status:
        query = query.filter(Order.status == status)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            Order.order_number.ilike(pattern) | Order.customer_name.ilike(pattern)
        )
    return query.order_by(Order.created_at.desc()).limit(limit).all()


def create_order(
    db: Session,
    *,
    customer_name: str,
    destination: str,
    warehouse_code: str,
    priority: str,
    items: List[dict],
    user: Optional[User] = None,
) -> Order:
    warehouse = inventory_crud.get_warehouse(db, warehouse_code)
    order = Order(
        order_number=next_order_number(db),
        customer_name=customer_name.strip(),
        destination=destination,
        warehouse_id=warehouse.id,
        priority=priority,
        status=OrderStatus.DRAFT,
        assigned_to_id=user.id if user else None,
    )
    db.add(order)
    db.flush()

    for line in items:
        product = inventory_crud.get_product(db, line["sku"])
        db.add(OrderItem(order_id=order.id, product_id=product.id, quantity=int(line["quantity"])))
    db.flush()
    return order


def confirm_order(db: Session, order_id: str, user: Optional[User] = None) -> Order:
    """Reserve stock for every line atomically.

    Two sellers confirming the same last unit at the same moment: the first
    transaction holds the inventory row lock, the second waits, re-reads the
    real number and gets a clear 409 instead of overselling.
    """
    with critical_section(db):
        locked = lock_rows(db.query(Order).filter(Order.id == order_id), db).first()
        if locked is None:
            raise NotFoundError(f"Order '{order_id}' does not exist.")
        order = get_order(db, order_id)

        if order.status != OrderStatus.DRAFT:
            raise ConflictError(
                f"Order {order.order_number} is already {order.status.value}; "
                "it cannot be confirmed twice."
            )
        if not order.items:
            raise ConflictError("Add at least one line before confirming this order.")

        # Deterministic lock order across lines prevents deadlocks between orders.
        for item in sorted(order.items, key=lambda i: i.product_id):
            inventory_crud.reserve_for_order(
                db,
                product=item.product,
                warehouse=order.warehouse,
                quantity=item.quantity,
                order_number=order.order_number,
                user=user,
            )

        order.status = OrderStatus.RECEIVED
        order.confirmed_at = datetime.utcnow()
        order.updated_at = datetime.utcnow()
        db.flush()
    return order


def change_status(
    db: Session, order_id: str, new_status: OrderStatus, user: Optional[User] = None
) -> Order:
    with critical_section(db):
        order = get_order(db, order_id)
        if new_status == order.status:
            return order
        if new_status not in ALLOWED_TRANSITIONS[order.status]:
            raise ConflictError(
                f"{order.status.value} -> {new_status.value} is not a valid move. "
                f"Allowed from here: "
                f"{', '.join(s.value for s in ALLOWED_TRANSITIONS[order.status]) or 'nothing'}."
            )

        if new_status == OrderStatus.SHIPPED:
            if order.package_weight_kg is None:
                raise ConflictError(
                    "Capture package weight and dimensions before marking this shipped."
                )
            for item in sorted(order.items, key=lambda i: i.product_id):
                inventory_crud.consume_reservation(
                    db,
                    product=item.product,
                    warehouse=order.warehouse,
                    quantity=item.quantity,
                    order_number=order.order_number,
                    user=user,
                )
                item.picked_quantity = item.quantity
            order.shipped_at = datetime.utcnow()

        if new_status == OrderStatus.PULLING:
            order.assigned_to_id = user.id if user else order.assigned_to_id

        order.status = new_status
        order.updated_at = datetime.utcnow()
        db.flush()
    return order


def cancel_order(db: Session, order_id: str, user: Optional[User] = None) -> Order:
    with critical_section(db):
        order = get_order(db, order_id)
        if order.status == OrderStatus.SHIPPED:
            raise ConflictError("Shipped orders cannot be cancelled - file a return instead.")
        if order.status == OrderStatus.CANCELLED:
            return order

        if order.confirmed_at is not None:
            for item in sorted(order.items, key=lambda i: i.product_id):
                inventory_crud.release_reservation(
                    db,
                    product=item.product,
                    warehouse=order.warehouse,
                    quantity=item.quantity,
                    order_number=order.order_number,
                    user=user,
                )
        order.status = OrderStatus.CANCELLED
        order.updated_at = datetime.utcnow()
        db.flush()
    return order


def set_pack_out(db: Session, order_id: str, **measurements) -> Order:
    order = get_order(db, order_id)
    if order.status not in (OrderStatus.PACKING, OrderStatus.PULLING):
        raise ConflictError("Weigh and measure while the order is in Pulling or Packing.")
    order.package_weight_kg = measurements["package_weight_kg"]
    order.package_length_cm = measurements["package_length_cm"]
    order.package_width_cm = measurements["package_width_cm"]
    order.package_height_cm = measurements["package_height_cm"]
    if measurements.get("tracking_number"):
        order.tracking_number = measurements["tracking_number"]
    order.updated_at = datetime.utcnow()
    db.flush()
    return order
