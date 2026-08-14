"""Routine integrity checks and the custom script sandbox.

Built-in checks run every morning before the first pick wave. Custom scripts
let a supervisor codify a local rule ("Reno should never hold more than 40
units of a hazmat SKU") without a deploy.

Sandbox policy: the script source is parsed to an AST and rejected if it
imports, touches dunder attributes, or uses exec/eval/open. It then runs with a
minimal builtins map, read-only data snapshots, and a wall-clock timeout. This
is a guard against mistakes and casual misuse, not a defence against a
determined attacker - script:write is an ADMIN-only permission for that reason.
"""
import ast
import io
import time
from contextlib import redirect_stdout
from dataclasses import dataclass
from datetime import datetime, timedelta
from threading import Thread
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from core.database.models import (
    Inventory,
    InventoryTransaction,
    Order,
    OrderStatus,
    Product,
    TransactionType,
    Warehouse,
)
from core.utils.config import settings

SEVERITY_ORDER = {"info": 0, "warning": 1, "critical": 2}


@dataclass
class Finding:
    check: str
    severity: str
    message: str
    warehouse_code: Optional[str] = None
    entity: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

    def to_dict(self) -> dict:
        return {
            "check": self.check,
            "severity": self.severity,
            "message": self.message,
            "warehouse_code": self.warehouse_code,
            "entity": self.entity,
            "data": self.data or {},
        }


# --------------------------------------------------------------------------- #
# Built-in checks
# --------------------------------------------------------------------------- #
def _rows(db: Session, warehouse_code: Optional[str]) -> List[Inventory]:
    query = db.query(Inventory).options(
        joinedload(Inventory.product), joinedload(Inventory.warehouse)
    )
    if warehouse_code:
        query = query.join(Warehouse).filter(Warehouse.code == warehouse_code.upper())
    return query.all()


def check_negative_balances(db: Session, warehouse_code=None) -> List[Finding]:
    findings = []
    for row in _rows(db, warehouse_code):
        if row.on_hand < 0 or row.reserved < 0 or row.damaged < 0:
            findings.append(
                Finding(
                    check="negative_balances",
                    severity="critical",
                    message=f"{row.product.sku} at {row.warehouse.code} has a negative balance.",
                    warehouse_code=row.warehouse.code,
                    entity=row.product.sku,
                    data={"on_hand": row.on_hand, "reserved": row.reserved, "damaged": row.damaged},
                )
            )
    return findings


def check_reserved_exceeds_on_hand(db: Session, warehouse_code=None) -> List[Finding]:
    findings = []
    for row in _rows(db, warehouse_code):
        if row.reserved > row.on_hand:
            findings.append(
                Finding(
                    check="oversold",
                    severity="critical",
                    message=(
                        f"{row.product.sku} at {row.warehouse.code} is oversold: "
                        f"{row.reserved} reserved against {row.on_hand} on hand."
                    ),
                    warehouse_code=row.warehouse.code,
                    entity=row.product.sku,
                    data={"reserved": row.reserved, "on_hand": row.on_hand},
                )
            )
    return findings


def check_duplicate_receipts(db: Session, warehouse_code=None, window_minutes: int = 10) -> List[Finding]:
    """The spreadsheet failure mode: the same receipt logged twice minutes apart."""
    cutoff = datetime.utcnow() - timedelta(days=2)
    query = (
        db.query(InventoryTransaction)
        .join(Inventory)
        .options(joinedload(InventoryTransaction.inventory).joinedload(Inventory.product))
        .filter(
            InventoryTransaction.type == TransactionType.RECEIVE,
            InventoryTransaction.created_at >= cutoff,
        )
    )
    if warehouse_code:
        query = query.join(Warehouse, Inventory.warehouse_id == Warehouse.id).filter(
            Warehouse.code == warehouse_code.upper()
        )

    transactions = query.order_by(InventoryTransaction.created_at.asc()).all()
    seen: Dict[tuple, InventoryTransaction] = {}
    findings = []
    for txn in transactions:
        key = (txn.inventory_id, txn.quantity, txn.user_id)
        previous = seen.get(key)
        if previous and (txn.created_at - previous.created_at) <= timedelta(minutes=window_minutes):
            row = txn.inventory
            findings.append(
                Finding(
                    check="duplicate_receipts",
                    severity="warning",
                    message=(
                        f"{row.product.sku}: {txn.quantity} units logged twice within "
                        f"{window_minutes} minutes. Confirm it was two real deliveries."
                    ),
                    warehouse_code=row.warehouse.code,
                    entity=row.product.sku,
                    data={
                        "first_transaction": previous.id,
                        "second_transaction": txn.id,
                        "quantity": txn.quantity,
                        "seconds_apart": int((txn.created_at - previous.created_at).total_seconds()),
                    },
                )
            )
        seen[key] = txn
    return findings


