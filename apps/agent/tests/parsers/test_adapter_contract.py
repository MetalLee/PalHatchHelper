import json
import sys
from pathlib import Path, PurePosixPath

import pytest

from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.parsers.adapter import ParserAdapter
from pal_hatch_helper.parsers.subprocess import SubprocessParserAdapter


def _adapter(command: tuple[str, ...], **overrides: object) -> SubprocessParserAdapter:
    options: dict[str, object] = {
        "name": "fixture-parser",
        "version": "1.0.0",
        "command": command,
        "declared_files": (PurePosixPath("World.sav"),),
        "timeout_seconds": 2,
        "memory_limit_bytes": 256 * 1024 * 1024,
        "cpu_limit_seconds": 1,
    }
    options.update(overrides)
    return SubprocessParserAdapter(**options)  # type: ignore[arg-type]


def _snapshot(tmp_path: Path) -> Path:
    snapshot = tmp_path / "snapshot"
    snapshot.mkdir()
    (snapshot / "World.sav").write_bytes(b"redacted fixture")
    return snapshot


def test_subprocess_adapter_implements_protocol_and_declares_files(tmp_path: Path) -> None:
    adapter = _adapter(
        (
            sys.executable,
            "-c",
            "import json,sys; json.dump({'server': {}}, open(sys.argv[1], 'w'))",
            "{output_path}",
        )
    )

    assert isinstance(adapter, ParserAdapter)
    assert adapter.required_files() == (PurePosixPath("World.sav"),)
    assert adapter.detect_compatibility(_snapshot(tmp_path)).compatible


def test_parser_runs_with_only_the_declared_output_and_returns_json(tmp_path: Path) -> None:
    payload = {"server": {"world_uid": "fixture-world"}, "players": [], "pals": []}
    adapter = _adapter(
        (
            sys.executable,
            "-c",
            "import json,sys; json.dump(json.loads(sys.argv[2]), open(sys.argv[1], 'w'))",
            "{output_path}",
            json.dumps(payload),
        )
    )
    output = tmp_path / "output" / "canonical.json"
    output.parent.mkdir(mode=0o700)

    result = adapter.parse(_snapshot(tmp_path), output)

    assert result.payload == payload
    assert result.output_path == output


def test_parser_can_read_only_the_runtime_entropy_device(tmp_path: Path) -> None:
    adapter = _adapter(
        (
            sys.executable,
            "-c",
            (
                "import json,sys; "
                "entropy=open('/dev/urandom','rb').read(1); "
                "json.dump({'entropy_available':len(entropy)==1},open(sys.argv[1],'w'))"
            ),
            "{output_path}",
        )
    )

    result = adapter.parse(_snapshot(tmp_path), tmp_path / "result.json")

    assert result.payload == {"entropy_available": True}


def test_parser_timeout_is_a_stable_failure(tmp_path: Path) -> None:
    adapter = _adapter(
        (sys.executable, "-c", "import time; time.sleep(5)"),
        timeout_seconds=0.05,
    )

    with pytest.raises(StructuredError) as caught:
        adapter.parse(_snapshot(tmp_path), tmp_path / "result.json")

    assert caught.value.code is ErrorCode.PARSER_TIMEOUT
    assert caught.value.retryable


def test_parser_nonzero_exit_is_rejected(tmp_path: Path) -> None:
    adapter = _adapter((sys.executable, "-c", "raise SystemExit(7)"))

    with pytest.raises(StructuredError) as caught:
        adapter.parse(_snapshot(tmp_path), tmp_path / "result.json")

    assert caught.value.code is ErrorCode.PARSER_EXIT_NONZERO
    assert not caught.value.retryable


def test_parser_invalid_json_is_rejected(tmp_path: Path) -> None:
    adapter = _adapter(
        (
            sys.executable,
            "-c",
            "import sys; open(sys.argv[1], 'w').write('{broken')",
            "{output_path}",
        )
    )

    with pytest.raises(StructuredError) as caught:
        adapter.parse(_snapshot(tmp_path), tmp_path / "result.json")

    assert caught.value.code is ErrorCode.PARSER_OUTPUT_INVALID
    assert not caught.value.retryable


