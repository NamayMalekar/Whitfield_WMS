"""SOP and stock assistant.

Two jobs:
  1. Answer "what do I do when a pallet arrives shrink-wrap torn?" from the SOP
     library (retrieval over a small, versioned corpus - no vector DB needed at
     this size, and the retrieval stays explainable).
  2. Answer "how many 1042s are left in Reno?" by reading live inventory.

If AI_API_KEY is set, retrieved SOP text and live stock rows are passed to the
model as grounding and the model writes the answer. With no key the assistant
still works: it returns the retrieved SOP section and the real numbers. It never
invents a stock figure - every number in an answer comes from the database.
"""
import json
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlalchemy.orm import Session, joinedload

from commons.logger.logger import get_logger
from core.database.models import Inventory, Order, OrderStatus, Product, Warehouse
from core.utils.config import settings

logger = get_logger(__name__)

STOPWORDS = {
    "the", "a", "an", "is", "are", "do", "does", "what", "when", "how", "i", "we",
    "to", "of", "for", "in", "at", "on", "and", "or", "my", "our", "should", "can",
    "if", "it", "that", "this", "with", "you", "be", "have", "has",
}

SOP_LIBRARY: Dict[str, Dict[str, str]] = {
    "receiving": {
        "title": "Receiving a delivery",
        "body": (
            "1. Match the carrier paperwork to the purchase order before anything is unloaded.\n"
            "2. Count units as they come off the truck. Log the count in the app - by voice if "
            "your hands are full - naming the SKU, the quantity, and the damaged count.\n"
            "3. Photograph any damaged carton before it is opened. Damaged units are logged "
            "separately and never counted as sellable stock.\n"
            "4. Put stock away to its bin and confirm the bin in the app. Stock in no bin will "
            "show up on the morning check.\n"
            "5. If the count does not match the paperwork, log what you actually received and "
            "flag the discrepancy. Never adjust the count to match paperwork."
        ),
    },
    "damaged_goods": {
        "title": "Damaged and short shipments",
        "body": (
            "Damaged units go to the quarantine rack, not to the pick face. Record them as "
            "damaged at receiving so they never enter available stock. A supervisor reviews "
            "quarantine daily and files the carrier claim within 48 hours of delivery. "
            "Concealed damage found after put-away is recorded as an adjustment with the reason "
            "'concealed damage' so the ledger keeps the history."
        ),
    },
    "picking": {
        "title": "Picking and the Pulling stage",
        "body": (
            "Orders enter Pulling in priority order: rush first, then oldest confirmed. Scan or "
            "confirm each line as you pull it. If a bin is short, do not substitute a similar "
            "SKU - move the order back to Received and flag the shortage so the count gets "
            "corrected. Stock is already reserved when the order was confirmed, so a shortage "
            "means the physical count is wrong."
        ),
    },
    "packing": {
        "title": "Packing, weighing and measuring",
        "body": (
            "Weigh and measure at the packing bench and enter both in the app before the order "
            "can move to Shipped. The system blocks shipping without them because missing "
            "weights are the main cause of carrier rejections. Use the smallest box the order "
            "fits; hazmat lines ship on their own label and never share a carton."
        ),
    },
    "cycle_counts": {
        "title": "Cycle counts and adjustments",
        "body": (
            "Count A-class SKUs weekly, everything else monthly. Enter the counted number as an "
            "adjustment with a reason - the system records the delta, who counted, and when. "
            "You cannot count below the reserved quantity; cancel or ship the open orders first. "
            "Two people sign off on any adjustment over 50 units."
        ),
    },
    "transfers": {
        "title": "Transfers between Reno and Columbus",
        "body": (
            "Transfers move stock out of the source warehouse immediately and into the "
            "destination on receipt. Reno covers the western states, Columbus the east. Request "
            "a transfer when the destination will run below its reorder point within seven days. "
            "Transfers of hazmat SKUs need a supervisor and a ground-only carrier."
        ),
    },
    "safety": {
        "title": "Floor safety",
        "body": (
            "High-visibility vests in all dock and aisle areas. Nothing stacks above the marked "
            "rack line. Pallet jacks stay clear of the pick face during a wave. Report a spill "
            "or a damaged rack immediately - do not work around it. Hazmat SKUs are stored in "
            "the flammables cabinet and never left on an open pallet overnight."
        ),
    },
    "access": {
        "title": "Roles and access",
        "body": (
            "New hires can receive stock, view inventory and move orders along the pipeline. "
            "Veterans can also create and confirm orders, adjust counts, transfer stock and run "
            "checks. Admins manage users, write automation scripts and verify the audit log. "
            "Every action is logged with the user, the warehouse and the timestamp."
        ),
    },
    "shift_open": {
        "title": "Opening the shift",
        "body": (
            "Run the morning routine checks before the first pick wave. Clear every critical "
            "finding before releasing orders: an oversold SKU released into picking becomes a "
            "customer problem two days later. Review the previous evening's damaged log and the "
            "stalled-order list, then release the wave."
        ),
    },
}

