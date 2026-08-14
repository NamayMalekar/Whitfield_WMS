"""Schema creation and first-run seeding."""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from commons.logger.logger import get_logger
from core.crud import audit_crud, inventory_crud, order_crud, user_crud
from core.database.models import (
    Order,
    OrderStatus,
    Product,
    Role,
    User,
    Warehouse,
)
from core.database.session import Base, SessionLocal, engine
from core.utils.config import settings

logger = get_logger(__name__)

WAREHOUSE_DETAILS = {
    "RENO": {"name": "Whitfield Reno", "city": "Reno", "state": "Nevada", "timezone": "America/Los_Angeles"},
    "COLUMBUS": {"name": "Whitfield Columbus", "city": "Columbus", "state": "Ohio", "timezone": "America/New_York"},
}

DEMO_PRODUCTS = [
    {"sku": "SKU-1042", "name": "Nitrile gloves, box of 100", "category": "consumables",
     "unit_weight_kg": 0.6, "length_cm": 24, "width_cm": 12, "height_cm": 10, "reorder_point": 60},
    {"sku": "SKU-3300", "name": "Thermal shipping label roll", "category": "packaging",
     "unit_weight_kg": 1.1, "length_cm": 16, "width_cm": 16, "height_cm": 10, "reorder_point": 40},
    {"sku": "SKU-7788", "name": "Corrugated mailer, medium", "category": "packaging",
     "unit_weight_kg": 0.25, "length_cm": 33, "width_cm": 25, "height_cm": 5, "reorder_point": 200},
    {"sku": "SKU-9001", "name": "Lithium battery pack, 5Ah", "category": "electronics",
     "unit_weight_kg": 0.9, "length_cm": 15, "width_cm": 8, "height_cm": 6, "reorder_point": 25,
     "is_hazmat": True},
    {"sku": "SKU-4521", "name": "Stretch wrap, 20in roll", "category": "packaging",
     "unit_weight_kg": 4.2, "length_cm": 52, "width_cm": 12, "height_cm": 12, "reorder_point": 30},
    {"sku": "SKU-6610", "name": "Pallet corner protector, 50pk", "category": "packaging",
     "unit_weight_kg": 3.0, "length_cm": 60, "width_cm": 20, "height_cm": 20, "reorder_point": 15},
]

DEMO_STOCK = {
    "RENO": {"SKU-1042": 320, "SKU-3300": 85, "SKU-7788": 640, "SKU-9001": 18, "SKU-4521": 44, "SKU-6610": 12},
    "COLUMBUS": {"SKU-1042": 210, "SKU-3300": 30, "SKU-7788": 410, "SKU-9001": 62, "SKU-4521": 26, "SKU-6610": 55},
}

DEMO_ORDERS = [
    {"customer": "Sierra Outfitters", "warehouse": "RENO", "priority": "rush",
     "destination": "Sacramento, CA", "lines": [("SKU-7788", 40), ("SKU-3300", 4)],
     "advance_to": OrderStatus.PULLING},
    {"customer": "Basin Medical Supply", "warehouse": "RENO", "priority": "standard",
     "destination": "Boise, ID", "lines": [("SKU-1042", 25)], "advance_to": OrderStatus.RECEIVED},
    {"customer": "Buckeye Home Goods", "warehouse": "COLUMBUS", "priority": "standard",
     "destination": "Pittsburgh, PA", "lines": [("SKU-7788", 60), ("SKU-4521", 3)],
     "advance_to": OrderStatus.PACKING},
    {"customer": "Lakeside Electronics", "warehouse": "COLUMBUS", "priority": "hazmat",
     "destination": "Cleveland, OH", "lines": [("SKU-9001", 12)], "advance_to": OrderStatus.RECEIVED},
]

DEMO_USERS = [
    # One manager per building, each their own account/id, each locked
    # server-side to their own warehouse's data.
    {"username": "reno.manager", "email": "reno.manager@whitfield.example", "full_name": "Reno Building Manager",
     "role": Role.MANAGER, "warehouse": "RENO"},
    {"username": "columbus.manager", "email": "columbus.manager@whitfield.example", "full_name": "Columbus Building Manager",
     "role": Role.MANAGER, "warehouse": "COLUMBUS"},
    {"username": "dana.veteran", "email": "dana@whitfield.example", "full_name": "Dana Whitlock",
     "role": Role.VETERAN, "warehouse": "RENO"},
    {"username": "kai.newhire", "email": "kai@whitfield.example", "full_name": "Kai Obi",
     "role": Role.NEWHIRE, "warehouse": "COLUMBUS"},
]


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)


