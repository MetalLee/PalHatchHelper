import asyncio
import json
import os
import tempfile
from collections.abc import Mapping
from pathlib import Path
from typing import Protocol, TypeGuard, cast

import httpx
from pydantic import SecretStr, ValidationError

from pal_hatch_helper.generated import (
    AIExplanationRequest,
    AIExplanationResult,
    AIRouteExplanation,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError


class AIProvider(Protocol):
    async def explain(self, request: AIExplanationRequest) -> AIExplanationResult: ...


class ConcurrencyLimitedAIProvider:
    def __init__(self, provider: AIProvider, maximum_concurrency: int) -> None:
        if maximum_concurrency < 1:
            raise ValueError("AI concurrency must be positive")
        self._provider = provider
        self._semaphore = asyncio.Semaphore(maximum_concurrency)

    async def explain(self, request: AIExplanationRequest) -> AIExplanationResult:
        async with self._semaphore:
            return await self._provider.explain(request)


class TemplateProvider:
    async def explain(self, request: AIExplanationRequest) -> AIExplanationResult:
        english = request.locale == "en-US"
        mode = _optimization_mode_label(request.optimization_mode.value, english=english)
        if request.routes and english:
            overall = (
                f"Deterministic results are shown in {mode} mode. The local template "
                "does not change recipes, scores, or instance assignments."
            )
        elif request.routes:
            overall = (
                f"已按{mode}模式展示确定性计算结果；"  # noqa: RUF001
                "解释使用本地模板，配方、分数和实例分配均未改变。"  # noqa: RUF001
            )
        elif english:
            overall = (
                "The bounded search returned no route for the fixed inputs. Try fewer "
                "desired passives, a different generation limit, or confirm guild sharing."
            )
        else:
            overall = (
                "当前固定输入的有界搜索未返回路线。可尝试减少期望被动、调整最大代数"
                "或确认公会共享范围后重新计算。"
            )
        route_explanations = [
            AIRouteExplanation(
                route_key=route.route_key,
                explanation=_template_route_explanation(
                    rank=route.rank,
                    generations=route.generation_count,
                    borrowed_count=route.borrowed_pal_count,
                    inventory_coverage=route.inventory_coverage,
                    english=english,
                ),
                labels=_template_labels(
                    route.borrowed_pal_count,
                    route.difficulty.value,
                    english=english,
                ),
            )
            for route in request.routes
        ]
        return AIExplanationResult(
            provider="template",
            model=None,
            degraded=True,
            explanation=overall,
            route_explanations=route_explanations,
        )


class FallbackAIProvider:
    def __init__(self, providers: tuple[AIProvider, ...]) -> None:
        if not providers:
            raise ValueError("at least one AI provider is required")
        self._providers = providers

    async def explain(self, request: AIExplanationRequest) -> AIExplanationResult:
        for provider in self._providers:
            try:
                return await provider.explain(request)
            except StructuredError:
                continue
        return await TemplateProvider().explain(request)


class OpenAICompatibleProvider:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | SecretStr,
        model: str,
        timeout_seconds: float = 30,
        maximum_response_bytes: int = 32_000,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key if isinstance(api_key, SecretStr) else SecretStr(api_key)
        self._model = model
        self._maximum_response_bytes = maximum_response_bytes
        self._owns_client = http_client is None
        self._http_client = http_client or httpx.AsyncClient(
            timeout=timeout_seconds,
            trust_env=False,
        )

    async def explain(self, request: AIExplanationRequest) -> AIExplanationResult:
        body = {
            "model": self._model,
            "temperature": 0,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Explain only the supplied deterministic routes. Return JSON only. "
                        "Never invent recipes, change scores, or add inventory facts. "
                        f"Write all user-facing text in locale {request.locale}."
                    ),
                },
                {"role": "user", "content": request.model_dump_json()},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "breeding_explanation",
                    "strict": True,
                    "schema": _provider_output_schema(),
                },
            },
        }
        try:
            response = await self._http_client.post(
                f"{self._base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key.get_secret_value()}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
        except (httpx.TimeoutException, httpx.TransportError) as error:
            raise _provider_unavailable() from error
        if response.is_error or len(response.content) > self._maximum_response_bytes:
            raise _provider_unavailable()
        try:
            payload = cast(object, response.json())
            content = _response_content(payload)
            value = cast(object, json.loads(content))
            result = _result_from_payload(
                value,
                provider="openai_compatible",
                model=self._model,
                degraded=False,
            )
            _validate_route_keys(request, result)
            return result
        except (KeyError, TypeError, ValueError, ValidationError) as error:
            raise _output_invalid() from error

    async def close(self) -> None:
        if self._owns_client:
            await self._http_client.aclose()


class CodexCliProvider:
    def __init__(
        self,
        *,
        command: tuple[str, ...] = (
            "codex",
            "exec",
            "--sandbox",
            "read-only",
            "--skip-git-repo-check",
            "-",
        ),
        timeout_seconds: float = 60,
        maximum_response_bytes: int = 32_000,
    ) -> None:
        if not command:
            raise ValueError("Codex CLI command is required")
        self._command = command
        self._timeout_seconds = timeout_seconds
        self._maximum_response_bytes = maximum_response_bytes

    async def explain(self, request: AIExplanationRequest) -> AIExplanationResult:
        prompt = (
            "Return one JSON object with explanation and route_explanations. "
            "Only explain supplied facts; do not change recipes, scores, or assignments. "
            f"Write all user-facing text in locale {request.locale}.\n" + request.model_dump_json()
        ).encode()
        process: asyncio.subprocess.Process | None = None
        try:
            with tempfile.TemporaryDirectory(prefix="palhatch-ai-") as directory:
                process = await asyncio.create_subprocess_exec(
                    *self._command,
                    cwd=Path(directory),
                    env=_codex_environment(),
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                stdout, _ = await asyncio.wait_for(
                    process.communicate(prompt),
                    timeout=self._timeout_seconds,
                )
        except TimeoutError as error:
            if process is not None and process.returncode is None:
                process.kill()
                await process.wait()
            raise _provider_unavailable() from error
        except (FileNotFoundError, OSError) as error:
            raise _provider_unavailable() from error
        if process.returncode != 0 or len(stdout) > self._maximum_response_bytes:
            raise _provider_unavailable()
        try:
            result = _result_from_payload(
                cast(object, json.loads(stdout)),
                provider="codex_cli",
                model="codex-cli",
                degraded=False,
            )
            _validate_route_keys(request, result)
            return result
        except (TypeError, ValueError, ValidationError) as error:
            raise _output_invalid() from error


def _template_labels(
    borrowed_count: int,
    difficulty: str,
    *,
    english: bool,
) -> list[str]:
    labels = ["Deterministic route" if english else "确定性路线"]
    if english:
        labels.append("No borrowing" if borrowed_count == 0 else "Guild borrowing")
    else:
        labels.append("无需借用" if borrowed_count == 0 else "包含公会借用")
    if difficulty == "low":
        labels.append("Easy to advance" if english else "较易推进")
    return labels


def _optimization_mode_label(mode: str, *, english: bool) -> str:
    labels = {
        "balanced": ("均衡", "balanced"),
        "fastest": ("最快", "fastest"),
        "highest_success": ("高成功率", "highest-success"),
        "least_borrowing": ("少借用", "least-borrowing"),
    }
    localized = labels.get(mode, ("自定义", "custom"))
    return localized[1] if english else localized[0]


def _template_route_explanation(
    *,
    rank: int,
    generations: int,
    borrowed_count: int,
    inventory_coverage: float,
    english: bool,
) -> str:
    if english:
        return (
            f"Route {rank} takes {generations} generations, borrows {borrowed_count} Pals, "
            f"and has {inventory_coverage:.0%} inventory coverage."
        )
    return (
        f"第 {rank} 条路线需要 {generations} 代，借用 {borrowed_count} 只，"  # noqa: RUF001
        f"库存覆盖率 {inventory_coverage:.0%}。"
    )


def _codex_environment() -> dict[str, str]:
    allowed = {
        "ALL_PROXY",
        "CODEX_API_KEY",
        "CODEX_HOME",
        "HOME",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "LOGNAME",
        "NO_PROXY",
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
        "PATH",
        "SHELL",
        "SSL_CERT_DIR",
        "SSL_CERT_FILE",
        "TEMP",
        "TERM",
        "TMP",
        "TMPDIR",
        "USER",
        "XDG_CACHE_HOME",
        "XDG_CONFIG_HOME",
        "all_proxy",
        "https_proxy",
        "http_proxy",
        "no_proxy",
    }
    return {key: value for key, value in os.environ.items() if key in allowed}


def _provider_output_schema() -> dict[str, object]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["explanation", "route_explanations"],
        "properties": {
            "explanation": {"type": "string", "minLength": 1, "maxLength": 10000},
            "route_explanations": {
                "type": "array",
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["route_key", "explanation", "labels"],
                    "properties": {
                        "route_key": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
                        "explanation": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 4000,
                        },
                        "labels": {
                            "type": "array",
                            "maxItems": 6,
                            "items": {"type": "string", "minLength": 1, "maxLength": 80},
                        },
                    },
                },
            },
        },
    }


