import errno
import fcntl
import hashlib
import os
import shutil
import stat
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Protocol
from uuid import uuid4

from pal_hatch_helper.models.errors import ErrorCode, StructuredError

FICLONE = 0x40049409
READ_FLAGS = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW
READ_DIRECTORY_FLAGS = READ_FLAGS | os.O_DIRECTORY
WRITE_FLAGS = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
REFLINK_FALLBACK_ERRORS = {
    errno.EINVAL,
    errno.ENOTTY,
    errno.EOPNOTSUPP,
    errno.EXDEV,
}


@dataclass(frozen=True, slots=True)
class FileMetadata:
    relative_path: PurePosixPath
    size: int
    modified_ns: int


@dataclass(frozen=True, slots=True)
class SnapshotOutcome:
    path: Path | None
    content_hash: str
    source_modified_at: datetime
    duplicate: bool


class DiskUsage(Protocol):
    @property
    def free(self) -> int: ...


def _disk_usage(path: Path) -> DiskUsage:
    return shutil.disk_usage(path)


class SnapshotCopier:
    def __init__(
        self,
        *,
        snapshot_root: Path,
        stability_delay_seconds: float = 10,
        disk_reserve_bytes: int = 256 * 1024 * 1024,
        sleeper: Callable[[float], None] = time.sleep,
        disk_usage: Callable[[Path], DiskUsage] = _disk_usage,
    ) -> None:
        self._snapshot_root = snapshot_root
        self._stability_delay_seconds = stability_delay_seconds
        self._disk_reserve_bytes = disk_reserve_bytes
        self._sleeper = sleeper
        self._disk_usage = disk_usage

    @property
    def snapshot_root(self) -> Path:
        return self._snapshot_root

    def create(
        self,
        source_root: Path,
        required_files: Sequence[PurePosixPath],
        *,
        previous_content_hash: str | None = None,
    ) -> SnapshotOutcome:
        source = _validated_source_root(source_root)
        files = _validated_declaration(required_files)
        self._snapshot_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        snapshot_root = self._snapshot_root.resolve(strict=True)
        _ensure_separate_roots(source, snapshot_root)

        first = _collect_manifest(source, files)
        self._sleeper(self._stability_delay_seconds)
        second = _collect_manifest(source, files)
        if first != second:
            raise StructuredError(
                code=ErrorCode.SAVE_SOURCE_UNSTABLE,
                summary="Save file metadata changed between stability checks.",
                retryable=True,
            )

        required_bytes = sum(item.size for item in second) + self._disk_reserve_bytes
        if self._disk_usage(snapshot_root).free < required_bytes:
            raise StructuredError(
                code=ErrorCode.SNAPSHOT_DISK_INSUFFICIENT,
                summary="Insufficient free space for a safe save snapshot.",
                retryable=True,
            )

        temporary = snapshot_root / f".tmp-{uuid4()}"
        temporary.mkdir(mode=0o700)
        try:
            for metadata in second:
                destination_path = temporary.joinpath(*metadata.relative_path.parts)
                destination_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                copy_file_read_only(source, metadata.relative_path, destination_path)
                os.utime(
                    destination_path,
                    ns=(metadata.modified_ns, metadata.modified_ns),
                    follow_symlinks=False,
                )

            third = _collect_manifest(source, files)
            copied = _collect_manifest(temporary, files)
            if third != second or copied != second:
                raise StructuredError(
                    code=ErrorCode.SAVE_SOURCE_CHANGED_DURING_COPY,
                    summary="Save files changed while the snapshot was being copied.",
                    retryable=True,
                )

            source_hashes = _file_hashes(source, second)
            copied_hashes = _file_hashes(temporary, copied)
            if source_hashes != copied_hashes:
                raise StructuredError(
                    code=ErrorCode.SAVE_SOURCE_CHANGED_DURING_COPY,
                    summary="Source and snapshot content checksums differ after copy.",
                    retryable=True,
                )

            content_hash = _content_hash(temporary, copied)
            modified_at = datetime.fromtimestamp(
                max(item.modified_ns for item in second) / 1_000_000_000,
                tz=UTC,
            )
            if content_hash == previous_content_hash:
                _safe_rmtree(snapshot_root, temporary)
                return SnapshotOutcome(
                    path=None,
                    content_hash=content_hash,
                    source_modified_at=modified_at,
                    duplicate=True,
                )

            _make_tree_read_only(temporary)
            timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
            final_path = snapshot_root / f"{timestamp}-{content_hash[:12]}"
            temporary.rename(final_path)
            return SnapshotOutcome(
                path=final_path,
                content_hash=content_hash,
                source_modified_at=modified_at,
                duplicate=False,
            )
        except StructuredError:
            if temporary.exists():
                _safe_rmtree(snapshot_root, temporary)
            raise
        except OSError as error:
            if temporary.exists():
                _safe_rmtree(snapshot_root, temporary)
            raise StructuredError(
                code=ErrorCode.SNAPSHOT_COPY_FAILED,
                summary="Unable to create and verify the save snapshot.",
                retryable=True,
            ) from error


def copy_file_read_only(
    source_root: Path,
    relative_path: PurePosixPath,
    destination_path: Path,
) -> None:
    """Clone or copy bytes from an O_RDONLY|O_NOFOLLOW source descriptor."""
    source_fd = _open_declared_read_only(source_root, relative_path)
    try:
        destination_fd = os.open(destination_path, WRITE_FLAGS, 0o600)
        try:
            try:
                fcntl.ioctl(destination_fd, FICLONE, source_fd)
            except OSError as error:
                if error.errno not in REFLINK_FALLBACK_ERRORS:
                    raise
                os.lseek(source_fd, 0, os.SEEK_SET)
                os.ftruncate(destination_fd, 0)
                while chunk := os.read(source_fd, 1024 * 1024):
                    view = memoryview(chunk)
                    while view:
                        written = os.write(destination_fd, view)
                        view = view[written:]
            os.fsync(destination_fd)
        finally:
            os.close(destination_fd)
    finally:
        os.close(source_fd)