STOCK_PATTERNS = [
    r"how many", r"how much", r"stock", r"count", r"on hand", r"available",
    r"do we have", r"left in", r"inventory", r"units of", r"low stock", r"reorder",
]
ORDER_PATTERNS = [r"order", r"pipeline", r"kanban", r"shipped", r"packing", r"pulling", r"backlog"]


def _tokens(text: str) -> List[str]:
    return [t for t in re.findall(r"[a-z0-9-]+", text.lower()) if t not in STOPWORDS and len(t) > 2]


def retrieve_sops(question: str, top_k: int = 2) -> List[Tuple[str, Dict[str, str], float]]:
    """Score SOP docs by term overlap. Small corpus, explainable ranking."""
    query_tokens = set(_tokens(question))
    scored = []
    for key, doc in SOP_LIBRARY.items():
        doc_tokens = set(_tokens(doc["title"] + " " + doc["body"] + " " + key.replace("_", " ")))
        if not doc_tokens:
            continue
        overlap = query_tokens & doc_tokens
        score = len(overlap) / (len(query_tokens) or 1)
        if key.replace("_", " ") in question.lower():
            score += 0.4
        if score > 0:
            scored.append((key, doc, round(score, 3)))
    scored.sort(key=lambda item: item[2], reverse=True)
    return scored[:top_k]


def detect_intent(question: str) -> str:
    lowered = question.lower()
    if any(re.search(p, lowered) for p in STOCK_PATTERNS):
        return "stock_lookup"
    if any(re.search(p, lowered) for p in ORDER_PATTERNS):
        return "order_lookup"
    return "sop"


def extract_skus(question: str) -> List[str]:
    matches = re.findall(r"\b([a-z]{2,6}-\d{2,8})\b", question.lower())
    bare = re.findall(r"\b(\d{4,8})\b", question)
    return [m.upper() for m in matches] + [f"SKU-{b}" for b in bare]


def extract_warehouse(question: str) -> Optional[str]:
    lowered = question.lower()
    if "reno" in lowered or "nevada" in lowered:
        return "RENO"
    if "columbus" in lowered or "ohio" in lowered:
        return "COLUMBUS"
    return None


def fetch_stock_context(
    db: Session, question: str, warehouse_code: Optional[str]
) -> Dict[str, Any]:
    skus = extract_skus(question)
    warehouse = extract_warehouse(question) or warehouse_code

    query = db.query(Inventory).options(
        joinedload(Inventory.product), joinedload(Inventory.warehouse)
    )
    if warehouse:
        query = query.join(Warehouse).filter(Warehouse.code == warehouse.upper())
    if skus:
        query = query.join(Product).filter(Product.sku.in_(skus))

    rows = query.all()
    if not rows and not skus:
        rows = (
            db.query(Inventory)
            .options(joinedload(Inventory.product), joinedload(Inventory.warehouse))
            .all()
        )
        rows = sorted(rows, key=lambda r: r.available)[:12]

    return {
        "requested_skus": skus,
        "warehouse_filter": warehouse,
        "rows": [
            {
                "sku": row.product.sku,
                "product": row.product.name,
                "warehouse": row.warehouse.code,
                "on_hand": row.on_hand,
                "reserved": row.reserved,
                "available": row.available,
                "damaged": row.damaged,
                "bin": row.bin_location,
                "reorder_point": row.product.reorder_point,
            }
            for row in rows[:40]
        ],
    }


def fetch_order_context(db: Session, warehouse_code: Optional[str]) -> Dict[str, Any]:
    query = db.query(Order).options(joinedload(Order.warehouse))
    if warehouse_code:
        query = query.join(Warehouse).filter(Warehouse.code == warehouse_code.upper())
    orders = query.all()
    counts = {status.value: 0 for status in OrderStatus}
    for order in orders:
        counts[order.status.value] += 1
    open_orders = [
        {
            "order_number": o.order_number,
            "status": o.status.value,
            "customer": o.customer_name,
            "warehouse": o.warehouse.code,
            "priority": o.priority,
        }
        for o in orders
        if o.status in (OrderStatus.RECEIVED, OrderStatus.PULLING, OrderStatus.PACKING)
    ][:20]
    return {"counts": counts, "open_orders": open_orders}


