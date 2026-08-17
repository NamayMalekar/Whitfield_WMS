"""Inventory, products, warehouses and the dashboard rollup."""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from commons.auth.rbac import require_permission, require_staff, scoped_warehouse_code
from core.apis.schemas.inventory_schemas import (
    AdjustStockRequest,
    DashboardResponse,
    InventoryOut,
    ProductCreate,
    ProductOut,
    ReceiveStockRequest,
    StockMovementResult,
    TransactionOut,
    TransferStockRequest,
    WarehouseOut,
)
from core.controllers import inventory_controller
from core.database.models import User
from core.database.session import get_db

router = APIRouter(prefix="/inventory", tags=["inventory"])


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("/warehouses", response_model=List[WarehouseOut])
def warehouses(db: Session = Depends(get_db), current_user: User = Depends(require_staff)):
    """Everyone gets the list of buildings they're allowed to see - one for
    anyone below ADMIN, both for ADMIN/SUPERADMIN."""
    return inventory_controller.list_warehouses(db, current_user)


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(db: Session = Depends(get_db), current_user: User = Depends(require_staff)):
    return inventory_controller.dashboard(db, current_user)


@router.get("", response_model=List[InventoryOut])
def list_inventory(
    warehouse_code: Optional[str] = None,
    search: Optional[str] = None,
    only_low_stock: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory:read")),
):
    scoped_code = scoped_warehouse_code(warehouse_code, current_user)
    return inventory_controller.list_inventory(
        db, warehouse_code=scoped_code, search=search, only_low_stock=only_low_stock
    )


@router.get("/products", response_model=List[ProductOut])
def list_products(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    return inventory_controller.list_products(db, search)


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("product:manage")),
):
    return inventory_controller.create_product(db, payload, current_user, client_ip(request))


@router.post("/receive", response_model=StockMovementResult)
def receive_stock(
    payload: ReceiveStockRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory:receive")),
):
    """Add stock. Send `idempotency_key` to make retries safe."""
    scoped_warehouse_code(payload.warehouse_code, current_user)
    return inventory_controller.receive_stock(db, payload, current_user, client_ip(request))


@router.post("/adjust", response_model=StockMovementResult)
def adjust_stock(
    payload: AdjustStockRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory:adjust")),
):
    scoped_warehouse_code(payload.warehouse_code, current_user)
    return inventory_controller.adjust_stock(db, payload, current_user, client_ip(request))


@router.post("/transfer")
def transfer_stock(
    payload: TransferStockRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory:transfer")),
):
    # A transfer touches two buildings at once, so it stays admin/superadmin
    # only unless both ends are the caller's own warehouse (never true, since
    # from != to) - in practice this means only ADMIN/SUPERADMIN can transfer.
    scoped_warehouse_code(payload.from_warehouse_code, current_user)
    scoped_warehouse_code(payload.to_warehouse_code, current_user)
    return inventory_controller.transfer_stock(db, payload, current_user, client_ip(request))


@router.get("/transactions", response_model=List[TransactionOut])
def transactions(
    sku: Optional[str] = None,
    warehouse_code: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    scoped_code = scoped_warehouse_code(warehouse_code, current_user)
    return inventory_controller.transactions(
        db, sku=sku, warehouse_code=scoped_code, limit=limit
    )
