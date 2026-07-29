import asyncio
from pathlib import Path
from typing import Any, cast

import pytest

from pal_hatch_helper.ai.providers import ConcurrencyLimitedAIProvider
from pal_hatch_helper.cli import (
    _build_ai_provider,
    _build_inventory_sync_service,
    build_parser,
    main,
)
from pal_hatch_helper.models.errors import ErrorCode
from pal_hatch_helper.repositories.database import SupabaseDatabaseClient
from pal_hatch_helper.settings import Settings

PARSER_VERSION = (
    (Path(__file__).parents[3] / "parser" / "VERSION").read_text(encoding="utf-8").strip()
)


@pytest.mark.parametrize("command", ["api", "job-worker", "save-worker", "command-worker"])
def test_cli_keeps_long_running_process_boundaries(command: str) -> None:
    arguments = build_parser().parse_args([command])

    assert arguments.command == command


def test_job_worker_accepts_one_shot_execution_for_integration_checks() -> None:
    arguments = build_parser().parse_args(["job-worker", "--once"])

    assert arguments.once is True


def test_command_worker_accepts_one_shot_execution_for_recovery_checks() -> None:
    arguments = build_parser().parse_args(["command-worker", "--once"])

    assert arguments.once is True


def test_cli_help_is_available_without_runtime_credentials(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as caught:
        main(["--help"])

    assert caught.value.code == 0
    assert "job-worker" in capsys.readouterr().out


def test_catalog_diff_requires_two_explicit_versions() -> None:
    arguments = build_parser().parse_args(
        [
            "catalog",
            "diff",
            "--from-version-id",
            "73000000-0000-4000-8000-000000000001",
            "--to-version-id",
            "73000000-0000-4000-8000-000000000002",
        ]
    )

    assert arguments.catalog_command == "diff"


def test_catalog_prepare_breeding_source_binds_source_and_base_versions() -> None:
    arguments = build_parser().parse_args(
        [
            "catalog",
            "prepare-breeding-source",
            "--source-id",
            "74000000-0000-4000-8000-000000000001",
            "--source-version",
            "fixture-release-v1",
            "--base-version-id",
            "73000000-0000-4000-8000-000000000001",
        ]
    )

    assert arguments.catalog_command == "prepare-breeding-source"
    assert str(arguments.source_id) == "74000000-0000-4000-8000-000000000001"
    assert str(arguments.base_version_id) == "73000000-0000-4000-8000-000000000001"


def test_catalog_validate_succeeds_without_supabase_configuration(
    capsys: pytest.CaptureFixture[str],
) -> None:
    fixture = Path(__file__).parents[3] / "data" / "catalog-fixtures" / "minimal-valid"

    exit_code = main(["catalog", "validate", "--input", str(fixture)])

    assert exit_code == 0
    assert '"valid":true' in capsys.readouterr().out


def test_catalog_publish_requires_explicit_service_role_configuration(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    exit_code = main(
        [
            "catalog",
            "publish",
            "--world-id",
            "10000000-0000-4000-8000-000000000001",
            "--version-id",
            "71000000-0000-4000-8000-000000000001",
        ]
    )

    assert exit_code == 2
    assert ErrorCode.GAME_DATA_CONFIGURATION_REQUIRED.value in capsys.readouterr().out


def test_save_worker_requires_explicit_configuration(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = main(["save-worker"])

    assert exit_code == 2
    assert ErrorCode.SAVE_WORKER_CONFIGURATION_REQUIRED.value in capsys.readouterr().out


def test_job_worker_has_a_template_safe_ai_chain_without_external_credentials() -> None:
    provider, external = _build_ai_provider(Settings(app_env="test"))

    assert isinstance(provider, ConcurrencyLimitedAIProvider)
    assert external is None


def test_save_worker_constructs_self_contained_parser_without_runtime_files(
    tmp_path: Path,
) -> None:
    compose = tmp_path / "compose"
    saves = tmp_path / "saves"
    compose.mkdir()
    saves.mkdir()

    class FixtureDatabase:
        async def rpc(self, function: str, parameters: dict[str, Any]) -> object:
            assert function == "get_inventory_catalog_ids_for_agent"
            assert parameters["p_world_id"] == "10000000-0000-4000-8000-000000000001"
            return {"pal_ids": ["grassmon"], "passive_skill_ids": ["artisan"]}

    settings = Settings(
        app_env="test",
        supabase_url="http://127.0.0.1:54321",
        supabase_service_role_key="fixture-service-role",
        palhatch_data_dir=tmp_path / "data",
        palworld_compose_dir=compose,
        palworld_save_root=saves,
        palworld_world_id="10000000-0000-4000-8000-000000000001",
        palworld_world_uid="fixture-world-001",
        parser_name="palhatch-plm-save-parser",
        parser_version=PARSER_VERSION,
        parser_command_json=(
            '["/app/parser/palworld-save-parser","--snapshot","{snapshot_path}",'
            '"--output","{output_path}"]'
        ),
        parser_required_files_json='["Level.sav"]',
    )

    service = asyncio.run(
        _build_inventory_sync_service(
            settings,
            cast(SupabaseDatabaseClient, FixtureDatabase()),
        )
    )

    parser = service._parser
    assert parser._runtime_read_paths == ()
    assert parser._environment == {"PALHATCH_WORLD_UID": "fixture-world-001"}
