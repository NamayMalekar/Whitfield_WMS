"""Turn spoken warehouse language into structured inventory actions.

Design notes
------------
Receivers wear gloves and hold a box. The grammar therefore accepts the way
people actually talk on a dock - "log fifty units of SKU one zero four two, two
damaged" - including spelled-out digits, "sku" said as a word, packaging
multipliers ("three cases of twelve"), and mid-sentence corrections ("no, make
that forty").

Two rules shape everything here:

1. Never guess a number. Anything the parser is unsure about comes back with a
   clarification and `needs_confirmation` set, so the UI asks before it writes.
   A wrong count is worse than a re-ask.
2. Say what was heard, not what was assumed. `reasons` explains why the
   confidence landed where it did, and `missing` names the fields the caller
   should prompt for - one at a time, rather than making the receiver start the
   whole sentence again.

SKU resolution against the real catalogue lives in `resolve_sku`, which takes a
plain list of (sku, name) pairs so this module stays free of the database.
"""
import difflib
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

UNITS: Dict[str, int] = {
    "zero": 0, "oh": 0, "o": 0, "one": 1, "won": 1, "two": 2, "to": 2, "too": 2,
    "three": 3, "tree": 3, "four": 4, "for": 4, "fore": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "ate": 8, "nine": 9, "niner": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
}
TENS: Dict[str, int] = {
    "twenty": 20, "thirty": 30, "forty": 40, "fourty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}
SCALES: Dict[str, int] = {"hundred": 100, "thousand": 1000}

# Spoken shorthands a receiver actually uses for a count.
QUANTITY_PHRASES: Dict[str, int] = {
    "a dozen": 12, "one dozen": 12, "dozen": 12, "two dozen": 24,
    "half a dozen": 6, "half dozen": 6,
    "a couple": 2, "couple": 2, "a pair": 2, "a few": 3,
}

# "three cases of twelve" -> 36. Only used when both numbers are present.
PACK_WORDS = r"(?:cases?|boxes?|cartons?|pallets?|packs?|bundles?|skids?|totes?)"

ACTION_KEYWORDS = {
    "query": [
        "how many", "how much", "what's the count", "whats the count", "what is the count",
        "stock check", "check stock", "do we have", "have we got", "count on", "count for",
    ],
    "transfer": ["transfer", "move to", "ship to warehouse", "send to warehouse"],
    "adjust": ["set", "adjust", "correct to", "recount", "cycle count", "count is now"],
    "receive": [
        "log", "logged", "receive", "received", "receiving", "add", "book in", "booked in",
        "check in", "checked in", "intake", "put away", "putaway", "take in", "unload",
    ],
    "damage": ["damage", "damaged", "broken", "crushed", "write off", "wrote off", "scrap"],
}

WAREHOUSE_ALIASES = {
    "reno": "RENO", "nevada": "RENO", "renault": "RENO", "renner": "RENO", "rino": "RENO",
    "columbus": "COLUMBUS", "ohio": "COLUMBUS", "colombus": "COLUMBUS",
    "columbia": "COLUMBUS", "colombo": "COLUMBUS",
}

FILLER = re.compile(
    r"\b(um+|uh+|erm|hmm+|okay|ok|alright|right|please|hey|system|assistant|like|you know)\b",
    re.I,
)

# "no, make that forty" - everything before the marker is a false start.
CORRECTION = re.compile(
    r"\b(?:no,?\s+)?(?:make (?:that|it)|correction|scratch that|sorry,?\s+(?:make it|i meant)|"
    r"i meant|actually)\b",
    re.I,
)

DIGIT_WORD = r"(?:\d+|zero|oh|one|two|three|four|five|six|seven|eight|nine)"
# Homophones earn their place when a receiver dictates digits ("one oh four
# two"), but they wreck quantity matching: "for sku" would read as a 4. They are
# kept out of the number alternation and only used for digit-by-digit runs.
HOMOPHONES = {"to", "too", "for", "fore", "won", "o", "tree", "ate", "oh", "niner"}
_NUMBER_TOKENS = sorted(
    (set(UNITS) | set(TENS) | set(SCALES)) - HOMOPHONES, key=len, reverse=True
)
NUMBER_WORD = r"(?:\d+|" + "|".join(_NUMBER_TOKENS) + r")"

# Digits and spelled-out digits are matched separately and never mixed. Mixing
# them let "sku 1042 two damaged" read as SKU-10422, which then failed to
# resolve and swallowed the damaged count with it.
_SKU_HEAD = r"\bsku\s*(?:number|code|#)?\s*"
SPOKEN_SKU_DIGITS = re.compile(_SKU_HEAD + r"(\d{2,8})\b")
SPOKEN_SKU_WORDS = re.compile(
    _SKU_HEAD + r"((?:zero|oh|one|two|three|four|five|six|seven|eight|nine)"
    r"(?:[\s-]+(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)){1,9})\b"
)
CODED_SKU = re.compile(r"\b([a-z]{2,6}-\d{2,8}|[a-z]{2,5}\d{3,8})\b")
REFERENCE = re.compile(
    r"\b(?:p\.?o\.?|purchase order|reference|ref|asn|delivery note)\s*#?\s*([a-z0-9-]{3,20})\b"
)
BIN = re.compile(
    rf"\b(?:bin|slot|rack|aisle|location)\s*"
    rf"([a-z][\s-]?{NUMBER_WORD}|[a-z]?\d{{1,4}}|[a-z])\b"
)
QUANTITY_WITH_UNIT = re.compile(
    rf"\b((?:{NUMBER_WORD}|and)(?:[\s-]+(?:{NUMBER_WORD}|and))*)\s*"
    rf"(units?|pieces?|pcs|each|eaches|{PACK_WORDS})\b"
)
PACK_MULTIPLIER = re.compile(
    rf"\b((?:{NUMBER_WORD}(?:[\s-]+{NUMBER_WORD})*))\s*({PACK_WORDS})\s*(?:of|at|with)\s*"
    rf"((?:{NUMBER_WORD}(?:[\s-]+{NUMBER_WORD})*))\b"
)


@dataclass
class VoiceCommand:
    action: str = "unknown"
    sku: Optional[str] = None
    resolved_sku: Optional[str] = None
    product_name: Optional[str] = None
    product_hint: Optional[str] = None
    quantity: Optional[int] = None
    damaged_quantity: int = 0
    bin_location: Optional[str] = None
    warehouse_code: Optional[str] = None
    reference: Optional[str] = None
    confidence: float = 0.0
    needs_confirmation: bool = True
    clarification: Optional[str] = None
    missing: List[str] = field(default_factory=list)
    reasons: List[str] = field(default_factory=list)
    alternatives: List[Dict[str, object]] = field(default_factory=list)
    correction_applied: bool = False
    raw_transcript: str = ""
    matched_patterns: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "action": self.action,
            "sku": self.sku,
            "resolved_sku": self.resolved_sku,
            "product_name": self.product_name,
            "product_hint": self.product_hint,
            "quantity": self.quantity,
            "damaged_quantity": self.damaged_quantity,
            "bin_location": self.bin_location,
            "warehouse_code": self.warehouse_code,
            "reference": self.reference,
            "confidence": round(self.confidence, 2),
            "needs_confirmation": self.needs_confirmation,
            "clarification": self.clarification,
            "missing": self.missing,
            "reasons": self.reasons,
            "alternatives": self.alternatives,
            "correction_applied": self.correction_applied,
            "raw_transcript": self.raw_transcript,
            "matched_patterns": self.matched_patterns,
        }


