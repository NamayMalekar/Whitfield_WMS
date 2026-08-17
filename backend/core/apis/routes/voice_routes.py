"""Voice receiving endpoints."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from commons.auth.rbac import require_permission
from core.apis.schemas.voice_schemas import (
    VoiceExamplesResponse,
    VoiceExecuteResponse,
    VoiceParseResponse,
    VoiceTranscriptIn,
)
from core.controllers import voice_controller
from core.database.models import User
from core.database.session import get_db

router = APIRouter(prefix="/voice", tags=["voice"])

EXAMPLES = [
    "Log 50 units of SKU-1042, 2 damaged",
    "Receive 30 units of SKU-7788 into bin A12 at Reno",
    "Log three cases of twelve for SKU-3300",
    "Book in a dozen of SKU-1042, none damaged",
    "Log forty units of SKU-1042 — no, make that fifty",
    "How many units of SKU-1042 do we have in Columbus",
]

TIPS = [
    {
        "title": "Say the count first",
        "body": "The quantity comes before the SKU, so \"fifty units of SKU-1042\" never logs 1042 units.",
    },
    {
        "title": "Correct yourself out loud",
        "body": "\"No, make that forty\" replaces the number you just said. The SKU carries over.",
    },
    {
        "title": "Packaging counts",
        "body": "\"Three cases of twelve\" is read as 36. So is \"a dozen\" and \"half a dozen\".",
    },
    {
        "title": "Nothing writes until you confirm",
        "body": "Every command is read back first, and you can fix any field on screen before logging.",
    },
]


@router.get("/examples", response_model=VoiceExamplesResponse)
def examples(_: User = Depends(require_permission("voice:use"))):
    """Phrases the parser is tuned for, shown in the widget as prompts."""
    return {"examples": EXAMPLES, "tips": TIPS}


@router.post("/parse", response_model=VoiceParseResponse)
def parse(
    payload: VoiceTranscriptIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("voice:use")),
):
    """Parse a transcript without writing anything. The widget calls this first."""
    return voice_controller.parse_only(db, payload, current_user)


@router.post("/execute", response_model=VoiceExecuteResponse)
def execute(
    payload: VoiceTranscriptIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("voice:use")),
):
    """Apply a confirmed voice command."""
    ip = request.client.host if request.client else ""
    return voice_controller.execute(db, payload, current_user, ip)
