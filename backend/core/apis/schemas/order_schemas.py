"""Order contracts."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from core.database.models import OrderStatus


class OrderItemIn(BaseModel):
    sku: str
    quantity: int = Field(..., gt=0)


class OrderItemOut(BaseModel):
    id: str
    sku: str
    product_name: str
    quantity: int
    picked_quantity: int


class OrderCreate(BaseModel):
    customer_name: str = Field(..., min_length=2, max_length=160)
    destination: str = ""
    warehouse_code: str
    priority: str = Field(default="standard", pattern="^(standard|rush|hazmat)$")
    items: List[OrderItemIn] = Field(..., min_length=1)


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_number: str
    customer_name: str
    destination: str
    warehouse_code: str
    status: OrderStatus
    priority: str
    assigned_to: Optional[str] = None
    items: List[OrderItemOut]
    package_weight_kg: Optional[float] = None
    package_length_cm: Optional[float] = None
    package_width_cm: Optional[float] = None
    package_height_cm: Optional[float] = None
    tracking_number: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    confirmed_at: Optional[datetime] = None
    shipped_at: Optional[datetime] = None
    age_hours: float = 0.0


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    note: str = ""


class PackOutUpdate(BaseModel):
    package_weight_kg: float = Field(..., gt=0)
    package_length_cm: float = Field(..., gt=0)
    package_width_cm: float = Field(..., gt=0)
    package_height_cm: float = Field(..., gt=0)
    tracking_number: Optional[str] = None


class KanbanBoard(BaseModel):
    warehouse_code: str
    columns: dict
