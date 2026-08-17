"""Inventory business logic: mutate, audit, commit, shape."""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from commons.auth.rbac import sees_all_warehouses
from core.controllers.serializers import inventory_out, transaction_out
from core.crud import audit_crud, inventory_crud
from core.database.models import Order, OrderStatus, User, Warehouse
from core.utils.errors import ConflictError
from core.utils.locking import serialized


def list_warehouses(db: Session, user: Optional[User] = None) -> List[Warehouse]:
    query = db.query(Warehouse).order_by(Warehouse.code.asc())
    if user is not None and not sees_all_warehouses(user):
        query = query.filter(Warehouse.id == user.warehouse_id)
    return query.all()


def list_inventory(db: Session, **filters) -> List[Dict[str, Any]]:
    return [inventory_out(row) for row in inventory_crud.list_inventory(db, **filters)]


def list_products(db: Session, search: Optional[str] = None):
    return inventory_crud.list_products(db, search)


@serialized
def create_product(db: Session, payload, user: User, ip_address: str = ""):
    product = inventory_crud.create_product(db, **payload.model_dump())
    audit_crud.record(
        db, action="PRODUCT_CREATED", user=user, entity_type="product", entity_id=product.sku,
        details={"name": product.name}, ip_address=ip_address,
    )
    db.commit()
    db.refresh(product)
    return product


@serialized
def receive_stock(db: Session, payload, user: User, ip_address: str = "") -> Dict[str, Any]:
    inventory, transaction, duplicate = inventory_crud.receive_stock(
        db,
        sku=payload.sku,
        warehouse_code=payload.warehouse_code,
        quantity=payload.quantity,
        damaged_quantity=payload.damaged_quantity,
        user=user,
        bin_location=payload.bin_location,
        reference=payload.reference,
        note=payload.note,
        source=payload.source,
        idempotency_key=payload.idempotency_key,
    )

    if duplicate:
        db.rollback()
        message = (
            f"Already logged. This receipt was recorded once; {payload.quantity} units were not "
            "added a second time."
        )
    else:
        audit_crud.record(
            db, action="STOCK_RECEIVED", user=user, entity_type="inventory",
            entity_id=inventory.product.sku,
            warehouse_location=inventory.warehouse.code,
            details={
                "quantity": payload.quantity,
                "damaged": payload.damaged_quantity,
                "resulting_on_hand": inventory.on_hand,
                "source": payload.source,
                "reference": payload.reference,
            },
            ip_address=ip_address,
        )
        db.commit()
        message = (
            f"Logged {transaction.quantity} units of {inventory.product.sku} at "
            f"{inventory.warehouse.code}."
        )
        if payload.damaged_quantity:
            message += f" {payload.damaged_quantity} moved to quarantine."

    db.refresh(inventory)
    return {
        "inventory": inventory_out(inventory),
        "transaction": transaction_out(transaction),
        "duplicate_suppressed": duplicate,
        "message": message,
    }


@serialized
def adjust_stock(db: Session, payload, user: User, ip_address: str = "") -> Dict[str, Any]:
    before = inventory_crud.list_inventory(db, warehouse_code=payload.warehouse_code, search=payload.sku)
    previous = before[0].on_hand if before else 0

    inventory, transaction, duplicate = inventory_crud.adjust_stock(
        db,
        sku=payload.sku,
        warehouse_code=payload.warehouse_code,
        new_on_hand=payload.new_on_hand,
        reason=payload.reason,
        user=user,
        idempotency_key=payload.idempotency_key,
    )
    if duplicate:
        db.rollback()
        db.refresh(inventory)
        return {
            "inventory": inventory_out(inventory),
            "transaction": transaction_out(transaction),
            "duplicate_suppressed": True,
            "message": "That adjustment was already applied.",
        }

    audit_crud.record(
        db, action="STOCK_ADJUSTED", user=user, entity_type="inventory",
        entity_id=inventory.product.sku, warehouse_location=inventory.warehouse.code,
        details={
            "from": previous,
            "to": payload.new_on_hand,
            "delta": transaction.quantity,
            "reason": payload.reason,
        },
        ip_address=ip_address,
    )
    db.commit()
    db.refresh(inventory)
    return {
        "inventory": inventory_out(inventory),
        "transaction": transaction_out(transaction),
        "duplicate_suppressed": False,
        "message": (
            f"{inventory.product.sku} at {inventory.warehouse.code} set to {payload.new_on_hand} "
            f"({transaction.quantity:+d})."
        ),
    }