def _response_content(payload: object) -> str:
    if not isinstance(payload, dict):
        raise TypeError("invalid response")
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise TypeError("invalid choices")
    message = choices[0].get("message")
    if not isinstance(message, dict) or not isinstance(message.get("content"), str):
        raise TypeError("invalid message")
    return cast(str, message["content"])


def _result_from_payload(
    payload: object,
    *,
    provider: str,
    model: str | None,
    degraded: bool,
) -> AIExplanationResult:
    if not _is_mapping(payload):
        raise TypeError("invalid explanation")
    return AIExplanationResult.model_validate(
        {
            "provider": provider,
            "model": model,
            "degraded": degraded,
            "explanation": payload.get("explanation"),
            "route_explanations": payload.get("route_explanations"),
        }
    )


def _validate_route_keys(
    request: AIExplanationRequest,
    result: AIExplanationResult,
) -> None:
    allowed = {route.route_key for route in request.routes}
    returned = {route.route_key for route in result.route_explanations}
    if not returned <= allowed or len(returned) != len(result.route_explanations):
        raise ValueError("unknown or duplicate route key")


def _is_mapping(value: object) -> TypeGuard[Mapping[str, object]]:
    return isinstance(value, Mapping) and all(isinstance(key, str) for key in value)


def _provider_unavailable() -> StructuredError:
    return StructuredError(
        code=ErrorCode.AI_PROVIDER_UNAVAILABLE,
        summary="The configured explanation provider is unavailable.",
        retryable=False,
    )


def _output_invalid() -> StructuredError:
    return StructuredError(
        code=ErrorCode.AI_OUTPUT_INVALID,
        summary="The explanation provider returned an invalid bounded response.",
        retryable=False,
    )
