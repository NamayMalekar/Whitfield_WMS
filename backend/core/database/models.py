"""SQLAlchemy ORM models for the Whitfield Fulfillment WMS."""
import enum
import hashlib
import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import relationship

from core.database.session import Base


def uid() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    NEWHIRE = "NEWHIRE"
    VETERAN = "VETERAN"
    MANAGER = "MANAGER"
    ADMIN = "ADMIN"
    SUPERADMIN = "SUPERADMIN"


ROLE_RANK = {
    Role.NEWHIRE: 1,
    Role.VETERAN: 2,
    Role.MANAGER: 3,
    Role.ADMIN: 4,
    Role.SUPERADMIN: 5,
}

# Roles at or above this rank see every warehouse. Below it, a user is
# locked to the single building on their own account (`User.warehouse_id`).
CROSS_WAREHOUSE_MIN_RANK = ROLE_RANK[Role.ADMIN]

# Only these roles may hand out ADMIN/SUPERADMIN access to someone else.
ROLE_GRANT_MIN_RANK = ROLE_RANK[Role.SUPERADMIN]


class TransactionType(str, enum.Enum):
    RECEIVE = "RECEIVE"
    ADJUST = "ADJUST"
    DAMAGE = "DAMAGE"
    RESERVE = "RESERVE"
    RELEASE = "RELEASE"
    PICK = "PICK"
    SHIP = "SHIP"
    TRANSFER_OUT = "TRANSFER_OUT"
    TRANSFER_IN = "TRANSFER_IN"


class OrderStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    RECEIVED = "RECEIVED"
    PULLING = "PULLING"
    PACKING = "PACKING"
    SHIPPED = "SHIPPED"
    CANCELLED = "CANCELLED"


class ScriptStatus(str, enum.Enum):
    RUNNING = "RUNNING"
    PASSED = "PASSED"
    FLAGGED = "FLAGGED"
    FAILED = "FAILED"
    TIMEOUT = "TIMEOUT"