def _validated_source_root(source_root: Path) -> Path:
    try:
        if source_root.is_symlink():
            raise OSError("source root is a symlink")
        source = source_root.resolve(strict=True)
    except OSError as error:
        raise _unsafe_path() from error
    if not source.is_dir():
        raise _unsafe_path()
    return source


def _validated_declaration(
    required_files: Sequence[PurePosixPath],
) -> tuple[PurePosixPath, ...]:
    declared = tuple(required_files)
    if not declared or len(set(declared)) != len(declared):
        raise _unsafe_path()
    for relative in declared:
        if (
            relative.is_absolute()
            or not relative.parts
            or any(part in {"", ".", ".."} or "\\" in part for part in relative.parts)
        ):
            raise _unsafe_path()
    return declared


def _ensure_separate_roots(source: Path, snapshot_root: Path) -> None:
    if (
        source == snapshot_root
        or source.is_relative_to(snapshot_root)
        or snapshot_root.is_relative_to(source)
    ):
        raise _unsafe_path()


def _collect_manifest(
    root: Path,
    files: Sequence[PurePosixPath],
) -> tuple[FileMetadata, ...]:
    manifest: list[FileMetadata] = []
    for relative in files:
        descriptor: int | None = None
        try:
            descriptor = _open_declared_read_only(root, relative)
            details = os.fstat(descriptor)
            if not stat.S_ISREG(details.st_mode):
                raise OSError("declared path is not a regular file")
        except OSError as error:
            raise _unsafe_path() from error
        finally:
            if descriptor is not None:
                os.close(descriptor)
        manifest.append(
            FileMetadata(
                relative_path=relative,
                size=details.st_size,
                modified_ns=details.st_mtime_ns,
            )
        )
    return tuple(manifest)


def _file_hashes(
    root: Path,
    manifest: Sequence[FileMetadata],
) -> tuple[tuple[PurePosixPath, str], ...]:
    return tuple((metadata.relative_path, _hash_file(root, metadata)) for metadata in manifest)


def _hash_file(root: Path, expected: FileMetadata) -> str:
    descriptor = _open_declared_read_only(root, expected.relative_path)
    try:
        before = os.fstat(descriptor)
        if before.st_size != expected.size or before.st_mtime_ns != expected.modified_ns:
            raise StructuredError(
                code=ErrorCode.SAVE_SOURCE_CHANGED_DURING_COPY,
                summary="File metadata changed before content verification.",
                retryable=True,
            )
        digest = hashlib.sha256()
        while chunk := os.read(descriptor, 1024 * 1024):
            digest.update(chunk)
        after = os.fstat(descriptor)
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise StructuredError(
                code=ErrorCode.SAVE_SOURCE_CHANGED_DURING_COPY,
                summary="File metadata changed during content verification.",
                retryable=True,
            )
        return digest.hexdigest()
    finally:
        os.close(descriptor)


def _content_hash(root: Path, manifest: Sequence[FileMetadata]) -> str:
    digest = hashlib.sha256()
    for metadata in manifest:
        digest.update(metadata.relative_path.as_posix().encode("utf-8"))
        digest.update(b"\0")
        descriptor = _open_declared_read_only(root, metadata.relative_path)
        try:
            while chunk := os.read(descriptor, 1024 * 1024):
                digest.update(chunk)
        finally:
            os.close(descriptor)
    return digest.hexdigest()


def _open_declared_read_only(root: Path, relative: PurePosixPath) -> int:
    directory_fd = os.open(root, READ_DIRECTORY_FLAGS)
    try:
        for part in relative.parts[:-1]:
            next_fd = os.open(part, READ_DIRECTORY_FLAGS, dir_fd=directory_fd)
            os.close(directory_fd)
            directory_fd = next_fd
        return os.open(relative.parts[-1], READ_FLAGS, dir_fd=directory_fd)
    finally:
        os.close(directory_fd)


def _make_tree_read_only(root: Path) -> None:
    for path in root.rglob("*"):
        if path.is_file():
            path.chmod(0o444, follow_symlinks=False)
    directories = sorted((path for path in root.rglob("*") if path.is_dir()), reverse=True)
    for directory in directories:
        directory.chmod(0o555, follow_symlinks=False)
    root.chmod(0o555, follow_symlinks=False)


def _safe_rmtree(root: Path, candidate: Path) -> None:
    root_resolved = root.resolve(strict=True)
    candidate_resolved = candidate.resolve(strict=True)
    if candidate.is_symlink() or candidate_resolved.parent != root_resolved:
        raise StructuredError(
            code=ErrorCode.SNAPSHOT_CLEANUP_UNSAFE,
            summary="Snapshot cleanup target is outside the configured root.",
            retryable=False,
        )
    for path in candidate_resolved.rglob("*"):
        if path.is_dir():
            path.chmod(0o700, follow_symlinks=False)
    candidate_resolved.chmod(0o700, follow_symlinks=False)
    shutil.rmtree(candidate_resolved)


def _unsafe_path() -> StructuredError:
    return StructuredError(
        code=ErrorCode.SAVE_PATH_UNSAFE,
        summary="Declared save paths must be regular files contained by the confirmed root.",
        retryable=False,
    )
