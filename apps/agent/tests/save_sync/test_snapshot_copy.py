import hashlib
import os
import shutil
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

import pytest

from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.save_sync.snapshot import SnapshotCopier

FIXTURE_ROOT = Path(__file__).parents[4] / "data" / "parser-fixtures" / "minimal-save"
REQUIRED_FILES = (PurePosixPath("World.sav"), PurePosixPath("Players/0001.sav"))


def _tree_evidence(root: Path) -> dict[str, tuple[str, int]]:
    return {
        path.relative_to(root).as_posix(): (
            hashlib.sha256(path.read_bytes()).hexdigest(),
            path.stat().st_mode & 0o777,
        )
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def _copy_fixture(tmp_path: Path) -> Path:
    source = tmp_path / "source"
    shutil.copytree(FIXTURE_ROOT, source)
    return source


def test_fixture_is_byte_and_mode_identical_after_successful_snapshot(tmp_path: Path) -> None:
    before = _tree_evidence(FIXTURE_ROOT)
    copier = SnapshotCopier(
        snapshot_root=tmp_path / "snapshots",
        stability_delay_seconds=0,
    )

    outcome = copier.create(FIXTURE_ROOT, REQUIRED_FILES)

    assert not outcome.duplicate
    assert outcome.path is not None
    assert outcome.path.parent == tmp_path / "snapshots"
    assert (outcome.path / "World.sav").read_bytes() == (FIXTURE_ROOT / "World.sav").read_bytes()
    assert _tree_evidence(FIXTURE_ROOT) == before
    assert (
        outcome.content_hash
        == hashlib.sha256(
            b"World.sav\0"
            + (FIXTURE_ROOT / "World.sav").read_bytes()
            + b"Players/0001.sav\0"
            + (FIXTURE_ROOT / "Players/0001.sav").read_bytes()
        ).hexdigest()
    )


def test_change_between_stability_manifests_is_rejected(tmp_path: Path) -> None:
    source = _copy_fixture(tmp_path)

    def mutate_during_wait(_: float) -> None:
        (source / "World.sav").write_bytes(b"changed between manifests")

    copier = SnapshotCopier(
        snapshot_root=tmp_path / "snapshots",
        stability_delay_seconds=10,
        sleeper=mutate_during_wait,
    )

    with pytest.raises(StructuredError) as caught:
        copier.create(source, REQUIRED_FILES)

    assert caught.value.code is ErrorCode.SAVE_SOURCE_UNSTABLE
    assert not list((tmp_path / "snapshots").glob(".tmp-*"))


def test_change_during_copy_is_rejected_and_fixture_remains_unchanged(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _copy_fixture(tmp_path)
    fixture_before = _tree_evidence(FIXTURE_ROOT)
    from pal_hatch_helper.save_sync import snapshot as snapshot_module

    real_copy = snapshot_module.copy_file_read_only
    calls = 0

    def copy_then_mutate(
        source_root: Path,
        relative_path: PurePosixPath,
        destination_path: Path,
    ) -> None:
        nonlocal calls
        real_copy(source_root, relative_path, destination_path)
        calls += 1
        if calls == 1:
            (source / "Players" / "0001.sav").write_bytes(b"changed during copy")

    monkeypatch.setattr(snapshot_module, "copy_file_read_only", copy_then_mutate)
    copier = SnapshotCopier(
        snapshot_root=tmp_path / "snapshots",
        stability_delay_seconds=0,
    )

    with pytest.raises(StructuredError) as caught:
        copier.create(source, REQUIRED_FILES)

    assert caught.value.code is ErrorCode.SAVE_SOURCE_CHANGED_DURING_COPY
    assert not list((tmp_path / "snapshots").iterdir())
    assert _tree_evidence(FIXTURE_ROOT) == fixture_before


def test_symlink_escape_is_rejected_without_reading_the_target(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    outside = tmp_path / "outside.sav"
    outside.write_bytes(b"must never be copied")
    (source / "World.sav").symlink_to(outside)
    before = outside.read_bytes()
    copier = SnapshotCopier(
        snapshot_root=tmp_path / "snapshots",
        stability_delay_seconds=0,
    )

    with pytest.raises(StructuredError) as caught:
        copier.create(source, (PurePosixPath("World.sav"),))

    assert caught.value.code is ErrorCode.SAVE_PATH_UNSAFE
    assert outside.read_bytes() == before


def test_symlinked_parent_directory_escape_is_rejected(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    (source / "World.sav").write_bytes(b"safe")
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "0001.sav").write_bytes(b"must not be copied")
    (source / "Players").symlink_to(outside, target_is_directory=True)
    copier = SnapshotCopier(
        snapshot_root=tmp_path / "snapshots",
        stability_delay_seconds=0,
    )

    with pytest.raises(StructuredError) as caught:
        copier.create(source, REQUIRED_FILES)

    assert caught.value.code is ErrorCode.SAVE_PATH_UNSAFE
    assert (outside / "0001.sav").read_bytes() == b"must not be copied"


def test_matching_previous_hash_skips_duplicate_snapshot(tmp_path: Path) -> None:
    copier = SnapshotCopier(
        snapshot_root=tmp_path / "snapshots",
        stability_delay_seconds=0,
    )
    first = copier.create(FIXTURE_ROOT, REQUIRED_FILES)
    assert first.path is not None

    duplicate = copier.create(
        FIXTURE_ROOT,
        REQUIRED_FILES,
        previous_content_hash=first.content_hash,
    )

    assert duplicate.duplicate
    assert duplicate.path is None
    finalized = [
        path for path in (tmp_path / "snapshots").iterdir() if not path.name.startswith(".")
    ]
    assert finalized == [first.path]
    assert not list((tmp_path / "snapshots").glob(".tmp-*"))


def test_insufficient_disk_space_stops_before_copy(tmp_path: Path) -> None:
    @dataclass(frozen=True)
    class Usage:
        total: int
        used: int
        free: int

    usage = Usage(total=100, used=99, free=1)

    def disk_usage(_: Path) -> Usage:
        return usage

    copier = SnapshotCopier(
        snapshot_root=tmp_path / "snapshots",
        stability_delay_seconds=0,
        disk_reserve_bytes=1,
        disk_usage=disk_usage,
    )

    with pytest.raises(StructuredError) as caught:
        copier.create(FIXTURE_ROOT, REQUIRED_FILES)

    assert caught.value.code is ErrorCode.SNAPSHOT_DISK_INSUFFICIENT
    assert not list((tmp_path / "snapshots").iterdir())


def test_source_files_are_opened_read_only(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    observed_leaf_flags: dict[str, int] = {}
    real_open = os.open

    def recording_open(
        path: str | bytes | os.PathLike[str] | os.PathLike[bytes],
        flags: int,
        mode: int = 0o777,
        *,
        dir_fd: int | None = None,
    ) -> int:
        decoded_path = Path(os.fsdecode(path))
        if dir_fd is None:
            absolute_path = decoded_path
        else:
            descriptor_path = Path(os.readlink(f"/proc/self/fd/{dir_fd}"))
            absolute_path = descriptor_path / decoded_path
        if absolute_path.is_relative_to(FIXTURE_ROOT) and not flags & os.O_DIRECTORY:
            observed_leaf_flags[absolute_path.relative_to(FIXTURE_ROOT).as_posix()] = flags
        return real_open(path, flags, mode, dir_fd=dir_fd)

    monkeypatch.setattr(os, "open", recording_open)
    copier = SnapshotCopier(
        snapshot_root=tmp_path / "snapshots",
        stability_delay_seconds=0,
    )

    copier.create(FIXTURE_ROOT, REQUIRED_FILES)

    assert set(observed_leaf_flags) == {"World.sav", "Players/0001.sav"}
    assert all(flags & (os.O_WRONLY | os.O_RDWR) == 0 for flags in observed_leaf_flags.values())
    assert all(flags & os.O_NOFOLLOW for flags in observed_leaf_flags.values())
