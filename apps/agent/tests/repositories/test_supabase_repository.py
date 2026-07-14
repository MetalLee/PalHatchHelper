import asyncio
from collections.abc import Mapping

import httpx
import pytest
from pydantic import SecretStr

from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.repositories.database import JSONValue, SupabaseDatabaseClient
from pal_hatch_helper.repositories.jobs import SupabaseJobRepository
from tests.helpers import make_claim_row

type RPCCall = tuple[str, Mapping[str, JSONValue]]


class StubDatabaseClient:
    def __init__(self) -> None:
        self.calls: list[RPCCall] = []
        self.responses: dict[str, JSONValue] = {
            "claim_breeding_job": [make_claim_row()],
            "heartbeat_breeding_job": True,
            "complete_breeding_job": True,
            "fail_breeding_job": "retry_pending",
            "cancel_breeding_job": True,
            "release_breeding_job": "retry_pending",
            "release_stale_breeding_jobs": 2,
        }

    async def rpc(self, function_name: str, parameters: Mapping[str, JSONValue]) -> JSONValue:
        self.calls.append((function_name, parameters))
        return self.responses[function_name]

    async def close(self) -> None:
        return None


def test_repository_maps_the_complete_agent_rpc_lifecycle() -> None:
    async def scenario() -> None:
        client = StubDatabaseClient()
        repository = SupabaseJobRepository(client)

        claim = await repository.claim("worker-a")

        assert claim is not None
        assert claim.lease.worker_id == "worker-a"
        await repository.heartbeat(claim.lease)
        await repository.complete(claim.lease)
        retry_status = await repository.fail(
            claim.lease,
            StructuredError(
                code=ErrorCode.HANDLER_FAILED,
                summary="fixture failure",
                retryable=True,
            ),
        )
        await repository.cancel(
            claim.lease,
            StructuredError(
                code=ErrorCode.JOB_CANCELLED,
                summary="fixture cancellation",
                retryable=False,
            ),
        )
        release_status = await repository.release(
            claim.lease,
            StructuredError(
                code=ErrorCode.WORKER_SHUTDOWN,
                summary="fixture shutdown",
                retryable=True,
            ),
        )
        released = await repository.release_stale(claim.lease.heartbeat_at)

        assert retry_status == "retry_pending"
        assert release_status == "retry_pending"
        assert released == 2
        assert all(
            call[1]["p_lease_token"] == str(claim.lease.lease_token) for call in client.calls[1:6]
        )
        assert [call[0] for call in client.calls] == [
            "claim_breeding_job",
            "heartbeat_breeding_job",
            "complete_breeding_job",
            "fail_breeding_job",
            "cancel_breeding_job",
            "release_breeding_job",
            "release_stale_breeding_jobs",
        ]

    asyncio.run(scenario())


def test_repository_rejects_an_invalid_claim_response() -> None:
    async def scenario() -> None:
        client = StubDatabaseClient()
        client.responses["claim_breeding_job"] = {"unexpected": "object"}
        repository = SupabaseJobRepository(client)

        with pytest.raises(StructuredError) as caught:
            await repository.claim("worker-a")

        assert caught.value.code is ErrorCode.DATABASE_RESPONSE_INVALID
        assert not caught.value.retryable

    asyncio.run(scenario())


@pytest.mark.parametrize("status_code", [408, 429, 503])
def test_database_client_maps_temporary_supabase_outage_without_leaking_the_key(
    status_code: int,
) -> None:
    service_role = "fixture-service-role-secret-that-must-not-leak"

    async def scenario() -> None:
        transport = httpx.MockTransport(
            lambda _request: httpx.Response(
                status_code,
                json={"message": "gateway unavailable"},
            )
        )
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = SupabaseDatabaseClient(
                base_url="https://example.supabase.co",
                service_role_key=SecretStr(service_role),
                http_client=http_client,
            )
            with pytest.raises(StructuredError) as caught:
                await client.rpc("claim_breeding_job", {"p_worker_id": "worker-a"})

        assert caught.value.code is ErrorCode.DATABASE_UNAVAILABLE
        assert caught.value.retryable
        assert service_role not in str(caught.value)

    asyncio.run(scenario())


def test_database_client_does_not_inherit_system_proxy_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALL_PROXY", "socks://127.0.0.1:7890")

    async def scenario() -> None:
        client = SupabaseDatabaseClient(
            base_url="http://127.0.0.1:54321",
            service_role_key=SecretStr("fixture-local-service-role"),
        )
        await client.close()

    asyncio.run(scenario())


def test_database_client_preserves_the_stale_inventory_error_code() -> None:
    async def scenario() -> None:
        transport = httpx.MockTransport(
            lambda _request: httpx.Response(
                400,
                json={"code": "P0001", "message": "INVENTORY_SNAPSHOT_STALE"},
            )
        )
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = SupabaseDatabaseClient(
                base_url="https://example.supabase.co",
                service_role_key=SecretStr("fixture-local-service-role"),
                http_client=http_client,
            )
            with pytest.raises(StructuredError) as caught:
                await client.rpc("publish_inventory_snapshot", {})

        assert caught.value.code.value == "INVENTORY_SNAPSHOT_STALE"
        assert not caught.value.retryable

    asyncio.run(scenario())