def seed_warehouses(db: Session) -> None:
    for name in settings.warehouse_names:
        code = name.upper()
        if db.query(Warehouse).filter(Warehouse.code == code).first():
            continue
        details = WAREHOUSE_DETAILS.get(
            code, {"name": f"Whitfield {name}", "city": name, "state": "", "timezone": "UTC"}
        )
        db.add(Warehouse(code=code, **details))
    db.commit()


def seed_admin(db: Session) -> None:
    # The bootstrap account is the root of trust for the whole system, so it
    # is seeded as SUPERADMIN (not ADMIN) - it, and anyone it later promotes
    # to SUPERADMIN, is the only account that can hand out ADMIN/SUPERADMIN
    # access to someone else.
    if db.query(User).filter(User.role.in_([Role.ADMIN, Role.SUPERADMIN])).first():
        return
    admin = user_crud.create_user(
        db,
        username=settings.BOOTSTRAP_ADMIN_USERNAME,
        email=f"{settings.BOOTSTRAP_ADMIN_USERNAME}@whitfield.example",
        full_name="Warehouse Administrator",
        password=settings.BOOTSTRAP_ADMIN_PASSWORD,
        role=Role.SUPERADMIN,
        warehouse_code=None,
    )
    audit_crud.record(
        db, action="SYSTEM_BOOTSTRAP", entity_type="user", entity_id=admin.id,
        details={"username": admin.username, "role": "SUPERADMIN"},
    )
    db.commit()
    logger.info("bootstrap_admin_created", extra={"username": admin.username})


def seed_demo(db: Session) -> None:
    if not settings.SEED_DEMO_DATA or db.query(Product).first():
        return

    admin = db.query(User).filter(User.role.in_([Role.ADMIN, Role.SUPERADMIN])).first()

    for spec in DEMO_PRODUCTS:
        inventory_crud.create_product(db, **spec)
    db.commit()

    for user_spec in DEMO_USERS:
        if user_crud.get_by_username(db, user_spec["username"]):
            continue
        user_crud.create_user(
            db,
            username=user_spec["username"],
            email=user_spec["email"],
            full_name=user_spec["full_name"],
            password=settings.BOOTSTRAP_ADMIN_PASSWORD,
            role=user_spec["role"],
            warehouse_code=user_spec["warehouse"],
        )
    db.commit()

    bins = ["A12", "B04", "C21", "H01", "D18", "E07"]
    for warehouse_code, stock in DEMO_STOCK.items():
        if not db.query(Warehouse).filter(Warehouse.code == warehouse_code).first():
            continue
        for index, (sku, quantity) in enumerate(stock.items()):
            inventory_crud.receive_stock(
                db,
                sku=sku,
                warehouse_code=warehouse_code,
                quantity=quantity,
                user=admin,
                bin_location=bins[index % len(bins)],
                reference="OPENING-BALANCE",
                note="Migrated from the receiving spreadsheet.",
                source="seed",
                idempotency_key=f"seed-{warehouse_code}-{sku}",
            )
    db.commit()

    for spec in DEMO_ORDERS:
        order = order_crud.create_order(
            db,
            customer_name=spec["customer"],
            destination=spec["destination"],
            warehouse_code=spec["warehouse"],
            priority=spec["priority"],
            items=[{"sku": sku, "quantity": qty} for sku, qty in spec["lines"]],
            user=admin,
        )
        db.commit()
        order_crud.confirm_order(db, order.id, admin)
        db.commit()
        if spec["advance_to"] in (OrderStatus.PULLING, OrderStatus.PACKING):
            order_crud.change_status(db, order.id, OrderStatus.PULLING, admin)
            db.commit()
        if spec["advance_to"] == OrderStatus.PACKING:
            order_crud.change_status(db, order.id, OrderStatus.PACKING, admin)
            db.commit()

    # One order that has been sitting since yesterday, so the stalled-order
    # check has something real to find on first run.
    stale = db.query(Order).filter(Order.status == OrderStatus.RECEIVED).first()
    if stale:
        stale.updated_at = datetime.utcnow() - timedelta(hours=30)
        stale.created_at = datetime.utcnow() - timedelta(hours=32)
        db.commit()

    audit_crud.record(
        db, action="DEMO_DATA_SEEDED", user=admin, entity_type="system", entity_id="seed",
        details={"products": len(DEMO_PRODUCTS), "orders": len(DEMO_ORDERS)},
    )
    db.commit()
    logger.info("demo_data_seeded")


def initialise() -> None:
    create_tables()
    db = SessionLocal()
    try:
        seed_warehouses(db)
        seed_admin(db)
        seed_demo(db)
    finally:
        db.close()
