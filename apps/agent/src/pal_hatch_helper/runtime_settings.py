from dataclasses import dataclass

from pydantic import ValidationError

from pal_hatch_helper.generated import RuntimeSettings
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.repositories.database import DatabaseClient


@dataclass(frozen=True, slots=True)
class AgentRuntimeSettings:
    version: int
    settings: RuntimeSettings


async def load_agent_runtime_settings(database: DatabaseClient) -> AgentRuntimeSettings:
    payload = await database.rpc("get_runtime_settings_for_agent", {})
    if not isinstance(payload, dict):
        raise _invalid()
    try:
        raw_version = payload["version"]
        if not isinstance(raw_version, int) or isinstance(raw_version, bool):
            raise TypeError("runtime settings version must be an integer")
        version = raw_version
        settings = RuntimeSettings.model_validate(payload["settings"])
    except (KeyError, TypeError, ValueError, ValidationError) as error:
        raise _invalid() from error
    if version < 1:
        raise _invalid()
    return AgentRuntimeSettings(version=version, settings=settings)


def _invalid() -> StructuredError:
    return StructuredError(
        code=ErrorCode.DATABASE_RESPONSE_INVALID,
        summary="Runtime settings RPC returned an invalid response.",
        retryable=False,
    )


__all__ = ["AgentRuntimeSettings", "load_agent_runtime_settings"]
