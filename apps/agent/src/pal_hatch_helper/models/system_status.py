from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from pal_hatch_helper.generated.contracts import ReadinessStatus


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


__all__ = ["ReadinessStatus", "ServiceStatus", "SystemStatus"]
