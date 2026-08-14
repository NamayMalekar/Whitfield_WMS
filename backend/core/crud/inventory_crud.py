"""Inventory reads and writes.

Every mutation follows the same shape: lock the inventory row, check the
idempotency key, apply the delta, write an immutable ledger entry. That is what
makes "the laptop froze so I clicked receive twice" a no-op instead of a
phantom 100 units.
"""
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session, joinedload

from core.database.models import (
    Inventory,
    InventoryTransaction,
    Product,
    TransactionType,
    User,
    Warehouse,
)
from core.utils.errors import ConflictError, InsufficientStockError, NotFoundError
from core.utils.locking import critical_section, lock_rows


# --------------------------------------------------------------------------- #
# Lookups
# --------------------------------------------------------------------------- #
def get_warehouse(db: Session, code: str) -> Warehouse:
    warehouse = db.query(Warehouse).filter(Warehouse.code == code.upper().strip()).first()
    if warehouse is None:
        raise NotFoundError(f"Warehouse '{code}' does not exist.")
    return warehouse


def get_product(db: Session, sku: str) -> Product:
    product = db.query(Product).filter(Product.sku == sku.upper().strip()).first()
    if product is None:
        raise NotFoundError(f"SKU '{sku}' is not in the catalog.")
    return product


def list_products(db: Session, search: Optional[str] = None) -> List[Product]:
    query = db.query(Product)
    if search:
        pattern = f"%{search}%"
        query = query.filter(Product.sku.ilike(pattern) | Product.name.ilike(pattern))
    return query.order_by(Product.sku.asc()).all()


def create_product(db: Session, **fields) -> Product:
    sku = fields.pop("sku").upper().strip()
    if db.query(Product).filter(Product.sku == sku).first():
        raise ConflictError(f"SKU '{sku}' already exists.")
    product = Product(sku=sku, **fields)
    db.add(product)
    db.flush()
    return product


def get_or_create_inventory(db: Session, product: Product, warehouse: Warehouse) -> Inventory:
    inventory = (
        db.query(Inventory)
        .filter(Inventory.product_id == product.id, Inventory.warehouse_id == warehouse.id)
        .first()
    )
    if inventory is None:
        inventory = Inventory(product_id=product.id, warehouse_id=warehouse.id)
        db.add(inventory)
        db.flush()
    return inventory


def lock_inventory(db: Session, product: Product, warehouse: Warehouse) -> Inventory:
    """Fetch the inventory row with a write lock held for the transaction."""
    get_or_create_inventory(db, product, warehouse)
    query = db.query(Inventory).filter(
        Inventory.product_id == product.id, Inventory.warehouse_id == warehouse.id
    )
    return lock_rows(query, db).one()


def list_inventory(
    db: Session,
    *,
    warehouse_code: Optional[str] = None,
    search: Optional[str] = None,
    only_low_stock: bool = False,
) -> List[Inventory]:
    query = db.query(Inventory).options(
        joinedload(Inventory.product), joinedload(Inventory.warehouse)
    )
    if warehouse_code:
        warehouse = get_warehouse(db, warehouse_code)
        query = query.filter(Inventory.warehouse_id == warehouse.id)
    if search:
        pattern = f"%{search}%"
        query = query.join(Product).filter(
            Product.sku.ilike(pattern) | Product.name.ilike(pattern)
        )
    rows = query.all()
    if only_low_stock:
        rows = [r for r in rows if r.available <= (r.product.reorder_point or 0)]
    rows.sort(key=lambda r: (r.warehouse.code, r.product.sku))
    return rows


def list_transactions(
    db: Session, *, sku: Optional[str] = None, warehouse_code: Optional[str] = None, limit: int = 100
) -> List[InventoryTransaction]:
    query = db.query(InventoryTransaction).join(Inventory)
    if sku:
        product = get_product(db, sku)
        query = query.filter(Inventory.product_id == product.id)
    if warehouse_code:
        warehouse = get_warehouse(db, warehouse_code)
        query = query.filter(Inventory.warehouse_id == warehouse.id)
    return query.order_by(InventoryTransaction.created_at.desc()).limit(limit).all()


# --------------------------------------------------------------------------- #
# Idempotency
# --------------------------------------------------------------------------- #
def build_idempotency_key(*parts: object) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]


def find_transaction_by_key(db: Session, key: str) -> Optional[InventoryTransaction]:
    return (
        db.query(InventoryTransaction)
        .filter(InventoryTransaction.idempotency_key == key)
        .first()
    )


