from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import zlib
from pathlib import Path, PurePosixPath

import jsonschema
import pytest

from pal_hatch_helper.parsers.subprocess import SubprocessParserAdapter

REPOSITORY_ROOT = Path(__file__).parents[4]
PARSER = REPOSITORY_ROOT / "parser" / "palworld-save-parser"
PARSER_VERSION = (REPOSITORY_ROOT / "parser" / "VERSION").read_text(encoding="utf-8").strip()
FIXTURE = REPOSITORY_ROOT / "data" / "parser-fixtures" / "plm-minimal"
EXPECTED_GVAS_SHA256 = "ff7665e4f70d30eb31a747c229cf1bd348e050e535b8fe37397d3fe8072158a1"
FIXED_MTIME = 1_784_390_400


@pytest.fixture(scope="session")
def parser_binary() -> Path:
    assert PARSER.is_file(), "build parser/palworld-save-parser before running pytest"
    assert os.access(PARSER, os.X_OK), "parser/palworld-save-parser must be executable"
    return PARSER


@pytest.fixture(scope="session")
def gvas_body() -> bytes:
    encoded = b"".join((FIXTURE / "Level.gvas.base64").read_bytes().split())
    body = base64.b64decode(encoded, validate=True)
    assert hashlib.sha256(body).hexdigest() == EXPECTED_GVAS_SHA256
    assert body.startswith(b"GVAS")
    return body


def _container(
    body: bytes, *, magic: bytes, save_type: int, raw_length: int | None = None
) -> bytes:
    return (
        struct.pack("<II", len(body) if raw_length is None else raw_length, len(body))
        + magic
        + bytes([save_type])
        + body
    )


def _snapshot(tmp_path: Path, level: bytes, *, player: bytes | None = None) -> Path:
    snapshot = tmp_path / "snapshot"
    (snapshot / "Players").mkdir(parents=True)
    level_path = snapshot / "Level.sav"
    level_path.write_bytes(level)
    os.utime(level_path, (FIXED_MTIME, FIXED_MTIME))
    if player is not None:
        player_path = snapshot / "Players" / "11111111111111111111111111111111.sav"
        player_path.write_bytes(player)
        os.utime(player_path, (FIXED_MTIME, FIXED_MTIME))
    return snapshot


def _environment() -> dict[str, str]:
    environment = os.environ.copy()
    environment["PALHATCH_WORLD_UID"] = "fixture-world-001"
    return environment


def _run(
    parser: Path,
    snapshot: Path,
    output: Path,
    *,
    environment: dict[str, str],
) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        [str(parser), "--snapshot", str(snapshot), "--output", str(output)],
        env=environment,
        check=False,
        capture_output=True,
        timeout=15,
    )


def test_self_contained_parser_decodes_real_plm_fixture(
    parser_binary: Path,
    tmp_path: Path,
) -> None:
    isolated_parser = tmp_path / "palworld-save-parser"
    shutil.copy2(parser_binary, isolated_parser)
    plm_fixture = (FIXTURE / "Level.sav").read_bytes()
    source_hash = hashlib.sha256(plm_fixture).hexdigest()
    snapshot = _snapshot(tmp_path, plm_fixture, player=plm_fixture)
    output = tmp_path / "canonical.json"

    result = _run(
        isolated_parser,
        snapshot,
        output,
        environment=_environment(),
    )

    assert result.returncode == 0, result.stderr.decode("utf-8")
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload == json.loads((FIXTURE / "expected-canonical.json").read_text(encoding="utf-8"))
    schema = json.loads(
        (REPOSITORY_ROOT / "packages/contracts/schema/canonical-snapshot.schema.json").read_text(
            encoding="utf-8"
        )
    )
    jsonschema.Draft202012Validator(
        schema,
        format_checker=jsonschema.FormatChecker(),
    ).validate(payload)
    assert hashlib.sha256((snapshot / "Level.sav").read_bytes()).hexdigest() == source_hash
    assert (
        hashlib.sha256(
            (snapshot / "Players" / "11111111111111111111111111111111.sav").read_bytes()
        ).hexdigest()
        == source_hash
    )
    assert output.stat().st_size < 64 * 1024 * 1024
    assert {path.name for path in tmp_path.iterdir()} == {
        "canonical.json",
        "palworld-save-parser",
        "snapshot",
    }


@pytest.mark.parametrize("save_type", [0x31, 0x32])
def test_plz_read_only_compatibility(
    parser_binary: Path,
    gvas_body: bytes,
    tmp_path: Path,
    save_type: int,
) -> None:
    compressed = zlib.compress(gvas_body)
    if save_type == 0x32:
        compressed = zlib.compress(compressed)
    snapshot = _snapshot(
        tmp_path,
        _container(compressed, magic=b"PlZ", save_type=save_type, raw_length=len(gvas_body)),
    )
    output = tmp_path / "canonical.json"

    result = _run(parser_binary, snapshot, output, environment=_environment())

    assert result.returncode == 0, result.stderr.decode("utf-8")
    assert json.loads(output.read_bytes())["server"]["save_version"] == f"PlZ/0x{save_type:02x}"