# --------------------------------------------------------------------------- #
# number handling
# --------------------------------------------------------------------------- #
def words_to_number(phrase: str) -> Optional[int]:
    """'two hundred and fifty' -> 250. Also handles digit-by-digit dictation."""
    tokens = [t for t in re.split(r"[\s-]+", phrase.lower().strip()) if t and t != "and"]
    if not tokens:
        return None

    # Digit-by-digit: "one zero four two" -> 1042
    if len(tokens) > 1 and all(t in UNITS and UNITS[t] <= 9 for t in tokens):
        return int("".join(str(UNITS[t]) for t in tokens))

    total, current, matched = 0, 0, False
    for token in tokens:
        if token.isdigit():
            current += int(token)
            matched = True
        elif token in UNITS:
            current += UNITS[token]
            matched = True
        elif token in TENS:
            current += TENS[token]
            matched = True
        elif token in SCALES:
            scale = SCALES[token]
            current = (current or 1) * scale
            if scale >= 1000:
                total += current
                current = 0
            matched = True
        else:
            return None
    return (total + current) if matched else None


def _normalise(transcript: str) -> str:
    text = transcript.lower().strip()
    text = FILLER.sub(" ", text)
    text = re.sub(r"\bs\.?\s?k\.?\s?u\.?\b", "sku", text)
    text = re.sub(r"\bdash\b|\bhyphen\b", "-", text)
    text = re.sub(r"\bnumber\s+(?=\d)", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" .,")


