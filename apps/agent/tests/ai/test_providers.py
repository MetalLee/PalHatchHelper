import asyncio
import json
import os
import sys

import httpx

from pal_hatch_helper.ai.providers import (
    CodexCliProvider,
    FallbackAIProvider,
    OpenAICompatibleProvider,
    TemplateProvider,
)
from pal_hatch_helper.generated import (
    AIExplanationRequest,
    AIExplanationRouteSummary,
    RouteModeScore,
    RouteRawScoreMetrics,
    RouteScoreBreakdown,
    RouteScoreComponent,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError


def _score() -> RouteScoreBreakdown:
    components = [
        RouteScoreComponent(
            component=name,
            raw_value=1,
            normalized_score=80,
            weight=1 / 8,
            weighted_score=10,
        )
        for name in (
            "route_length",
            "inventory_coverage",
            "passive_concentration",
            "borrowing",
            "intermediate_cost",
            "attempt_cost",
            "stability",
            "acquisition_cost",
        )
    ]
    modes = [
        RouteModeScore(
            optimization_mode=mode,
            scoring_profile_version=f"{mode}-v4",
            total_score=80,
            components=components,
        )
        for mode in ("balanced", "fastest", "highest_success", "least_borrowing")
    ]
    return RouteScoreBreakdown(
        scoring_profile_version="balanced-v5",
        estimate_basis="strategy_heuristic_no_verified_probability",
        raw_metrics=RouteRawScoreMetrics(
            generation_count=1,
            step_count=1,
            unique_starting_instance_count=2,
            starting_requirement_count=2,
            missing_pal_count=0,
            missing_passive_requirement_count=0,
            borrowed_pal_count=0,
            inventory_coverage=1,
            passive_carrier_count=1,
            passive_concentration=1,
            extra_passive_count=0,
            intermediate_pal_count=0,
            intermediate_passive_checkpoint_count=0,
            required_gender_checkpoint_count=0,
            estimated_attempts_min=1,
            estimated_attempts_max=3,
            difficulty="low",
        ),
        mode_scores=modes,
    )


def _request(locale: str = "zh-CN") -> AIExplanationRequest:
    return AIExplanationRequest(
        locale=locale,
        target_pal_id="test_target_pal",
        desired_passive_ids=["test_passive_a"],
        optimization_mode="balanced",
        version_summary={
            "game_data_content_hash": "a" * 64,
            "algorithm_version": "inventory-trait-aware-deterministic-v4",
            "scoring_profile_version": "balanced-v5",
        },
        routes=[
            AIExplanationRouteSummary(
                route_key="1" * 64,
                rank=1,
                total_score=80,
                generation_count=1,
                borrowed_pal_count=0,
                inventory_coverage=1,
                difficulty="low",
                pal_sequence=["pal_a", "pal_b", "test_target_pal"],
                score_breakdown=_score(),
            )
        ],
    )


def test_template_provider_completes_with_an_explicit_degraded_explanation() -> None:
    result = asyncio.run(TemplateProvider().explain(_request()))

    assert result.provider == "template"
    assert result.degraded
    assert len(result.route_explanations) == 1
    assert result.route_explanations[0].route_key == "1" * 64


def test_template_provider_does_not_overstate_an_empty_bounded_search() -> None:
    result = asyncio.run(TemplateProvider().explain(_request().model_copy(update={"routes": []})))

    assert "有界搜索未返回路线" in result.explanation
    assert "没有合法路线" not in result.explanation


def test_template_provider_uses_the_requested_english_locale() -> None:
    result = asyncio.run(TemplateProvider().explain(_request("en-US")))

    assert "deterministic" in result.explanation.lower()
    assert result.route_explanations[0].labels == [
        "Deterministic route",
        "No borrowing",
        "Easy to advance",
    ]


def test_fallback_order_is_external_then_codex_then_template() -> None:
    calls: list[str] = []

    class Failing:
        def __init__(self, name: str) -> None:
            self.name = name

        async def explain(self, _request_value: AIExplanationRequest):
            calls.append(self.name)
            raise StructuredError(
                code=ErrorCode.AI_PROVIDER_UNAVAILABLE,
                summary="fixture unavailable",
                retryable=False,
            )

    class Template(TemplateProvider):
        async def explain(self, request_value: AIExplanationRequest):
            calls.append("template")
            return await super().explain(request_value)

    provider = FallbackAIProvider((Failing("external"), Failing("codex"), Template()))
    result = asyncio.run(provider.explain(_request()))

    assert calls == ["external", "codex", "template"]
    assert result.provider == "template"


def test_openai_compatible_provider_accepts_only_schema_bounded_json() -> None:
    response_payload = {
        "explanation": "优先使用库存覆盖率更高的路线。",
        "route_explanations": [
            {"route_key": "1" * 64, "explanation": "借用少。", "labels": ["少借用"]}
        ],
    }
    captured_body: dict[str, object] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        captured_body.update(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "model": "fixture-model",
                "choices": [{"message": {"content": json.dumps(response_payload)}}],
            },
        )

    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            provider = OpenAICompatibleProvider(
                base_url="https://ai.example.invalid/v1",
                api_key="fixture-secret",
                model="fixture-model",
                http_client=client,
            )
            return await provider.explain(_request())

    result = asyncio.run(scenario())
    serialized = json.dumps(captured_body)

    assert result.provider == "openai_compatible"
    assert not result.degraded
    assert "fixture-secret" not in serialized
    assert "response_format" in captured_body


def test_codex_cli_provider_uses_stdin_and_schema_bounded_stdout() -> None:
    payload = json.dumps(
        {
            "explanation": "Codex fixture explanation",
            "route_explanations": [{"route_key": "1" * 64, "explanation": "fixture", "labels": []}],
        }
    )
    code = f"import sys; sys.stdin.read(); print({payload!r})"
    provider = CodexCliProvider(command=(sys.executable, "-c", code))

    result = asyncio.run(provider.explain(_request()))

    assert result.provider == "codex_cli"
    assert not result.degraded


def test_codex_cli_provider_does_not_inherit_the_supabase_service_role(
    monkeypatch,
) -> None:
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fixture-service-role")
    code = (
        "import json, os, sys; sys.stdin.read(); "
        "print(json.dumps({'explanation': "
        "os.environ.get('SUPABASE_SERVICE_ROLE_KEY', 'not-inherited'), "
        "'route_explanations': []}))"
    )
    provider = CodexCliProvider(command=(sys.executable, "-c", code))

    result = asyncio.run(provider.explain(_request()))

    assert result.explanation == "not-inherited"
    assert os.environ["SUPABASE_SERVICE_ROLE_KEY"] == "fixture-service-role"