@pytest.mark.parametrize(
    "contents", [b"short", _container(b"tiny", magic=b"PlM", save_type=0x31, raw_length=4096)]
)
def test_corrupted_or_truncated_file_fails_without_partial_output(
    parser_binary: Path,
    tmp_path: Path,
    contents: bytes,
) -> None:
    snapshot = _snapshot(tmp_path, contents)
    output = tmp_path / "canonical.json"

    result = _run(parser_binary, snapshot, output, environment=_environment())

    assert result.returncode == 1
    assert not output.exists()


def test_truncated_real_plm_fails_without_partial_output(
    parser_binary: Path,
    tmp_path: Path,
) -> None:
    truncated = (FIXTURE / "Level.sav").read_bytes()[:-1]
    snapshot = _snapshot(tmp_path, truncated)
    output = tmp_path / "canonical.json"

    result = _run(parser_binary, snapshot, output, environment=_environment())

    assert result.returncode != 0
    assert not output.exists()
    assert (snapshot / "Level.sav").read_bytes() == truncated


def test_declared_raw_length_limit_fails_before_output(
    parser_binary: Path,
    tmp_path: Path,
) -> None:
    snapshot = _snapshot(tmp_path, (FIXTURE / "Level.sav").read_bytes())
    output = tmp_path / "canonical.json"
    environment = _environment()
    environment["PALHATCH_SAV_MAX_BYTES"] = "1024"

    result = _run(parser_binary, snapshot, output, environment=environment)

    assert result.returncode == 1
    assert not output.exists()


def test_corrupted_declared_player_file_fails_without_partial_snapshot(
    parser_binary: Path,
    gvas_body: bytes,
    tmp_path: Path,
) -> None:
    level = _container(
        zlib.compress(gvas_body),
        magic=b"PlZ",
        save_type=0x31,
        raw_length=len(gvas_body),
    )
    snapshot = _snapshot(tmp_path, level, player=b"truncated-player")
    output = tmp_path / "canonical.json"

    result = _run(parser_binary, snapshot, output, environment=_environment())

    assert result.returncode == 1
    assert not output.exists()


def test_output_is_deterministic_and_does_not_read_configured_source_root(
    parser_binary: Path,
    gvas_body: bytes,
    tmp_path: Path,
) -> None:
    snapshot = _snapshot(
        tmp_path,
        _container(
            zlib.compress(gvas_body), magic=b"PlZ", save_type=0x31, raw_length=len(gvas_body)
        ),
    )
    forbidden = tmp_path / "real-source"
    forbidden.mkdir()
    (forbidden / "secret.sav").write_bytes(b"must-not-be-read")
    environment = _environment()
    environment["PALWORLD_SAVE_ROOT"] = str(forbidden)
    environment["SUPABASE_SERVICE_ROLE_KEY"] = "must-not-reach-output"
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"

    first_result = _run(parser_binary, snapshot, first, environment=environment)
    second_result = _run(parser_binary, snapshot, second, environment=environment)

    assert first_result.returncode == second_result.returncode == 0
    assert first.read_bytes() == second.read_bytes()
    combined = first.read_bytes() + first_result.stderr + second_result.stderr
    assert b"must-not-reach-output" not in combined
    assert str(snapshot).encode() not in combined
    assert str(forbidden).encode() not in combined


def test_agent_sandbox_runs_exact_parser_command_against_read_only_snapshot(
    parser_binary: Path,
    tmp_path: Path,
) -> None:
    snapshot = _snapshot(tmp_path, (FIXTURE / "Level.sav").read_bytes())
    (snapshot / "Level.sav").chmod(0o444)
    (snapshot / "Players").chmod(0o555)
    snapshot.chmod(0o555)
    output = tmp_path / "sandbox-output.json"
    adapter = SubprocessParserAdapter(
        name="palhatch-plm-save-parser",
        version=PARSER_VERSION,
        command=(
            str(parser_binary),
            "--snapshot",
            "{snapshot_path}",
            "--output",
            "{output_path}",
        ),
        declared_files=(PurePosixPath("Level.sav"),),
        timeout_seconds=15,
        memory_limit_bytes=1536 * 1024 * 1024,
        cpu_limit_seconds=15,
        environment={"PALHATCH_WORLD_UID": "fixture-world-001"},
    )

    result = adapter.parse(snapshot, output)

    assert result.payload["server"] == {
        "world_uid": "fixture-world-001",
        "save_version": "PlM/0x31",
        "captured_at": "2026-07-18T16:00:00Z",
    }
    assert (snapshot / "Level.sav").stat().st_mode & 0o222 == 0


def test_parser_version_and_dynamic_dependencies(parser_binary: Path) -> None:
    version = subprocess.run(
        [str(parser_binary), "--version"],
        check=True,
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert version.stdout == f"{PARSER_VERSION}\n"
    readelf = shutil.which("readelf")
    assert readelf is not None, "readelf is required for Parser dependency inspection"
    dynamic = subprocess.run(
        [readelf, "-d", str(parser_binary)],
        check=True,
        capture_output=True,
        text=True,
        timeout=5,
    ).stdout
    needed = re.findall(r"Shared library: \[([^]]+)]", dynamic)
    assert needed == ["libc.so.6"]