def _apply_correction(text: str) -> Tuple[str, bool]:
    """Keep only what follows the last correction marker, when one is spoken.

    "log fifty units of sku 1042, no make that forty" is one utterance with two
    counts in it. The receiver's last word wins - but only for the part of the
    sentence they actually restated, so the SKU said before the correction is
    carried forward by the caller.
    """
    matches = list(CORRECTION.finditer(text))
    if not matches:
        return text, False
    tail = text[matches[-1].end():].strip(" ,.")
    if not tail:
        return text, False
    return tail, True


def _extract_quantity(text: str) -> Tuple[Optional[int], Optional[str]]:
    """Return (quantity, how_it_was_read)."""
    pack = PACK_MULTIPLIER.search(text)
    if pack:
        outer = words_to_number(pack.group(1))
        inner = words_to_number(pack.group(3))
        if outer and inner:
            return outer * inner, f"{outer} {pack.group(2)} of {inner}"

    for phrase, value in QUANTITY_PHRASES.items():
        if re.search(rf"\b{re.escape(phrase)}\b", text):
            return value, phrase

    with_unit = QUANTITY_WITH_UNIT.search(text)
    if with_unit:
        value = words_to_number(with_unit.group(1))
        if value is not None:
            return value, f"{value} {with_unit.group(2)}"

    digits = re.search(r"\b(\d{1,7})\b", text)
    if digits:
        return int(digits.group(1)), "a spoken digit"

    words = re.search(rf"\b((?:{NUMBER_WORD}[\s-]*){{1,6}})\b", text)
    if words:
        value = words_to_number(words.group(1))
        if value is not None:
            return value, "a spoken number"
    return None, None


