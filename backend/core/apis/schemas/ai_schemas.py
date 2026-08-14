"""AI assistant contracts."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ChatTurn(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class AssistantAsk(BaseModel):
    question: str = Field(..., min_length=2, max_length=1000)
    warehouse_code: Optional[str] = None
    history: List[ChatTurn] = []


class AssistantAnswer(BaseModel):
    answer: str
    intent: str
    mode: str
    sources: List[str] = []
    data: Dict[str, Any] = {}
    follow_ups: List[str] = []


class SOPDocOut(BaseModel):
    key: str
    title: str
    body: str