def find_probable_duplicate(
    db: Session,
    inventory: Inventory,
    quantity: int,
    txn_type: TransactionType,
    window_seconds: int = 90,
) -> Optional[InventoryTransaction]:
    """Same product, same quantity, same type, seconds apart - almost always a
    double submit rather than two real pallets."""
    cutoff = datetime.utcnow() - timedelta(seconds=window_seconds)
    return (
        db.query(InventoryTransaction)
        .filter(
            InventoryTransaction.inventory_id == inventory.id,
            InventoryTransaction.type == txn_type,
            InventoryTransaction.quantity == quantity,
            InventoryTransaction.created_at >= cutoff,
        )
        .order_by(InventoryTransaction.created_at.desc())
        .first()
    )


# --------------------------------------------------------------------------- #
# Mutations
# --------------------------------------------------------------------------- #
def receive_stock(
    db: Session,
    *,
    sku: str,
    warehouse_code: str,
    quantity: int,
    damaged_quantity: int = 0,
    user: Optional[User] = None,
    bin_location: Optional[str] = None,
    reference: str = "",
    note: str = "",
    source: str = "manual",
    idempotency_key: Optional[str] = None,
) -> Tuple[Inventory, InventoryTransaction, bool]:
    """Add stock. Returns (inventory, transaction, duplicate_suppressed)."""
    if quantity <= 0:
        raise ConflictError("Receive quantity must be at least 1.")
    if damaged_quantity > quantity:
        raise ConflictError("Damaged units cannot exceed the units received.")

    product = get_product(db, sku)
    warehouse = get_warehouse(db, warehouse_code)

    key = idempotency_key or build_idempotency_key(
        "receive", product.id, warehouse.id, quantity, damaged_quantity,
        reference, user.id if user else "system", datetime.utcnow().strftime("%Y%m%d%H%M"),
    )

    with critical_section(db):
        existing = find_transaction_by_key(db, key)
        if existing:
            return existing.inventory, existing, True

        inventory = lock_inventory(db, product, warehouse)
        good_units = quantity - damaged_quantity
        inventory.on_hand += good_units
        inventory.damaged += damaged_quantity
        inventory.version += 1
        inventory.updated_at = datetime.utcnow()
        if bin_location:
            inventory.bin_location = bin_location.upper()

        transaction = InventoryTransaction(
            inventory_id=inventory.id,
            type=TransactionType.RECEIVE,
            quantity=good_units,
            damaged_quantity=damaged_quantity,
            resulting_on_hand=inventory.on_hand,
            reference=reference,
            source=source,
            note=note,
            idempotency_key=key,
            user_id=user.id if user else None,
        )
        db.add(transaction)
        db.flush()
    return inventory, transaction, False


def adjust_stock(
    db: Session,
    *,
    sku: str,
    warehouse_code: str,
    new_on_hand: int,
    reason: str,
    user: Optional[User] = None,
    idempotency_key: Optional[str] = None,
) -> Tuple[Inventory, InventoryTransaction, bool]:
    """Set an absolute count, e.g. after a cycle count."""
    product = get_product(db, sku)
    warehouse = get_warehouse(db, warehouse_code)
    key = idempotency_key or build_idempotency_key(
        "adjust", product.id, warehouse.id, new_on_hand, reason,
        user.id if user else "system", datetime.utcnow().strftime("%Y%m%d%H%M"),
    )

    with critical_section(db):
        existing = find_transaction_by_key(db, key)
        if existing:
            return existing.inventory, existing, True

        inventory = lock_inventory(db, product, warehouse)
        if new_on_hand < inventory.reserved:
            raise ConflictError(
                f"{inventory.reserved} units are reserved for open orders. "
                f"Cancel or ship those orders before counting down to {new_on_hand}."
            )
        delta = new_on_hand - inventory.on_hand
        inventory.on_hand = new_on_hand
        inventory.version += 1
        inventory.updated_at = datetime.utcnow()

        transaction = InventoryTransaction(
            inventory_id=inventory.id,
            type=TransactionType.ADJUST,
            quantity=delta,
            resulting_on_hand=inventory.on_hand,
            reference="cycle-count",
            source="manual",
            note=reason,
            idempotency_key=key,
            user_id=user.id if user else None,
        )
        db.add(transaction)
        db.flush()
    return inventory, transaction, False