@serialized
def transfer_stock(db: Session, payload, user: User, ip_address: str = "") -> Dict[str, Any]:
    source_inv, target_inv = inventory_crud.transfer_stock(
        db,
        sku=payload.sku,
        from_warehouse_code=payload.from_warehouse_code,
        to_warehouse_code=payload.to_warehouse_code,
        quantity=payload.quantity,
        reference=payload.reference,
        user=user,
    )
    audit_crud.record(
        db, action="STOCK_TRANSFERRED", user=user, entity_type="inventory",
        entity_id=source_inv.product.sku,
        warehouse_location=f"{source_inv.warehouse.code}->{target_inv.warehouse.code}",
        details={"quantity": payload.quantity, "reference": payload.reference},
        ip_address=ip_address,
    )
    db.commit()
    db.refresh(source_inv)
    db.refresh(target_inv)
    return {
        "source": inventory_out(source_inv),
        "target": inventory_out(target_inv),
        "message": (
            f"Moved {payload.quantity} units of {source_inv.product.sku} from "
            f"{source_inv.warehouse.code} to {target_inv.warehouse.code}."
        ),
    }


def transactions(db: Session, **filters):
    return [transaction_out(t) for t in inventory_crud.list_transactions(db, **filters)]


def dashboard(db: Session, user: Optional[User] = None) -> Dict[str, Any]:
    """Everything the floor screens need in one round trip - scoped to the
    building(s) the caller is allowed to see."""
    warehouses = list_warehouses(db, user)
    midnight = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    summaries = []
    pipeline: Dict[str, Dict[str, int]] = {}

    for warehouse in warehouses:
        rows = inventory_crud.list_inventory(db, warehouse_code=warehouse.code)
        open_orders = (
            db.query(Order)
            .filter(
                Order.warehouse_id == warehouse.id,
                Order.status.in_([OrderStatus.RECEIVED, OrderStatus.PULLING, OrderStatus.PACKING]),
            )
            .count()
        )
        shipped_today = (
            db.query(Order)
            .filter(
                Order.warehouse_id == warehouse.id,
                Order.status == OrderStatus.SHIPPED,
                Order.shipped_at >= midnight,
            )
            .count()
        )
        summaries.append(
            {
                "warehouse_code": warehouse.code,
                "warehouse_name": warehouse.name,
                "total_skus": len(rows),
                "units_on_hand": sum(r.on_hand for r in rows),
                "units_reserved": sum(r.reserved for r in rows),
                "units_available": sum(r.available for r in rows),
                "units_damaged": sum(r.damaged for r in rows),
                "below_reorder": sum(
                    1 for r in rows if r.available <= (r.product.reorder_point or 0)
                ),
                "open_orders": open_orders,
                "shipped_today": shipped_today,
            }
        )
        pipeline[warehouse.code] = {
            status.value: db.query(Order)
            .filter(Order.warehouse_id == warehouse.id, Order.status == status)
            .count()
            for status in OrderStatus
        }

    low_stock_kwargs = {"only_low_stock": True}
    if user is not None and not sees_all_warehouses(user) and warehouses:
        low_stock_kwargs["warehouse_code"] = warehouses[0].code
    low_stock = [
        inventory_out(row) for row in inventory_crud.list_inventory(db, **low_stock_kwargs)
    ][:20]

    return {
        "generated_at": datetime.utcnow(),
        "warehouses": summaries,
        "low_stock": low_stock,
        "pipeline": pipeline,
    }
