from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal
from uuid import UUID

from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.save_sync.snapshot import _safe_rmtree

type SnapshotStatus = Literal["pending", "success", "failed"]


@dataclass(frozen=True, slots=True)
class SnapshotRecord:
    path: Path
    status: SnapshotStatus
    captured_at: datetime
    snapshot_id: UUID | None = None
    content_hash: str | None = None
    source_modified_at: datetime | None = None


class SnapshotRetention:
    def __init__(
        self,
        snapshot_root: Path,
        *,
        successful_count: int = 3,
        failed_count: int = 1,
        failed_max_age: timedelta = timedelta(hours=24),
    ) -> None:
        self._root = snapshot_root
        self._successful_count = successful_count
        self._failed_count = failed_count
        self._failed_max_age = failed_max_age

    def cleanup(self, records: list[SnapshotRecord], *, now: datetime) -> tuple[Path, ...]:
        root = self._root.resolve(strict=True)
        for record in records:
            try:
                resolved = record.path.resolve(strict=True)
            except OSError as error:
                raise _unsafe_cleanup() from error
            if record.path.is_symlink() or resolved.parent != root:
                raise _unsafe_cleanup()

        successes = sorted(
            (record for record in records if record.status == "success"),
            key=lambda record: record.captured_at,
            reverse=True,
        )
        recent_failures = sorted(
            (
                record
                for record in records
                if record.status != "success" and now - record.captured_at <= self._failed_max_age
            ),
            key=lambda record: record.captured_at,
            reverse=True,
        )
        keep = {
            *(record.path.resolve() for record in successes[: self._successful_count]),
            *(record.path.resolve() for record in recent_failures[: self._failed_count]),
        }
        removed: list[Path] = []
        for record in records:
            if record.path.resolve() in keep:
                continue
            _safe_rmtree(root, record.path)
            removed.append(record.path)
        return tuple(removed)


def _unsafe_cleanup() -> StructuredError:
    return StructuredError(
        code=ErrorCode.SNAPSHOT_CLEANUP_UNSAFE,
        summary="Snapshot retention cannot remove paths outside its configured root.",
        retryable=False,
    )
