"""Assistant orchestration."""
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from core.crud import audit_crud
from core.database.models import User
from core.modules import ai_assistant


def ask(db: Session, payload, user: User, ip_address: str = "") -> Dict[str, Any]:
    warehouse_code = payload.warehouse_code or (user.warehouse.code if user.warehouse else None)
    response = ai_assistant.answer(
        db,
        payload.question,
        warehouse_code,
        [turn.model_dump() for turn in payload.history],
    )
    audit_crud.record(
        db, action="ASSISTANT_QUERY", user=user, entity_type="assistant", entity_id="",
        warehouse_location=warehouse_code or "",
        details={"question": payload.question[:300], "intent": response["intent"], "mode": response["mode"]},
        ip_address=ip_address,
    )
    db.commit()
    return response


def sop_library() -> List[Dict[str, str]]:
    return [
        {"key": key, "title": doc["title"], "body": doc["body"]}
        for key, doc in ai_assistant.SOP_LIBRARY.items()
    ]
