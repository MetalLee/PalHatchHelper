import json
import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.save_sync.retention import (
    SnapshotRecord,
    SnapshotRetention,
    SnapshotStatus,
)


class SnapshotRegistry:
    """Stores mutable lifecycle metadata outside immutable raw snapshot directories."""

    def __init__(self, snapshot_root: Path, *, successful_count: int = 3) -> None:
        self._snapshot_root = snapshot_root
        self._state_root = snapshot_root / ".state"
        self._successful_count = successful_count

    def record(
        self,
        snapshot_path: Path,
        status: SnapshotStatus,
        *,
        error_code: str | None = None,
        captured_at: datetime | None = None,
        snapshot_id: UUID | None = None,
        content_hash: str | None = None,
        source_modified_at: datetime | None = None,
    ) -> None:
        snapshot = self._validate_snapshot_path(snapshot_path)
        self._state_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        state_path = self._state_root / f"{snapshot.name}.json"
        temporary = self._state_root / f".tmp-{uuid4()}"
        payload = {
            "snapshot_name": snapshot.name,
            "status": status,
            "captured_at": (captured_at or datetime.now(UTC)).isoformat(),
            "error_code": error_code,
            "snapshot_id": str(snapshot_id) if snapshot_id is not None else None,
            "content_hash": content_hash,
            "source_modified_at": (
                source_modified_at.isoformat() if source_modified_at is not None else None
            ),
        }
        descriptor = os.open(
            temporary,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC,
            0o600,
        )
        try:
            data = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
            remaining = memoryview(data)
            while remaining:
                remaining = remaining[os.write(descriptor, remaining) :]
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        temporary.replace(state_path)

    def records(self) -> list[SnapshotRecord]:
        if not self._state_root.exists():
            return []
        records: list[SnapshotRecord] = []
        for state_path in sorted(self._state_root.glob("*.json")):
            try:
                payload = json.loads(state_path.read_text(encoding="utf-8"))
                name = payload["snapshot_name"]
                status = payload["status"]
                captured_at = datetime.fromisoformat(payload["captured_at"])
                raw_snapshot_id = payload.get("snapshot_id")
                snapshot_id = UUID(raw_snapshot_id) if raw_snapshot_id is not None else None
                content_hash = payload.get("content_hash")
                raw_source_modified_at = payload.get("source_modified_at")
                source_modified_at = (
                    datetime.fromisoformat(raw_source_modified_at)
                    if raw_source_modified_at is not None
                    else None
                )
            except (OSError, ValueError, KeyError, TypeError) as error:
                raise _unsafe_registry() from error
            if (
                not isinstance(name, str)
                or Path(name).name != name
                or status not in {"pending", "success", "failed"}
                or captured_at.tzinfo is None
                or (content_hash is not None and not _valid_content_hash(content_hash))
                or (source_modified_at is not None and source_modified_at.tzinfo is None)
            ):
                raise _unsafe_registry()
            records.append(
                SnapshotRecord(
                    path=self._snapshot_root / name,
                    status=status,
                    captured_at=captured_at,
                    snapshot_id=snapshot_id,
                    content_hash=content_hash,
                    source_modified_at=source_modified_at,
                )
            )
        return records

    def find_snapshot(self, snapshot_id: UUID) -> SnapshotRecord:
        matches = [record for record in self.records() if record.snapshot_id == snapshot_id]
        if len(matches) != 1:
            raise StructuredError(
                code=ErrorCode.AGENT_COMMAND_ACTION_FAILED,
                summary="The requested database snapshot has no unique Agent-owned local copy.",
                retryable=False,
            )
        record = matches[0]
        if record.content_hash is None or record.source_modified_at is None:
            raise StructuredError(
                code=ErrorCode.AGENT_COMMAND_ACTION_FAILED,
                summary="The Agent-owned local snapshot lacks safe reparse metadata.",
                retryable=False,
            )
        return record

    def enforce_retention(self, *, now: datetime | None = None) -> tuple[Path, ...]:
        removed = SnapshotRetention(
            self._snapshot_root,
            successful_count=self._successful_count,
        ).cleanup(
            self.records(),
            now=now or datetime.now(UTC),
        )
        for path in removed:
            (self._state_root / f"{path.name}.json").unlink(missing_ok=True)
        return removed

    def _validate_snapshot_path(self, snapshot_path: Path) -> Path:
        root = self._snapshot_root.resolve(strict=True)
        snapshot = snapshot_path.resolve(strict=True)
        if snapshot_path.is_symlink() or snapshot.parent != root:
            raise _unsafe_registry()
        return snapshot


def _unsafe_registry() -> StructuredError:
    return StructuredError(
        code=ErrorCode.SNAPSHOT_CLEANUP_UNSAFE,
        summary="Snapshot lifecycle metadata points outside the configured root.",
        retryable=False,
    )


def _valid_content_hash(value: object) -> bool:
    return (
        isinstance(value, str)
        and 32 <= len(value) <= 128
        and all(character in "0123456789abcdef" for character in value)
    )
