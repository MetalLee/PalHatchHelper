import asyncio

import pytest

from pal_hatch_helper.cli import build_parser, main, run_job_worker
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.settings import Settings


@pytest.mark.parametrize("command", ["api", "job-worker", "save-worker"])
def test_cli_keeps_three_explicit_process_boundaries(command: str) -> None:
    arguments = build_parser().parse_args([command])

    assert arguments.command == command


def test_cli_help_is_available_without_runtime_credentials(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as caught:
        main(["--help"])

    assert caught.value.code == 0
    assert "job-worker" in capsys.readouterr().out


def test_save_worker_uses_a_stable_not_implemented_error_code(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = main(["save-worker"])

    assert exit_code == 2
    assert ErrorCode.SAVE_WORKER_NOT_IMPLEMENTED.value in capsys.readouterr().out


def test_job_worker_refuses_to_claim_without_a_real_handler() -> None:
    async def scenario() -> None:
        settings = Settings(
            app_env="test",
            supabase_url="http://127.0.0.1:54321",
            supabase_service_role_key="fixture-local-service-role",
        )

        with pytest.raises(StructuredError) as caught:
            await run_job_worker(settings)

        assert caught.value.code is ErrorCode.BREEDING_HANDLER_NOT_CONFIGURED
        assert not caught.value.retryable

    asyncio.run(scenario())
