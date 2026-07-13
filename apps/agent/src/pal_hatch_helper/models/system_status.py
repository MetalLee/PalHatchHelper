from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ServiceStatus(StrEnum):
    OK = "ok"
    READY = "ready"
    NOT_READY = "not_ready"


class SystemStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ServiceStatus
    service: str = Field(min_length=1)
    version: str = Field(min_length=1)
    timestamp: datetime

    @classmethod
    def now(cls, *, status: ServiceStatus, service: str, version: str) -> "SystemStatus":
        return cls(
            status=status,
            service=service,
            version=version,
            timestamp=datetime.now(UTC),
        )


class ReadinessStatus(SystemStatus):
    status: Literal[ServiceStatus.READY, ServiceStatus.NOT_READY]
    error_code: str | None = None
