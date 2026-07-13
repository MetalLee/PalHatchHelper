from dataclasses import dataclass
from enum import StrEnum


class ErrorCode(StrEnum):
    DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE"
    DATABASE_RPC_REJECTED = "DATABASE_RPC_REJECTED"
    DATABASE_RESPONSE_INVALID = "DATABASE_RESPONSE_INVALID"
    JOB_LOCK_NOT_OWNED = "JOB_LOCK_NOT_OWNED"
    JOB_HEARTBEAT_TIMEOUT = "JOB_HEARTBEAT_TIMEOUT"
    JOB_CANCELLED = "JOB_CANCELLED"
    HANDLER_FAILED = "HANDLER_FAILED"
    BREEDING_HANDLER_NOT_CONFIGURED = "BREEDING_HANDLER_NOT_CONFIGURED"
    SAVE_WORKER_NOT_IMPLEMENTED = "SAVE_WORKER_NOT_IMPLEMENTED"
    WORKER_SHUTDOWN = "WORKER_SHUTDOWN"


@dataclass(eq=False, slots=True)
class StructuredError(Exception):
    """Safe, stable error data that may cross the Repository/Worker boundary."""

    code: ErrorCode
    summary: str
    retryable: bool

    def __post_init__(self) -> None:
        self.summary = self.summary[:500]
        Exception.__init__(self, f"{self.code.value}: {self.summary}")
