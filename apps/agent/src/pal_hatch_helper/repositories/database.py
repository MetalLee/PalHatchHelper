from collections.abc import Mapping
from typing import Protocol, TypeGuard, cast

import httpx
from pydantic import SecretStr

from pal_hatch_helper.models.errors import ErrorCode, StructuredError

type JSONScalar = str | int | float | bool | None
type JSONValue = JSONScalar | list[JSONValue] | dict[str, JSONValue]


class DatabaseClient(Protocol):
    """Small Supabase RPC client isolated from job lifecycle semantics."""

    async def rpc(
        self,
        function_name: str,
        parameters: Mapping[str, JSONValue],
    ) -> JSONValue: ...

    async def close(self) -> None: ...


class SupabaseDatabaseClient(DatabaseClient):
    def __init__(
        self,
        *,
        base_url: str,
        service_role_key: SecretStr,
        request_timeout_seconds: float = 10,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        key = service_role_key.get_secret_value()
        self._base_url = base_url.rstrip("/")
        self._owns_http_client = http_client is None
        self._headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        self._http_client = http_client or httpx.AsyncClient(
            timeout=request_timeout_seconds,
            trust_env=False,
        )

    async def rpc(
        self,
        function_name: str,
        parameters: Mapping[str, JSONValue],
    ) -> JSONValue:
        try:
            response = await self._http_client.post(
                f"{self._base_url}/rest/v1/rpc/{function_name}",
                json=dict(parameters),
                headers=self._headers,
            )
        except (httpx.TimeoutException, httpx.TransportError) as error:
            raise StructuredError(
                code=ErrorCode.DATABASE_UNAVAILABLE,
                summary="Supabase RPC transport is temporarily unavailable.",
                retryable=True,
            ) from error

        if response.status_code in {408, 429} or response.status_code >= 500:
            raise StructuredError(
                code=ErrorCode.DATABASE_UNAVAILABLE,
                summary="Supabase RPC is temporarily unavailable.",
                retryable=True,
            )
        if response.is_error:
            raise _rpc_rejected(response)

        try:
            payload = cast(object, response.json())
        except ValueError as error:
            raise StructuredError(
                code=ErrorCode.DATABASE_RESPONSE_INVALID,
                summary="Supabase RPC returned invalid JSON.",
                retryable=False,
            ) from error
        if not _is_json_value(payload):
            raise StructuredError(
                code=ErrorCode.DATABASE_RESPONSE_INVALID,
                summary="Supabase RPC returned an unsupported JSON value.",
                retryable=False,
            )
        return payload

    async def close(self) -> None:
        if self._owns_http_client:
            await self._http_client.aclose()


def _rpc_rejected(response: httpx.Response) -> StructuredError:
    message: object = None
    try:
        payload = response.json()
        if isinstance(payload, dict):
            message = payload.get("message")
    except ValueError:
        pass

    if message == ErrorCode.JOB_LOCK_NOT_OWNED.value:
        return StructuredError(
            code=ErrorCode.JOB_LOCK_NOT_OWNED,
            summary="The job lease is no longer owned by this Worker.",
            retryable=False,
        )
    return StructuredError(
        code=ErrorCode.DATABASE_RPC_REJECTED,
        summary="Supabase rejected the Agent RPC.",
        retryable=False,
    )


def _is_json_value(value: object) -> TypeGuard[JSONValue]:
    if value is None or isinstance(value, str | int | float | bool):
        return True
    if isinstance(value, list):
        return all(_is_json_value(item) for item in value)
    if isinstance(value, dict):
        return all(isinstance(key, str) and _is_json_value(item) for key, item in value.items())
    return False
