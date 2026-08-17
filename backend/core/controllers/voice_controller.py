"""Voice command handling: parse against the real catalogue, then execute.

The parser never touches the database. This layer gives it the catalogue to
match against, applies whatever the receiver corrected on screen, answers stock
questions without writing anything, and only calls the inventory controller once
a command is complete and confirmed.
"""
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from core.apis.schemas.inventory_schemas import ReceiveStockRequest
from core.controllers import inventory_controller
from core.crud import audit_crud, inventory_crud
from core.database.models import User
from core.modules import voice_processor
from core.utils.errors import ValidationError
from core.utils.locking import serialized

WRITE_ACTIONS = ("receive", "damage")


def _catalogue(db: Session) -> List[Tuple[str, str]]:
    return [(product.sku, product.name) for product in inventory_crud.list_products(db)]


def _default_warehouse(payload, user: User) -> Optional[str]:
    return payload.warehouse_code or (user.warehouse.code if user.warehouse else None)


def _apply_overrides(command: voice_processor.VoiceCommand, overrides) -> voice_processor.VoiceCommand:
    """On-screen edits win over what was heard."""
    if not overrides:
        return command
    if overrides.sku:
        command.sku = overrides.sku.upper().strip()
        command.resolved_sku = command.sku
        command.alternatives = []
        command.reasons.append("SKU set on screen.")
    if overrides.quantity is not None:
        command.quantity = overrides.quantity
        command.reasons.append("Quantity set on screen.")
    if overrides.damaged_quantity is not None:
        command.damaged_quantity = overrides.damaged_quantity
    if overrides.bin_location is not None:
        command.bin_location = overrides.bin_location.upper().strip() or None
    if overrides.reference is not None:
        command.reference = overrides.reference.strip() or None
    if command.action == "unknown" and command.quantity and command.resolved_sku:
        command.action = "receive"
    return command


def _revalidate(command: voice_processor.VoiceCommand, catalogue) -> voice_processor.VoiceCommand:
    """Recompute what is still missing after overrides were applied."""
    command.missing = voice_processor._missing_fields(command, catalogue)
    command.clarification = voice_processor._clarification(command, catalogue)
    return command


def _stock_rows(db: Session, sku: Optional[str], warehouse_code: Optional[str]) -> List[Dict[str, Any]]:
    if not sku:
        return []
    rows = inventory_crud.list_inventory(db, warehouse_code=warehouse_code, search=sku)
    return [
        {
            "sku": row.product.sku,
            "product_name": row.product.name,
            "warehouse_code": row.warehouse.code,
            "on_hand": row.on_hand,
            "available": row.available,
            "reserved": row.reserved,
            "damaged": row.damaged,
            "bin_location": row.bin_location,
            "below_reorder_point": row.available <= (row.product.reorder_point or 0),
        }
        for row in rows
        if row.product.sku.upper() == sku.upper()
    ]


def _spoken_stock_answer(rows: List[Dict[str, Any]], sku: str) -> str:
    if not rows:
        return f"No stock record for {sku} in that building."
    parts = [
        f"{row['available']} available at {row['warehouse_code'].title()}"
        + (f", {row['damaged']} damaged" if row["damaged"] else "")
        for row in rows
    ]
    head = f"{rows[0]['product_name']}: " if rows[0].get("product_name") else ""
    low = " That is below the reorder point." if any(r["below_reorder_point"] for r in rows) else ""
    return head + ". ".join(parts) + "." + low


def _prepare(db: Session, payload, user: User):
    catalogue = _catalogue(db)
    command = voice_processor.parse(
        payload.transcript,
        _default_warehouse(payload, user),
        payload.speech_confidence,
        catalogue=catalogue,
    )
    command = _apply_overrides(command, getattr(payload, "overrides", None))
    command = _revalidate(command, catalogue)
    return command, catalogue


def parse_only(db: Session, payload, user: User) -> Dict[str, Any]:
    """Parse a transcript without writing anything. The widget calls this first."""
    command, _ = _prepare(db, payload, user)
    stock: List[Dict[str, Any]] = []
    confirmation = voice_processor.spoken_confirmation(command)

    # A stock question is answered on the spot - it changes nothing, so there is
    # nothing to confirm.
    if command.action == "query" and command.resolved_sku:
        stock = _stock_rows(db, command.resolved_sku, command.warehouse_code)
        confirmation = _spoken_stock_answer(stock, command.resolved_sku)
    elif command.resolved_sku:
        # Show the current position for context before a write lands.
        stock = _stock_rows(db, command.resolved_sku, command.warehouse_code)

    return {
        "command": command.to_dict(),
        "spoken_confirmation": confirmation,
        "stock": stock,
        "can_execute": _can_execute(command),
    }


def _can_execute(command: voice_processor.VoiceCommand) -> bool:
    return (
        command.action in WRITE_ACTIONS
        and not command.clarification
        and not command.missing
        and bool(command.resolved_sku)
        and bool(command.quantity)
    )


@serialized
def execute(db: Session, payload, user: User, ip_address: str = "") -> Dict[str, Any]:
    """Apply a confirmed voice command."""
    command, _ = _prepare(db, payload, user)
    confirmation = voice_processor.spoken_confirmation(command)

    if command.action == "query":
        stock = _stock_rows(db, command.resolved_sku, command.warehouse_code) if command.resolved_sku else []
        return {
            "command": command.to_dict(),
            "result": None,
            "spoken_confirmation": _spoken_stock_answer(stock, command.resolved_sku or "that SKU")
            if command.resolved_sku
            else confirmation,
            "executed": False,
            "stock": stock,
        }

    if command.clarification or command.missing:
        return {
            "command": command.to_dict(),
            "result": None,
            "spoken_confirmation": confirmation,
            "executed": False,
            "stock": [],
        }

    if command.action not in WRITE_ACTIONS:
        return {
            "command": command.to_dict(),
            "result": None,
            "spoken_confirmation": (
                f"{confirmation} Voice writes cover receiving and damage only - "
                "use the screen for that one."
            ),
            "executed": False,
            "stock": [],
        }

    if not command.warehouse_code:
        raise ValidationError("Pick a building before logging by voice.")
    if not command.resolved_sku:
        raise ValidationError("That SKU is not in the catalogue, so nothing was logged.")

    quantity = command.quantity or command.damaged_quantity
    damaged = command.damaged_quantity if command.action == "receive" else (command.quantity or 0)

    request = ReceiveStockRequest(
        sku=command.resolved_sku,
        warehouse_code=command.warehouse_code,
        quantity=quantity,
        damaged_quantity=min(damaged, quantity),
        bin_location=command.bin_location,
        reference=command.reference or "",
        note=f"voice: {command.raw_transcript}",
        source="voice",
        idempotency_key=payload.idempotency_key,
    )
    result = inventory_controller.receive_stock(db, request, user, ip_address)

    audit_crud.record(
        db, action="VOICE_COMMAND_EXECUTED", user=user, entity_type="inventory",
        entity_id=command.resolved_sku, warehouse_location=command.warehouse_code,
        details={
            "transcript": command.raw_transcript,
            "parsed": command.to_dict(),
            "duplicate_suppressed": result["duplicate_suppressed"],
        },
        ip_address=ip_address,
    )
    db.commit()

    return {
        "command": command.to_dict(),
        "result": result,
        "spoken_confirmation": result["message"],
        "executed": True,
        "stock": _stock_rows(db, command.resolved_sku, command.warehouse_code),
    }
