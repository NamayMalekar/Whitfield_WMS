"""ORM -> response shaping. Kept in one place so every route agrees."""
from datetime import datetime
from typing import Any, Dict

from core.database.models import Inventory, InventoryTransaction, Order


def inventory_out(inventory: Inventory) -> Dict[str, Any]:
    return {
        "id": inventory.id,
        "sku": inventory.product.sku,
        "product_name": inventory.product.name,
        "warehouse_code": inventory.warehouse.code,
        "on_hand": inventory.on_hand,
        "reserved": inventory.reserved,
        "available": inventory.available,
        "damaged": inventory.damaged,
        "bin_location": inventory.bin_location,
        "reorder_point": inventory.product.reorder_point,
        "below_reorder_point": inventory.available <= (inventory.product.reorder_point or 0),
        "updated_at": inventory.updated_at,
    }


def transaction_out(transaction: InventoryTransaction) -> Dict[str, Any]:
    return {
        "id": transaction.id,
        "type": transaction.type,
        "quantity": transaction.quantity,
        "damaged_quantity": transaction.damaged_quantity,
        "resulting_on_hand": transaction.resulting_on_hand,
        "reference": transaction.reference,
        "source": transaction.source,
        "note": transaction.note,
        "created_at": transaction.created_at,
    }


def order_out(order: Order) -> Dict[str, Any]:
    return {
        "id": order.id,
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "destination": order.destination,
        "warehouse_code": order.warehouse.code,
        "status": order.status,
        "priority": order.priority,
        "assigned_to": order.assigned_to.full_name if order.assigned_to else None,
        "items": [
            {
                "id": item.id,
                "sku": item.product.sku,
                "product_name": item.product.name,
                "quantity": item.quantity,
                "picked_quantity": item.picked_quantity,
            }
            for item in order.items
        ],
        "package_weight_kg": order.package_weight_kg,
        "package_length_cm": order.package_length_cm,
        "package_width_cm": order.package_width_cm,
        "package_height_cm": order.package_height_cm,
        "tracking_number": order.tracking_number,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "confirmed_at": order.confirmed_at,
        "shipped_at": order.shipped_at,
        "age_hours": round((datetime.utcnow() - order.created_at).total_seconds() / 3600, 1),
    }
