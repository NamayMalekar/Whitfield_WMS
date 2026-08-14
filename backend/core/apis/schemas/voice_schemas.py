"""Voice command contracts."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from core.apis.schemas.inventory_schemas import StockMovementResult


class VoiceOverrides(BaseModel):
    """Corrections the receiver made on screen before confirming.

    Speech gets a digit wrong often enough that starting the sentence over is
    the wrong remedy. These fields win over whatever the parser heard.
    """

    sku: Optional[str] = None
    quantity: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    damaged_quantity: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    bin_location: Optional[str] = None
    reference: Optional[str] = None


class VoiceTranscriptIn(BaseModel):
    transcript: str = Field(..., min_length=2, max_length=500)
    warehouse_code: Optional[str] = None
    speech_confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    idempotency_key: Optional[str] = None
    overrides: Optional[VoiceOverrides] = None


class SkuSuggestion(BaseModel):
    sku: str
    name: Optional[str] = None
    score: float


class ParsedVoiceCommand(BaseModel):
    action: str
    sku: Optional[str] = None
    resolved_sku: Optional[str] = None
    product_name: Optional[str] = None
    product_hint: Optional[str] = None
    quantity: Optional[int] = None
    damaged_quantity: int = 0
    bin_location: Optional[str] = None
    warehouse_code: Optional[str] = None
    reference: Optional[str] = None
    confidence: float
    needs_confirmation: bool
    clarification: Optional[str] = None
    missing: List[str] = []
    reasons: List[str] = []
    alternatives: List[SkuSuggestion] = []
    correction_applied: bool = False
    raw_transcript: str
    matched_patterns: List[str] = []


class VoiceStockRow(BaseModel):
    sku: str
    product_name: str
    warehouse_code: str
    on_hand: int
    available: int
    reserved: int
    damaged: int
    bin_location: Optional[str] = None
    below_reorder_point: bool = False


class VoiceParseResponse(BaseModel):
    command: ParsedVoiceCommand
    spoken_confirmation: str
    stock: List[VoiceStockRow] = []
    can_execute: bool = False


class VoiceExecuteResponse(BaseModel):
    command: ParsedVoiceCommand
    result: Optional[StockMovementResult] = None
    spoken_confirmation: str
    executed: bool
    stock: List[VoiceStockRow] = []


class VoiceExamplesResponse(BaseModel):
    examples: List[str]
    tips: List[Dict[str, Any]] = []
