"""SOP and stock assistant."""
from typing import List

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from commons.auth.rbac import require_permission
from core.apis.schemas.ai_schemas import AssistantAnswer, AssistantAsk, SOPDocOut
from core.controllers import ai_controller
from core.database.models import User
from core.database.session import get_db

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.post("/ask", response_model=AssistantAnswer)
def ask(
    payload: AssistantAsk,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("assistant:ask")),
):
    ip = request.client.host if request.client else ""
    return ai_controller.ask(db, payload, current_user, ip)


@router.get("/sops", response_model=List[SOPDocOut])
def sops(_: User = Depends(require_permission("assistant:ask"))):
    return ai_controller.sop_library()
