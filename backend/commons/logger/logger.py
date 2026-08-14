"""Structured JSON logging.

One line per event, machine parseable, so warehouse incidents can be grepped by
warehouse or user long after the shift ended.
"""
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Optional

_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()) | {
    "asctime", "message", "taskName",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())

    for noisy in ("uvicorn.access", "uvicorn.error"):
        logging.getLogger(noisy).handlers = [handler]
        logging.getLogger(noisy).propagate = False


class StructuredLogger:
    """Thin wrapper that makes `extra=` safe.

    `logging` raises if an extra key collides with a LogRecord attribute
    ("message", "name", "module", ...). Callers should not have to memorise that
    list, so colliding keys are prefixed instead of blowing up the request.
    """

    def __init__(self, logger: logging.Logger):
        self._logger = logger

    @staticmethod
    def _clean(extra: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not extra:
            return {}
        return {(f"ctx_{k}" if k in _RESERVED else k): v for k, v in extra.items()}

    def debug(self, msg: str, extra: Optional[Dict[str, Any]] = None, **kwargs) -> None:
        self._logger.debug(msg, extra=self._clean(extra), **kwargs)

    def info(self, msg: str, extra: Optional[Dict[str, Any]] = None, **kwargs) -> None:
        self._logger.info(msg, extra=self._clean(extra), **kwargs)

    def warning(self, msg: str, extra: Optional[Dict[str, Any]] = None, **kwargs) -> None:
        self._logger.warning(msg, extra=self._clean(extra), **kwargs)

    def error(self, msg: str, extra: Optional[Dict[str, Any]] = None, **kwargs) -> None:
        self._logger.error(msg, extra=self._clean(extra), **kwargs)

    def exception(self, msg: str, extra: Optional[Dict[str, Any]] = None, **kwargs) -> None:
        self._logger.exception(msg, extra=self._clean(extra), **kwargs)


def get_logger(name: str) -> StructuredLogger:
    return StructuredLogger(logging.getLogger(name))