def check_low_stock(db: Session, warehouse_code=None) -> List[Finding]:
    findings = []
    for row in _rows(db, warehouse_code):
        reorder_point = row.product.reorder_point or 0
        if reorder_point and row.available <= reorder_point:
            findings.append(
                Finding(
                    check="low_stock",
                    severity="warning" if row.available else "critical",
                    message=(
                        f"{row.product.sku} at {row.warehouse.code}: {row.available} available, "
                        f"reorder point {reorder_point}."
                    ),
                    warehouse_code=row.warehouse.code,
                    entity=row.product.sku,
                    data={"available": row.available, "reorder_point": reorder_point},
                )
            )
    return findings


def check_stalled_orders(db: Session, warehouse_code=None, hours: int = 24) -> List[Finding]:
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    query = (
        db.query(Order)
        .options(joinedload(Order.warehouse))
        .filter(
            Order.status.in_([OrderStatus.RECEIVED, OrderStatus.PULLING, OrderStatus.PACKING]),
            Order.updated_at <= cutoff,
        )
    )
    if warehouse_code:
        query = query.join(Warehouse).filter(Warehouse.code == warehouse_code.upper())
    return [
        Finding(
            check="stalled_orders",
            severity="warning",
            message=(
                f"Order {order.order_number} has sat in {order.status.value} for over {hours}h."
            ),
            warehouse_code=order.warehouse.code,
            entity=order.order_number,
            data={"status": order.status.value, "customer": order.customer_name},
        )
        for order in query.all()
    ]


def check_missing_ship_data(db: Session, warehouse_code=None) -> List[Finding]:
    """Missing weight or dimensions is the usual reason packing stalls."""
    findings = []
    for product in db.query(Product).all():
        if product.unit_weight_kg <= 0 or min(
            product.length_cm, product.width_cm, product.height_cm
        ) <= 0:
            findings.append(
                Finding(
                    check="missing_ship_data",
                    severity="info",
                    message=f"{product.sku} has no weight or dimensions on file.",
                    entity=product.sku,
                    data={
                        "unit_weight_kg": product.unit_weight_kg,
                        "dimensions_cm": [product.length_cm, product.width_cm, product.height_cm],
                    },
                )
            )
    return findings


def check_unassigned_bins(db: Session, warehouse_code=None) -> List[Finding]:
    return [
        Finding(
            check="unassigned_bins",
            severity="info",
            message=f"{row.product.sku} at {row.warehouse.code} has stock in no assigned bin.",
            warehouse_code=row.warehouse.code,
            entity=row.product.sku,
            data={"on_hand": row.on_hand},
        )
        for row in _rows(db, warehouse_code)
        if row.on_hand > 0 and row.bin_location in ("", "UNASSIGNED")
    ]