def test_parser_cannot_write_to_read_only_snapshot(tmp_path: Path) -> None:
    snapshot = _snapshot(tmp_path)
    (snapshot / "World.sav").chmod(0o444)
    snapshot.chmod(0o555)
    script = (
        "import json,sys; ok=False; "
        "\ntry:\n open(sys.argv[1]+'/World.sav','wb').write(b'changed')"
        "\nexcept OSError:\n ok=True"
        "\njson.dump({'read_only':ok},open(sys.argv[2],'w'))"
    )
    adapter = _adapter(
        (
            sys.executable,
            "-c",
            script,
            "{snapshot_path}",
            "{output_path}",
        )
    )

    result = adapter.parse(snapshot, tmp_path / "result.json")

    assert result.payload == {"read_only": True}
    assert (snapshot / "World.sav").read_bytes() == b"redacted fixture"


def test_parser_has_no_network_secret_environment_or_write_access_outside_output(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "must-not-reach-parser")
    output = tmp_path / "output" / "result.json"
    output.parent.mkdir()
    forbidden = tmp_path / "forbidden.txt"
    script = (
        "import json,os,socket,sys; result={}; "
        "\ntry:\n socket.socket()\nexcept OSError:\n result['network_denied']=True"
        "\ntry:\n open(sys.argv[2],'w').write('bad')"
        "\nexcept OSError:\n result['outside_write_denied']=True"
        "\nresult['secret_absent']='SUPABASE_SERVICE_ROLE_KEY' not in os.environ"
        "\njson.dump(result,open(sys.argv[1],'w'))"
    )
    adapter = _adapter(
        (
            sys.executable,
            "-c",
            script,
            "{output_path}",
            str(forbidden),
        )
    )

    result = adapter.parse(_snapshot(tmp_path), output)

    assert result.payload == {
        "network_denied": True,
        "outside_write_denied": True,
        "secret_absent": True,
    }
    assert not forbidden.exists()


def test_parser_receives_only_explicit_non_secret_runtime_environment(tmp_path: Path) -> None:
    script = (
        "import json,os,sys; "
        "json.dump({'world':os.environ.get('PALHATCH_WORLD_UID'),"
        "'oodle':os.environ.get('PALHATCH_OODLE_LIB'),"
        "'secret_absent':'SUPABASE_SERVICE_ROLE_KEY' not in os.environ},"
        "open(sys.argv[1],'w'))"
    )
    adapter = _adapter(
        (sys.executable, "-c", script, "{output_path}"),
        environment={
            "PALHATCH_WORLD_UID": "fixture-world-001",
            "PALHATCH_OODLE_LIB": "/app/parser/lib/liboo2corelinux64.so.9",
        },
    )

    result = adapter.parse(_snapshot(tmp_path), tmp_path / "result.json")

    assert result.payload == {
        "world": "fixture-world-001",
        "oodle": "/app/parser/lib/liboo2corelinux64.so.9",
        "secret_absent": True,
    }


def test_parser_environment_rejects_non_allowlisted_keys() -> None:
    with pytest.raises(ValueError, match="allowlisted"):
        _adapter(
            (sys.executable, "-c", "pass"),
            environment={"SUPABASE_SERVICE_ROLE_KEY": "must-never-pass"},
        )


def test_parser_cannot_create_descendant_processes(tmp_path: Path) -> None:
    script = (
        "import json,os,sys; denied=False; "
        "\ntry:\n os.fork()"
        "\nexcept OSError:\n denied=True"
        "\njson.dump({'process_creation_denied':denied},open(sys.argv[1],'w'))"
    )
    adapter = _adapter(
        (
            sys.executable,
            "-c",
            script,
            "{output_path}",
        )
    )

    result = adapter.parse(_snapshot(tmp_path), tmp_path / "result.json")

    assert result.payload == {"process_creation_denied": True}


def test_parser_aggregate_output_limit_rejects_many_files(tmp_path: Path) -> None:
    script = (
        "import json,pathlib,sys; root=pathlib.Path(sys.argv[1]).parent; "
        "[(root/f'extra-{index}.bin').write_bytes(b'x'*32768) for index in range(3)]; "
        "json.dump({'ok':True},open(sys.argv[1],'w'))"
    )
    adapter = _adapter(
        (
            sys.executable,
            "-c",
            script,
            "{output_path}",
        ),
        max_output_bytes=64 * 1024,
    )

    with pytest.raises(StructuredError) as caught:
        adapter.parse(_snapshot(tmp_path), tmp_path / "result.json")

    assert caught.value.code is ErrorCode.PARSER_OUTPUT_INVALID
