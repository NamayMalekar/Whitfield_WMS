"""Inventory, product and warehouse contracts."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from core.database.models import TransactionType


class WarehouseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    city: str
    state: str
    is_active: bool


class ProductCreate(BaseModel):
    sku: str = Field(..., min_length=2, max_length=64)
    name: str = Field(..., min_length=2, max_length=160)
    description: str = ""
    category: str = "general"
    unit_weight_kg: float = Field(default=0.0, ge=0)
    length_cm: float = Field(default=0.0, ge=0)
    width_cm: float = Field(default=0.0, ge=0)
    height_cm: float = Field(default=0.0, ge=0)
    reorder_point: int = Field(default=0, ge=0)
    is_hazmat: bool = False


class ProductOut(ProductCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


class InventoryOut(BaseModel):
    id: str
    sku: str
    product_name: str
    warehouse_code: str
    on_hand: int
    reserved: int
    available: int
    damaged: int
    bin_location: str
    reorder_point: int
    below_reorder_point: bool
    updated_at: datetime


class ReceiveStockRequest(BaseModel):
    sku: str
    warehouse_code: str
    quantity: int = Field(..., gt=0, le=1_000_000)
    damaged_quantity: int = Field(default=0, ge=0)
    bin_location: Optional[str] = None
    reference: str = ""
    note: str = ""
    source: str = "manual"
    idempotency_key: Optional[str] = Field(
        default=None,
        description="Send the same key to retry safely after a freeze or timeout.",
    )


class AdjustStockRequest(BaseModel):
    sku: str
    warehouse_code: str
    new_on_hand: int = Field(..., ge=0)
    reason: str = Field(..., min_length=3, max_length=400)
    idempotency_key: Optional[str] = None


class TransferStockRequest(BaseModel):
    sku: str
    from_warehouse_code: str
    to_warehouse_code: str
    quantity: int = Field(..., gt=0)
    reference: str = ""


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: TransactionType
    quantity: int
    damaged_quantity: int
    resulting_on_hand: int
    reference: str
    source: str
    note: str
    created_at: datetime


class StockMovementResult(BaseModel):
    inventory: InventoryOut
    transaction: TransactionOut
    duplicate_suppressed: bool = False
    message: str


class WarehouseSummary(BaseModel):
    warehouse_code: str
    warehouse_name: str
    total_skus: int
    units_on_hand: int
    units_reserved: int
    units_available: int
    units_damaged: int
    below_reorder: int
    open_orders: int
    shipped_today: int


class DashboardResponse(BaseModel):
    generated_at: datetime
    warehouses: List[WarehouseSummary]
    low_stock: List[InventoryOut]
    pipeline: dict