BUILTIN_CHECKS: Dict[str, Dict[str, Any]] = {
    "negative_balances": {
        "name": "Negative balances",
        "description": "Any inventory row with a negative on-hand, reserved or damaged count.",
        "severity": "critical",
        "fn": check_negative_balances,
    },
    "oversold": {
        "name": "Oversold stock",
        "description": "Reservations exceeding units on hand - the classic double-sell.",
        "severity": "critical",
        "fn": check_reserved_exceeds_on_hand,
    },
    "duplicate_receipts": {
        "name": "Duplicate receipts",
        "description": "Identical receipts from the same user minutes apart.",
        "severity": "warning",
        "fn": check_duplicate_receipts,
    },
    "low_stock": {
        "name": "Below reorder point",
        "description": "SKUs at or under their reorder point.",
        "severity": "warning",
        "fn": check_low_stock,
    },
    "stalled_orders": {
        "name": "Stalled orders",
        "description": "Orders that have not moved a pipeline stage in 24 hours.",
        "severity": "warning",
        "fn": check_stalled_orders,
    },
    "missing_ship_data": {
        "name": "Missing weight or dimensions",
        "description": "SKUs that will stall at pack-out because nothing is on file.",
        "severity": "info",
        "fn": check_missing_ship_data,
    },
    "unassigned_bins": {
        "name": "Unassigned bins",
        "description": "Stock sitting without a bin location.",
        "severity": "info",
        "fn": check_unassigned_bins,
    },
}

MORNING_ROUTINE = ["negative_balances", "oversold", "duplicate_receipts", "low_stock", "stalled_orders"]


def run_builtin_checks(
    db: Session, checks: Optional[List[str]] = None, warehouse_code: Optional[str] = None
) -> List[Finding]:
    selected = checks or MORNING_ROUTINE
    findings: List[Finding] = []
    for key in selected:
        spec = BUILTIN_CHECKS.get(key)
        if not spec:
            findings.append(
                Finding(check=key, severity="info", message=f"Unknown check '{key}' was skipped.")
            )
            continue
        findings.extend(spec["fn"](db, warehouse_code))
    findings.sort(key=lambda f: -SEVERITY_ORDER.get(f.severity, 0))
    return findings


# --------------------------------------------------------------------------- #
# Custom script sandbox
# --------------------------------------------------------------------------- #
FORBIDDEN_NAMES = {
    "eval", "exec", "compile", "open", "input", "globals", "locals", "vars",
    "getattr", "setattr", "delattr", "__import__", "breakpoint", "memoryview",
    "exit", "quit", "help",
}

SAFE_BUILTINS = {
    "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict, "divmod": divmod,
    "enumerate": enumerate, "filter": filter, "float": float, "int": int, "len": len,
    "list": list, "map": map, "max": max, "min": min, "print": print, "range": range,
    "round": round, "set": set, "sorted": sorted, "str": str, "sum": sum, "tuple": tuple,
    "zip": zip, "True": True, "False": False, "None": None,
}


class ScriptRejected(ValueError):
    """The script was refused before it ran."""


def validate_script(source: str) -> None:
    try:
        tree = ast.parse(source, mode="exec")
    except SyntaxError as exc:
        raise ScriptRejected(f"Line {exc.lineno}: {exc.msg}") from exc

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            raise ScriptRejected("Imports are not allowed. Use the provided `wh` helpers.")
        if isinstance(node, (ast.AsyncFunctionDef, ast.Await, ast.AsyncFor, ast.AsyncWith)):
            raise ScriptRejected("Async code is not allowed in checks.")
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise ScriptRejected(f"Attribute '{node.attr}' is not allowed.")
        if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            raise ScriptRejected(f"'{node.id}' is not available inside a check.")
        if isinstance(node, (ast.While, ast.For)) and getattr(node, "orelse", None) is None:
            continue


