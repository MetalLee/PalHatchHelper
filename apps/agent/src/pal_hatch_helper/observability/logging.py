import json
import logging
import sys
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import TextIO

_STANDARD_RECORD_FIELDS = set(logging.makeLogRecord({}).__dict__)
_SENSITIVE_FIELD_PARTS = ("authorization", "key", "secret", "token", "password")


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "event": getattr(record, "event", record.getMessage()),
        }
        for field, value in record.__dict__.items():
            if field in _STANDARD_RECORD_FIELDS or field in payload:
                continue
            payload[field] = _safe_value(field, value)
        if record.exc_info and record.exc_info[0] is not None:
            payload["exception"] = record.exc_info[0].__name__
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)


def configure_logging(*, stream: TextIO | None = None, level: int = logging.INFO) -> None:
    handler = logging.StreamHandler(stream or sys.stdout)
    handler.setFormatter(JsonLogFormatter())
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(level)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def _safe_value(field: str, value: object) -> object:
    lowered = field.lower()
    if any(part in lowered for part in _SENSITIVE_FIELD_PARTS):
        return "[REDACTED]"
    if isinstance(value, Mapping):
        return {str(key): _safe_value(str(key), item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_safe_value(field, item) for item in value]
    if isinstance(value, str | int | float | bool) or value is None:
        return value
    return str(value)