def _extract_damaged(text: str, quantity: Optional[int]) -> Tuple[int, Optional[str]]:
    if re.search(r"\b(?:none|no|zero|nothing)\s+(?:of them\s+)?(?:are\s+|is\s+|were\s+)?damaged\b", text):
        return 0, "none damaged"
    if re.search(r"\b(?:all|whole lot|entire pallet|everything)\s+(?:of them\s+)?(?:are\s+|is\s+|were\s+)?"
                 r"(?:damaged|broken|crushed|write[\s-]?offs?)\b", text):
        return (quantity or 0), "all damaged"

    # The count has to be a number expression, not "any run of letters". An
    # open character class used to swallow "of twelve for two damaged" whole and
    # then fail to read it, silently logging nothing as damaged.
    patterns = [
        rf"\b(?:with\s+|and\s+|,\s*)?({NUMBER_WORD}(?:[\s-]+{NUMBER_WORD})*)\s*"
        rf"(?:units?|pieces?|pcs|boxes?|cartons?)?\s*(?:of them\s+)?"
        rf"(?:are\s+|is\s+|were\s+|was\s+)?(?:damaged|broken|crushed|dented|write[\s-]?off)\b",
        rf"(?:damaged|broken|crushed)\s*[:\-]?\s*({NUMBER_WORD}(?:[\s-]+{NUMBER_WORD})*)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            value = words_to_number(match.group(1))
            if value is not None:
                return value, f"{value} damaged"
    if re.search(r"\b(?:one|a|1)\s+(?:is\s+|was\s+)?(?:damaged|broken|cracked)\b", text):
        return 1, "1 damaged"
    return 0, None


def _cut(text: str, match: Optional[re.Match]) -> str:
    """Remove a matched span so later extractors cannot re-read the same digits."""
    if not match:
        return text
    return (text[: match.start()] + " " + text[match.end():]).strip()


def _digits_from_words(phrase: str) -> str:
    out = []
    for token in re.split(r"[\s-]+", phrase.strip()):
        if token.isdigit():
            out.append(token)
        elif token in UNITS and UNITS[token] <= 9:
            out.append(str(UNITS[token]))
    return "".join(out)


def _extract_sku(text: str):
    for pattern in (SPOKEN_SKU_DIGITS, SPOKEN_SKU_WORDS):
        match = pattern.search(text)
        if match:
            digits = _digits_from_words(match.group(1))
            if digits:
                return f"SKU-{digits}", _cut(text, match)
    match = CODED_SKU.search(text)
    if match:
        raw = match.group(1)
        letters = re.sub(r"[^a-z]", "", raw).upper()
        digits = re.sub(r"[^0-9]", "", raw)
        return f"{letters}-{digits}", _cut(text, match)
    return None, text


def _extract_reference(text: str):
    match = REFERENCE.search(text)
    if match:
        return match.group(1).upper(), _cut(text, match)
    return None, text


def _extract_bin(text: str):
    match = BIN.search(text)
    if not match:
        return None, text
    raw = match.group(1).strip()
    if re.search(r"\d", raw):
        # "a12", "a 12" and "a-12" are the same slot on the rack label.
        normalised = re.sub(r"[\s-]+", "", raw).upper()
    else:
        parts = re.split(r"[\s-]+", raw)
        letters = "".join(p for p in parts if p.isalpha() and len(p) == 1).upper()
        spoken = " ".join(p for p in parts if not (p.isalpha() and len(p) == 1))
        value = words_to_number(spoken) if spoken else None
        normalised = f"{letters}{value if value is not None else ''}" or raw.upper()
    return normalised, _cut(text, match)


def _extract_warehouse(text: str) -> Optional[str]:
    for alias, code in WAREHOUSE_ALIASES.items():
        if re.search(rf"\b{alias}\b", text):
            return code
    return None


def _detect_action(text: str) -> Optional[str]:
    # "log 50 units, 2 damaged" is a receive that mentions damage, so receive
    # wins whenever both appear.
    for action in ("query", "transfer", "adjust", "receive", "damage"):
        for keyword in ACTION_KEYWORDS[action]:
            if re.search(rf"\b{re.escape(keyword)}\b", text):
                return action
    return None


# --------------------------------------------------------------------------- #
# catalogue matching
# --------------------------------------------------------------------------- #
def resolve_sku(
    spoken_sku: Optional[str],
    product_hint: Optional[str],
    catalogue: Sequence[Tuple[str, str]],
    limit: int = 3,
) -> Tuple[Optional[str], Optional[str], List[Dict[str, object]]]:
    """Match what was heard against the real catalogue.

    Speech engines mangle digits far more often than words, so an exact hit is
    tried first, then the digit tail ("1042" matching "SKU-1042" however the
    prefix came out), then a fuzzy pass over both codes and product names. The
    runners-up come back as alternatives so the widget can offer them as taps
    rather than making the receiver say it again.

    Returns (resolved_sku, product_name, alternatives).
    """
    if not catalogue:
        return None, None, []

    lookup = {sku.upper(): name for sku, name in catalogue}

    if spoken_sku and spoken_sku.upper() in lookup:
        return spoken_sku.upper(), lookup[spoken_sku.upper()], []

    scored: Dict[str, float] = {}

    if spoken_sku:
        heard_digits = re.sub(r"[^0-9]", "", spoken_sku)
        for sku in lookup:
            digits = re.sub(r"[^0-9]", "", sku)
            if heard_digits and digits == heard_digits:
                scored[sku] = max(scored.get(sku, 0), 0.95)
            elif heard_digits and digits.endswith(heard_digits) and len(heard_digits) >= 3:
                scored[sku] = max(scored.get(sku, 0), 0.8)
            else:
                ratio = difflib.SequenceMatcher(None, spoken_sku.upper(), sku).ratio()
                if ratio >= 0.7:
                    scored[sku] = max(scored.get(sku, 0), ratio * 0.9)

    if product_hint:
        hint = product_hint.lower().strip()
        for sku, name in lookup.items():
            lowered = (name or "").lower()
            if hint and (hint in lowered or lowered in hint):
                scored[sku] = max(scored.get(sku, 0), 0.85)
            else:
                ratio = difflib.SequenceMatcher(None, hint, lowered).ratio()
                if ratio >= 0.62:
                    scored[sku] = max(scored.get(sku, 0), ratio * 0.85)

    if not scored:
        return None, None, []

    ranked = sorted(scored.items(), key=lambda item: item[1], reverse=True)[:limit]
    alternatives = [
        {"sku": sku, "name": lookup[sku], "score": round(score, 2)} for sku, score in ranked
    ]

    best_sku, best_score = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else 0.0
    # Only auto-pick when one candidate is clearly ahead; otherwise let the
    # receiver choose from the alternatives.
    if best_score >= 0.8 and best_score - runner_up >= 0.1:
        # A confident match needs no second guesses: offering them invites a
        # mis-tap on a card the receiver would otherwise just confirm.
        return best_sku, lookup[best_sku], []
    return None, None, alternatives


# --------------------------------------------------------------------------- #
# parsing
# --------------------------------------------------------------------------- #
def parse(
    transcript: str,
    default_warehouse: Optional[str] = None,
    speech_confidence: float = 1.0,
    catalogue: Optional[Sequence[Tuple[str, str]]] = None,
) -> VoiceCommand:
    """Parse a raw speech transcript into a structured command.

    Extraction order matters: references and bins are pulled out first so their
    digits cannot be mistaken for a SKU, and the SKU is pulled out before the
    quantity so "fifty units of SKU-1042" does not log 1042 units.
    """
    command = VoiceCommand(raw_transcript=transcript)
    text = _normalise(transcript)
    if not text:
        command.clarification = "Nothing came through. Hold the button and say it again."
        command.missing = ["transcript"]
        return command

    matched: List[str] = []
    reasons: List[str] = []
    score = 0.0

    # A correction restates the numbers, but the SKU is often only said once, so
    # parse the full sentence for identity and the corrected tail for counts.
    corrected_text, was_corrected = _apply_correction(text)
    command.correction_applied = was_corrected
    if was_corrected:
        matched.append("correction")
        reasons.append("Heard a correction; used what you said last.")

    action = _detect_action(text)
    if action:
        matched.append(f"action:{action}")
        command.action = action
        score += 0.32
    elif re.search(rf"\b(?:units?|cases?|pallets?|{PACK_WORDS})\b", text):
        command.action = "receive"
        matched.append("action:inferred-receive")
        reasons.append("No action word, but a count of units was heard - assumed receiving.")
        score += 0.12

    command.warehouse_code = _extract_warehouse(text) or (
        default_warehouse.upper() if default_warehouse else None
    )
    if command.warehouse_code:
        matched.append("warehouse")
        score += 0.05

    identity_text = text
    command.reference, identity_text = _extract_reference(identity_text)
    if command.reference:
        matched.append("reference")

    command.bin_location, identity_text = _extract_bin(identity_text)
    if command.bin_location:
        matched.append("bin")

    command.sku, identity_text = _extract_sku(identity_text)
    if command.sku:
        matched.append("sku")
        score += 0.26
    else:
        hint = re.search(
            r"\b(?:of|for)\s+([a-z][a-z\s]{2,40}?)(?=\s+(?:to|at|in|into|bin|and|from)\b|$)",
            identity_text,
        )
        if hint:
            command.product_hint = hint.group(1).strip()
            matched.append("product-hint")
            score += 0.1

    # Counts come from the corrected tail when there was one.
    count_text = corrected_text if was_corrected else identity_text
    _, count_text = _extract_reference(count_text)
    _, count_text = _extract_bin(count_text)
    _, count_text = _extract_sku(count_text)

    command.damaged_quantity, damaged_reason = _extract_damaged(count_text, None)
    if damaged_reason:
        matched.append("damaged")
        reasons.append(f"Read {damaged_reason}.")
        score += 0.05

    quantity_text = re.split(r"\b(?:damaged|broken|crushed|dented)\b", count_text)[0]
    quantity, quantity_reason = _extract_quantity(quantity_text)
    if quantity is not None:
        command.quantity = quantity
        matched.append("quantity")
        score += 0.3
        if quantity_reason and "of" in quantity_reason:
            reasons.append(f"Read the count as {quantity_reason} = {quantity}.")

    if command.damaged_quantity and command.quantity is None:
        # "three damaged" on its own is a write-off, not a receipt.
        if command.action in ("damage", "unknown"):
            command.action = "damage"
            command.quantity = command.damaged_quantity

    # Re-run "all damaged" now that the quantity is known.
    if re.search(r"\ball\s+(?:of them\s+)?(?:are\s+|were\s+)?damaged\b", count_text) and command.quantity:
        command.damaged_quantity = command.quantity

    if catalogue is not None:
        resolved, name, alternatives = resolve_sku(command.sku, command.product_hint, catalogue)
        command.resolved_sku = resolved
        command.product_name = name
        command.alternatives = alternatives
        if resolved:
            matched.append("catalogue-match")
            score += 0.08
            if command.sku and resolved != command.sku:
                reasons.append(f"Heard {command.sku}; closest SKU in the catalogue is {resolved}.")
        elif alternatives:
            reasons.append("More than one SKU sounds like that - pick one below.")

    command.matched_patterns = matched
    command.reasons = reasons
    command.confidence = round(min(1.0, score) * max(0.45, speech_confidence), 2)

    if speech_confidence < 0.7:
        reasons.append("The microphone signal was weak, so check the numbers before confirming.")

    command.missing = _missing_fields(command, catalogue)
    command.clarification = _clarification(command, catalogue)
    command.needs_confirmation = True  # every write is confirmed, always
    return command


def _missing_fields(command: VoiceCommand, catalogue) -> List[str]:
    missing: List[str] = []
    if command.action in ("receive", "damage", "adjust", "transfer"):
        if command.quantity is None:
            missing.append("quantity")
        if not (command.resolved_sku or (catalogue is None and command.sku)):
            missing.append("sku")
    if command.action == "query" and not (command.resolved_sku or command.sku or command.product_hint):
        missing.append("sku")
    if command.action in ("receive", "damage", "adjust") and not command.warehouse_code:
        missing.append("warehouse")
    return missing


def _clarification(command: VoiceCommand, catalogue) -> Optional[str]:
    if command.action == "unknown":
        return (
            "That did not match a warehouse command. Try: "
            "log 50 units of SKU-1042, 2 damaged."
        )
    if command.damaged_quantity and command.quantity and command.damaged_quantity > command.quantity:
        return (
            f"Heard {command.damaged_quantity} damaged out of {command.quantity} received. "
            "Say the counts again."
        )
    if "quantity" in command.missing:
        return "How many units? For example: log 50 units of SKU-1042."
    if "sku" in command.missing:
        if command.alternatives:
            names = ", ".join(str(alt["sku"]) for alt in command.alternatives)
            return f"Which SKU - {names}?"
        if command.sku and catalogue is not None:
            return f"{command.sku} is not in the catalogue. Say the SKU again, or pick it on screen."
        return "Which SKU? Say the SKU number after the quantity."
    if "warehouse" in command.missing:
        return "Which building? Pick Reno or Columbus at the top of the screen."
    return None


def spoken_confirmation(command: VoiceCommand) -> str:
    """What the widget reads back before anything is written."""
    if command.clarification:
        return command.clarification

    sku = command.resolved_sku or command.sku or "that SKU"
    named = f"{sku}" + (f", {command.product_name}" if command.product_name else "")
    where = f" at {command.warehouse_code.title()}" if command.warehouse_code else ""

    if command.action == "receive":
        good = (command.quantity or 0) - command.damaged_quantity
        sentence = f"Logging {command.quantity} units of {named}{where}"
        if command.damaged_quantity:
            sentence += f". {command.damaged_quantity} damaged, {good} to stock"
        if command.bin_location:
            sentence += f". Bin {command.bin_location}"
        return sentence + ". Confirm?"
    if command.action == "damage":
        count = command.damaged_quantity or command.quantity
        return f"Writing off {count} damaged units of {named}{where}. Confirm?"
    if command.action == "adjust":
        return f"Setting {named} to {command.quantity} units{where}. Confirm?"
    if command.action == "query":
        return f"Checking stock for {named}{where}."
    if command.action == "transfer":
        return f"Transferring {command.quantity} units of {named} to {(command.warehouse_code or '').title()}. Confirm?"
    return "Command not recognised."