class ScriptContext:
    """Read-only snapshot handed to custom scripts as `wh`."""

    def __init__(self, db: Session, warehouse_code: Optional[str] = None):
        self._findings: List[Finding] = []
        self.warehouse_code = warehouse_code
        self.today = datetime.utcnow().date().isoformat()
        self.inventory = [
            {
                "sku": row.product.sku,
                "product": row.product.name,
                "category": row.product.category,
                "warehouse": row.warehouse.code,
                "on_hand": row.on_hand,
                "reserved": row.reserved,
                "available": row.available,
                "damaged": row.damaged,
                "bin": row.bin_location,
                "reorder_point": row.product.reorder_point,
                "is_hazmat": row.product.is_hazmat,
            }
            for row in _rows(db, warehouse_code)
        ]
        order_query = db.query(Order).options(joinedload(Order.warehouse))
        if warehouse_code:
            order_query = order_query.join(Warehouse).filter(Warehouse.code == warehouse_code.upper())
        self.orders = [
            {
                "order_number": order.order_number,
                "status": order.status.value,
                "warehouse": order.warehouse.code,
                "customer": order.customer_name,
                "priority": order.priority,
                "age_hours": round(
                    (datetime.utcnow() - order.created_at).total_seconds() / 3600, 1
                ),
                "has_pack_out": order.package_weight_kg is not None,
            }
            for order in order_query.all()
        ]

    def flag(self, message: str, severity: str = "warning", entity: str = None, **data) -> None:
        """Record a finding. This is the only way a script reports a problem."""
        if severity not in SEVERITY_ORDER:
            severity = "warning"
        self._findings.append(
            Finding(
                check="custom",
                severity=severity,
                message=str(message)[:500],
                warehouse_code=self.warehouse_code,
                entity=entity,
                data=data,
            )
        )

    def findings(self) -> List[Finding]:
        return self._findings


def run_custom_script(
    db: Session,
    source: str,
    warehouse_code: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    """Validate, execute and time-box a custom check."""
    validate_script(source)
    timeout = timeout_seconds or settings.SCRIPT_TIMEOUT_SECONDS
    context = ScriptContext(db, warehouse_code)
    buffer = io.StringIO()
    error: Dict[str, Optional[str]] = {"message": None}

    sandbox_globals: Dict[str, Any] = {
        "__builtins__": SAFE_BUILTINS,
        "wh": context,
        "inventory": context.inventory,
        "orders": context.orders,
        "flag": context.flag,
    }

    def target() -> None:
        try:
            with redirect_stdout(buffer):
                exec(compile(source, "<check>", "exec"), sandbox_globals, {})  # noqa: S102
        except Exception as exc:  # noqa: BLE001 - surfaced to the operator verbatim
            error["message"] = f"{type(exc).__name__}: {exc}"

    started = time.perf_counter()
    thread = Thread(target=target, daemon=True)
    thread.start()
    thread.join(timeout)
    duration_ms = int((time.perf_counter() - started) * 1000)

    if thread.is_alive():
        return {
            "timed_out": True,
            "findings": context.findings(),
            "output": buffer.getvalue()[-8000:],
            "error": f"Check exceeded {timeout}s and was abandoned.",
            "duration_ms": duration_ms,
        }

    return {
        "timed_out": False,
        "findings": context.findings(),
        "output": buffer.getvalue()[-8000:],
        "error": error["message"],
        "duration_ms": duration_ms,
    }


SAMPLE_SCRIPT = '''# Morning sanity check - Whitfield Fulfillment
# `inventory` and `orders` are read-only snapshots. Call flag(...) to report.

for row in inventory:
    if row["reserved"] > row["on_hand"]:
        flag(
            f"{row['sku']} at {row['warehouse']} is oversold",
            severity="critical",
            entity=row["sku"],
            reserved=row["reserved"],
            on_hand=row["on_hand"],
        )

    if row["is_hazmat"] and row["on_hand"] > 40:
        flag(
            f"{row['sku']} exceeds the 40-unit hazmat cap at {row['warehouse']}",
            severity="warning",
            entity=row["sku"],
            on_hand=row["on_hand"],
        )

stuck = [o for o in orders if o["status"] == "PACKING" and not o["has_pack_out"]]
for order in stuck:
    flag(f"{order['order_number']} is packing with no weight captured", entity=order["order_number"])

print(f"Checked {len(inventory)} inventory rows and {len(orders)} orders.")
'''