def reserve_for_order(
    db: Session, *, product: Product, warehouse: Warehouse, quantity: int, order_number: str,
    user: Optional[User] = None,
) -> Inventory:
    """Reserve units under a row lock. Raises when another seller got there first."""
    inventory = lock_inventory(db, product, warehouse)
    if inventory.available < quantity:
        raise InsufficientStockError(
            f"{product.sku} at {warehouse.code}: {inventory.available} available, "
            f"{quantity} requested. Another order may have just taken them.",
            sku=product.sku,
            warehouse=warehouse.code,
            available=inventory.available,
            requested=quantity,
        )
    inventory.reserved += quantity
    inventory.version += 1
    db.add(
        InventoryTransaction(
            inventory_id=inventory.id,
            type=TransactionType.RESERVE,
            quantity=quantity,
            resulting_on_hand=inventory.on_hand,
            reference=order_number,
            source="order",
            idempotency_key=build_idempotency_key("reserve", order_number, product.id, warehouse.id),
            user_id=user.id if user else None,
        )
    )
    db.flush()
    return inventory


def release_reservation(
    db: Session, *, product: Product, warehouse: Warehouse, quantity: int, order_number: str,
    user: Optional[User] = None,
) -> Inventory:
    inventory = lock_inventory(db, product, warehouse)
    inventory.reserved = max(0, inventory.reserved - quantity)
    inventory.version += 1
    db.add(
        InventoryTransaction(
            inventory_id=inventory.id,
            type=TransactionType.RELEASE,
            quantity=quantity,
            resulting_on_hand=inventory.on_hand,
            reference=order_number,
            source="order",
            idempotency_key=build_idempotency_key("release", order_number, product.id, warehouse.id),
            user_id=user.id if user else None,
        )
    )
    db.flush()
    return inventory


def consume_reservation(
    db: Session, *, product: Product, warehouse: Warehouse, quantity: int, order_number: str,
    user: Optional[User] = None,
) -> Inventory:
    """Ship: reserved units leave the building."""
    inventory = lock_inventory(db, product, warehouse)
    inventory.reserved = max(0, inventory.reserved - quantity)
    inventory.on_hand = max(0, inventory.on_hand - quantity)
    inventory.version += 1
    db.add(
        InventoryTransaction(
            inventory_id=inventory.id,
            type=TransactionType.SHIP,
            quantity=-quantity,
            resulting_on_hand=inventory.on_hand,
            reference=order_number,
            source="order",
            idempotency_key=build_idempotency_key("ship", order_number, product.id, warehouse.id),
            user_id=user.id if user else None,
        )
    )
    db.flush()
    return inventory


def transfer_stock(
    db: Session, *, sku: str, from_warehouse_code: str, to_warehouse_code: str,
    quantity: int, reference: str = "", user: Optional[User] = None,
) -> Tuple[Inventory, Inventory]:
    if from_warehouse_code.upper() == to_warehouse_code.upper():
        raise ConflictError("Pick two different warehouses for a transfer.")

    product = get_product(db, sku)
    source_wh = get_warehouse(db, from_warehouse_code)
    target_wh = get_warehouse(db, to_warehouse_code)

    with critical_section(db):
        # Lock in a stable order so two opposite transfers cannot deadlock.
        first, second = sorted([source_wh, target_wh], key=lambda w: w.id)
        lock_inventory(db, product, first)
        lock_inventory(db, product, second)

        source_inv = lock_inventory(db, product, source_wh)
        if source_inv.available < quantity:
            raise InsufficientStockError(
                f"{source_wh.code} has {source_inv.available} available units of {product.sku}."
            )
        target_inv = lock_inventory(db, product, target_wh)

        source_inv.on_hand -= quantity
        target_inv.on_hand += quantity
        source_inv.version += 1
        target_inv.version += 1

        stamp = datetime.utcnow().isoformat(timespec="seconds")
        db.add(
            InventoryTransaction(
                inventory_id=source_inv.id, type=TransactionType.TRANSFER_OUT,
                quantity=-quantity, resulting_on_hand=source_inv.on_hand,
                reference=reference or f"transfer-{stamp}", source="transfer",
                idempotency_key=build_idempotency_key("txout", product.id, source_wh.id, target_wh.id, quantity, stamp),
                user_id=user.id if user else None,
            )
        )
        db.add(
            InventoryTransaction(
                inventory_id=target_inv.id, type=TransactionType.TRANSFER_IN,
                quantity=quantity, resulting_on_hand=target_inv.on_hand,
                reference=reference or f"transfer-{stamp}", source="transfer",
                idempotency_key=build_idempotency_key("txin", product.id, source_wh.id, target_wh.id, quantity, stamp),
                user_id=user.id if user else None,
            )
        )
        db.flush()
    return source_inv, target_inv
