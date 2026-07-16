from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class AgentCommand(BaseModel):
    """A browser-safe command claim; command_type stays a string so unknown values fail closed."""

    model_config = ConfigDict(extra="forbid")

    command_id: UUID
    command_type: str = Field(min_length=1, max_length=80)
    payload: dict[str, object]
    idempotency_key: str = Field(min_length=8, max_length=160)
    created_at: AwareDatetime
    expires_at: AwareDatetime

    def expired(self, now: datetime) -> bool:
        return self.expires_at <= now


class AgentCommandResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    safe_summary: dict[str, object] = Field(default_factory=dict)