class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(String(32), primary_key=True, default=uid)
    code = Column(String(16), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    city = Column(String(80), nullable=False)
    state = Column(String(40), nullable=False)
    timezone = Column(String(64), default="America/Los_Angeles", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    inventory = relationship("Inventory", back_populates="warehouse")
    users = relationship("User", back_populates="warehouse")


class User(Base):
    __tablename__ = "users"

    id = Column(String(32), primary_key=True, default=uid)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(160), unique=True, nullable=False)
    full_name = Column(String(120), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(Role), default=Role.NEWHIRE, nullable=False)
    warehouse_id = Column(String(32), ForeignKey("warehouses.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    last_login_at = Column(DateTime, nullable=True)

    warehouse = relationship("Warehouse", back_populates="users")


class PasswordResetToken(Base):
    """Single-use, expiring token for the forgot-password flow.

    Only the SHA-256 hash of the token is stored - the raw token is only
    ever seen once, by whoever the reset link was sent to.
    """

    __tablename__ = "password_reset_tokens"
    __table_args__ = (Index("ix_reset_user_created", "user_id", "created_at"),)

    id = Column(String(32), primary_key=True, default=uid)
    user_id = Column(String(32), ForeignKey("users.id"), nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)

    user = relationship("User")


class Product(Base):
    __tablename__ = "products"

    id = Column(String(32), primary_key=True, default=uid)
    sku = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(160), nullable=False)
    description = Column(Text, default="")
    category = Column(String(80), default="general")
    unit_weight_kg = Column(Float, default=0.0, nullable=False)
    length_cm = Column(Float, default=0.0, nullable=False)
    width_cm = Column(Float, default=0.0, nullable=False)
    height_cm = Column(Float, default=0.0, nullable=False)
    reorder_point = Column(Integer, default=0, nullable=False)
    is_hazmat = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    inventory = relationship("Inventory", back_populates="product")


class Inventory(Base):
    """Stock of one product at one warehouse. The row that gets locked."""

    __tablename__ = "inventory"
    __table_args__ = (
        UniqueConstraint("product_id", "warehouse_id", name="uq_inventory_product_wh"),
        CheckConstraint("on_hand >= 0", name="ck_inventory_on_hand_non_negative"),
        CheckConstraint("reserved >= 0", name="ck_inventory_reserved_non_negative"),
        Index("ix_inventory_wh_product", "warehouse_id", "product_id"),
    )

    id = Column(String(32), primary_key=True, default=uid)
    product_id = Column(String(32), ForeignKey("products.id"), nullable=False)
    warehouse_id = Column(String(32), ForeignKey("warehouses.id"), nullable=False)
    on_hand = Column(Integer, default=0, nullable=False)
    reserved = Column(Integer, default=0, nullable=False)
    damaged = Column(Integer, default=0, nullable=False)
    bin_location = Column(String(32), default="UNASSIGNED", nullable=False)
    version = Column(Integer, default=1, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    product = relationship("Product", back_populates="inventory")
    warehouse = relationship("Warehouse", back_populates="inventory")
    transactions = relationship("InventoryTransaction", back_populates="inventory")

    @property
    def available(self) -> int:
        return self.on_hand - self.reserved


class InventoryTransaction(Base):
    """Append-only ledger. `idempotency_key` is what kills duplicate entries."""

    __tablename__ = "inventory_transactions"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_txn_idempotency"),
        Index("ix_txn_inventory_created", "inventory_id", "created_at"),
    )

    id = Column(String(32), primary_key=True, default=uid)
    inventory_id = Column(String(32), ForeignKey("inventory.id"), nullable=False)
    type = Column(Enum(TransactionType), nullable=False)
    quantity = Column(Integer, nullable=False)
    damaged_quantity = Column(Integer, default=0, nullable=False)
    resulting_on_hand = Column(Integer, nullable=False)
    reference = Column(String(120), default="")
    source = Column(String(32), default="manual")
    note = Column(Text, default="")
    idempotency_key = Column(String(80), nullable=False)
    user_id = Column(String(32), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    inventory = relationship("Inventory", back_populates="transactions")


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (Index("ix_orders_wh_status", "warehouse_id", "status"),)

    id = Column(String(32), primary_key=True, default=uid)
    order_number = Column(String(40), unique=True, nullable=False, index=True)
    customer_name = Column(String(160), nullable=False)
    destination = Column(String(200), default="")
    warehouse_id = Column(String(32), ForeignKey("warehouses.id"), nullable=False)
    status = Column(Enum(OrderStatus), default=OrderStatus.DRAFT, nullable=False)
    priority = Column(String(16), default="standard", nullable=False)
    assigned_to_id = Column(String(32), ForeignKey("users.id"), nullable=True)
    package_weight_kg = Column(Float, nullable=True)
    package_length_cm = Column(Float, nullable=True)
    package_width_cm = Column(Float, nullable=True)
    package_height_cm = Column(Float, nullable=True)
    tracking_number = Column(String(80), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    confirmed_at = Column(DateTime, nullable=True)
    shipped_at = Column(DateTime, nullable=True)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    warehouse = relationship("Warehouse")
    assigned_to = relationship("User")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(String(32), primary_key=True, default=uid)
    order_id = Column(String(32), ForeignKey("orders.id"), nullable=False)
    product_id = Column(String(32), ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    picked_quantity = Column(Integer, default=0, nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product")


class AuditLog(Base):
    """Append-only, hash-chained record of every state change."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_time", "timestamp"),
        Index("ix_audit_user_action", "user_id", "action"),
    )

    id = Column(String(32), primary_key=True, default=uid)
    sequence = Column(Integer, nullable=False, unique=True, index=True)
    user_id = Column(String(32), ForeignKey("users.id"), nullable=True)
    username = Column(String(64), default="system", nullable=False)
    role = Column(String(16), default="SYSTEM", nullable=False)
    action = Column(String(80), nullable=False)
    entity_type = Column(String(40), default="", nullable=False)
    entity_id = Column(String(64), default="", nullable=False)
    warehouse_location = Column(String(80), default="", nullable=False)
    details = Column(JSON, default=dict)
    ip_address = Column(String(64), default="")
    timestamp = Column(DateTime, default=utcnow, nullable=False)
    prev_hash = Column(String(64), default="", nullable=False)
    entry_hash = Column(String(64), default="", nullable=False)

    def compute_hash(self) -> str:
        payload = json.dumps(
            {
                "prev": self.prev_hash,
                "user": self.username,
                "action": self.action,
                "entity": f"{self.entity_type}:{self.entity_id}",
                "warehouse": self.warehouse_location,
                "details": self.details or {},
                "ts": (self.timestamp or utcnow()).isoformat(),
            },
            sort_keys=True,
            default=str,
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class ScriptRun(Base):
    __tablename__ = "script_runs"

    id = Column(String(32), primary_key=True, default=uid)
    name = Column(String(120), nullable=False)
    kind = Column(String(24), default="builtin", nullable=False)
    source = Column(Text, default="")
    status = Column(Enum(ScriptStatus), default=ScriptStatus.RUNNING, nullable=False)
    findings = Column(JSON, default=list)
    output = Column(Text, default="")
    duration_ms = Column(Integer, default=0, nullable=False)
    triggered_by_id = Column(String(32), ForeignKey("users.id"), nullable=True)
    triggered_by = Column(String(64), default="system", nullable=False)
    started_at = Column(DateTime, default=utcnow, nullable=False)
    finished_at = Column(DateTime, nullable=True)


class ImmutableRecordError(RuntimeError):
    """Raised when something tries to rewrite history."""


@event.listens_for(AuditLog, "before_update")
def _block_audit_update(_mapper, _connection, _target):  # pragma: no cover - guard
    raise ImmutableRecordError("Audit log entries cannot be modified.")


@event.listens_for(AuditLog, "before_delete")
def _block_audit_delete(_mapper, _connection, _target):  # pragma: no cover - guard
    raise ImmutableRecordError("Audit log entries cannot be deleted.")


@event.listens_for(InventoryTransaction, "before_update")
def _block_txn_update(_mapper, _connection, _target):  # pragma: no cover - guard
    raise ImmutableRecordError("Inventory transactions are append-only.")