# --------------------------------------------------------------------------- #
# Answer composition
# --------------------------------------------------------------------------- #
def _format_stock_answer(context: Dict[str, Any]) -> str:
    rows = context["rows"]
    if not rows:
        target = ", ".join(context["requested_skus"]) or "that SKU"
        return f"No inventory rows found for {target}. Check the SKU in the catalog."
    lines = []
    for row in rows[:12]:
        flag = "  (at or below reorder point)" if row["available"] <= (row["reorder_point"] or 0) else ""
        lines.append(
            f"- {row['sku']} ({row['product']}) at {row['warehouse']}: "
            f"{row['available']} available, {row['on_hand']} on hand, "
            f"{row['reserved']} reserved, {row['damaged']} damaged, bin {row['bin']}{flag}"
        )
    return "\n".join(lines)


def _format_order_answer(context: Dict[str, Any]) -> str:
    counts = context["counts"]
    line = ", ".join(f"{status}: {count}" for status, count in counts.items() if count)
    body = f"Pipeline right now - {line or 'no orders'}."
    if context["open_orders"]:
        body += "\n\nOpen orders:\n" + "\n".join(
            f"- {o['order_number']} ({o['status']}, {o['priority']}) for {o['customer']} at {o['warehouse']}"
            for o in context["open_orders"][:8]
        )
    return body


def _offline_answer(question: str, intent: str, sops, context: Dict[str, Any]) -> str:
    if intent == "stock_lookup":
        answer = _format_stock_answer(context)
        if sops:
            answer += f"\n\nRelated SOP - {sops[0][1]['title']}:\n{sops[0][1]['body']}"
        return answer
    if intent == "order_lookup":
        return _format_order_answer(context)
    if not sops:
        return (
            "No SOP covers that yet. The library has: "
            + ", ".join(doc["title"] for doc in SOP_LIBRARY.values())
            + ". Ask a supervisor and file the answer as a new SOP."
        )
    return "\n\n".join(f"{doc['title']}\n{doc['body']}" for _, doc, _ in sops)


def _call_llm(question: str, grounding: str, history: List[Dict[str, str]]) -> Optional[str]:
    """Anthropic Messages API. Returns None on any failure so the caller falls back."""
    system_prompt = (
        "You are the floor assistant for Whitfield Fulfillment, a two-warehouse operation "
        "(Reno, Nevada and Columbus, Ohio). Answer warehouse staff briefly and concretely, in "
        "plain language a new hire understands. Use ONLY the grounding below for procedures and "
        "for any number - never estimate or invent a stock figure. If the grounding does not "
        "cover the question, say so and suggest who to ask.\n\n"
        f"GROUNDING:\n{grounding}"
    )
    messages = [{"role": turn["role"], "content": turn["content"]} for turn in history[-6:]]
    messages.append({"role": "user", "content": question})

    try:
        response = httpx.post(
            settings.AI_BASE_URL,
            headers={
                "x-api-key": settings.AI_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.AI_MODEL,
                "max_tokens": 700,
                "system": system_prompt,
                "messages": messages,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        payload = response.json()
        return "".join(
            block.get("text", "") for block in payload.get("content", []) if block.get("type") == "text"
        ).strip() or None
    except Exception as exc:  # noqa: BLE001 - degrade to offline mode, never 500
        logger.warning("assistant_llm_failed", extra={"error": str(exc)})
        return None


FOLLOW_UPS = {
    "stock_lookup": [
        "Which SKUs are below their reorder point?",
        "What is available in Columbus right now?",
    ],
    "order_lookup": ["What is stuck in Packing?", "How many rush orders are open?"],
    "sop": ["What do I do with a damaged pallet?", "When do we run cycle counts?"],
}


def answer(
    db: Session,
    question: str,
    warehouse_code: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    intent = detect_intent(question)
    sops = retrieve_sops(question)

    context: Dict[str, Any] = {}
    if intent == "stock_lookup":
        context = fetch_stock_context(db, question, warehouse_code)
    elif intent == "order_lookup":
        context = fetch_order_context(db, warehouse_code)

    grounding_parts = [f"SOP - {doc['title']}\n{doc['body']}" for _, doc, _ in sops]
    if context:
        grounding_parts.append("LIVE DATA (authoritative)\n" + json.dumps(context, indent=2)[:6000])
    grounding = "\n\n".join(grounding_parts) or "No matching SOP or data."

    mode = "offline"
    text = None
    if settings.AI_API_KEY:
        text = _call_llm(question, grounding, history or [])
        mode = "llm" if text else "offline-fallback"
    if not text:
        text = _offline_answer(question, intent, sops, context)

    return {
        "answer": text,
        "intent": intent,
        "mode": mode,
        "sources": [doc["title"] for _, doc, _ in sops],
        "data": context,
        "follow_ups": FOLLOW_UPS.get(intent, []),
    }
