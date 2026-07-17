import asyncio
from collections.abc import Mapping

import pytest

from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.repositories.database import JSONValue
from pal_hatch_helper.runtime_settings import load_agent_runtime_settings


class StubDatabase:
    def __init__(self, payload: JSONValue) -> None:
        self.payload = payload

    async def rpc(
        self,
        function_name: str,
        parameters: Mapping[str, JSONValue],
    ) -> JSONValue:
        assert function_name == "get_runtime_settings_for_agent"
        assert parameters == {}
        return self.payload

    async def close(self) -> None:
        return None


def test_agent_loads_versioned_runtime_settings_with_hard_limits() -> None:
    state = asyncio.run(
        load_agent_runtime_settings(
            StubDatabase(
                {
                    "version": 7,
                    "settings": {
                        "job_creation_enabled": True,
                        "max_generations": 6,
                        "job_worker_concurrency": 2,
                        "ai_concurrency": 1,
                        "parser_timeout_seconds": 240,
                        "snapshot_retention_count": 5,
                        "data_stale_threshold_minutes": 20,
                        "ai_provider_order": ["template"],
                        "maintenance_announcement": None,
                    },
                }
            )
        )
    )

    assert state.version == 7
    assert state.settings.job_worker_concurrency == 2
    assert state.settings.snapshot_retention_count == 5


def test_agent_rejects_runtime_settings_beyond_shared_contract() -> None:
    with pytest.raises(StructuredError) as caught:
        asyncio.run(
            load_agent_runtime_settings(
                StubDatabase({"version": 8, "settings": {"job_worker_concurrency": 99}})
            )
        )

    assert caught.value.code is ErrorCode.DATABASE_RESPONSE_INVALID
