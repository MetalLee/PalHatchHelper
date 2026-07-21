import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from uuid import UUID

from pal_hatch_helper.generated import CanonicalSnapshot
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.normalization.stable_id import normalize_parser_snapshot_payload
from pal_hatch_helper.normalization.validator import CanonicalSnapshotValidator
from pal_hatch_helper.parsers.adapter import ParserAdapter
from pal_hatch_helper.plans.processor import PublishedSnapshotProcessor
from pal_hatch_helper.repositories.inventory import (
    InventoryFailureRequest,
    InventoryPublishRequest,
    InventoryRepository,
)
from pal_hatch_helper.save_sync.publisher import InventoryDropGuard
from pal_hatch_helper.save_sync.registry import SnapshotRegistry
from pal_hatch_helper.save_sync.snapshot import SnapshotCopier

type SyncStatus = Literal["published", "duplicate"]


@dataclass(frozen=True, slots=True)
class InventorySyncResult:
    status: SyncStatus
    content_hash: str
    snapshot_id: UUID | None
    local_snapshot_path: Path | None


class InventorySyncService:
    def __init__(
        self,
        *,
        world_id: UUID,
        source_root: Path,
        runtime_root: Path,
        copier: SnapshotCopier,
        parser: ParserAdapter,
        validator: CanonicalSnapshotValidator,
        repository: InventoryRepository,
        drop_guard: InventoryDropGuard | None = None,
        registry: SnapshotRegistry | None = None,
        published_snapshot_processor: PublishedSnapshotProcessor | None = None,
    ) -> None:
        self._world_id = world_id
        self._source_root = source_root
        self._runtime_root = runtime_root
        self._copier = copier
        self._parser = parser
        self._validator = validator
        self._repository = repository
        self._drop_guard = drop_guard or InventoryDropGuard()
        self._registry = registry or SnapshotRegistry(copier.snapshot_root)
        self._published_snapshot_processor = published_snapshot_processor

    async def sync_once(self) -> InventorySyncResult:
        latest = await self._repository.latest(self._world_id)
        previous_content_hash = None
        if (
            latest is not None
            and latest.parser_name == self._parser.name
            and latest.parser_version == self._parser.version
        ):
            previous_content_hash = latest.source_save_hash
        outcome = self._copier.create(
            self._source_root,
            self._parser.required_files(),
            previous_content_hash=previous_content_hash,
        )
        if outcome.duplicate:
            if self._published_snapshot_processor is not None and latest is not None:
                await self._published_snapshot_processor.process_snapshot(latest.snapshot_id)
            return InventorySyncResult(
                status="duplicate",
                content_hash=outcome.content_hash,
                snapshot_id=latest.snapshot_id if latest is not None else None,
                local_snapshot_path=None,
            )
        if outcome.path is None:
            raise StructuredError(
                code=ErrorCode.SNAPSHOT_COPY_FAILED,
                summary="Snapshot copy completed without a finalized local path.",
                retryable=False,
            )

        self._registry.record(outcome.path, "pending")
        try:
            compatibility = self._parser.detect_compatibility(outcome.path)
            if not compatibility.compatible:
                raise StructuredError(
                    code=ErrorCode.PARSER_INCOMPATIBLE,
                    summary="ParserAdapter rejected the finalized save snapshot.",
                    retryable=False,
                )
            canonical = self._parse_canonical(outcome.path)
            validated = self._validator.validate(canonical)
            self._drop_guard.ensure_publishable(
                previous_count=latest.pal_count if latest is not None else 0,
                new_count=len(validated.pals),
            )
            snapshot_id = await self._repository.publish(
                InventoryPublishRequest(
                    world_id=self._world_id,
                    source_save_hash=outcome.content_hash,
                    source_modified_at=outcome.source_modified_at,
                    parser_name=self._parser.name,
                    parser_version=self._parser.version,
                    snapshot=validated,
                )
            )
        except StructuredError as error:
            failure_id = await self._repository.record_failure(
                InventoryFailureRequest(
                    world_id=self._world_id,
                    source_save_hash=outcome.content_hash,
                    source_modified_at=outcome.source_modified_at,
                    parser_name=self._parser.name,
                    parser_version=self._parser.version,
                    status=_failure_status(error.code),
                    error_code=error.code,
                    error_summary=error.summary,
                )
            )
            self._registry.record(
                outcome.path,
                "failed",
                error_code=error.code.value,
                snapshot_id=failure_id,
                content_hash=outcome.content_hash,
                source_modified_at=outcome.source_modified_at,
            )
            self._registry.enforce_retention()
            raise

        self._registry.record(
            outcome.path,
            "success",
            snapshot_id=snapshot_id,
            content_hash=outcome.content_hash,
            source_modified_at=outcome.source_modified_at,
        )
        self._registry.enforce_retention()
        if self._published_snapshot_processor is not None:
            await self._published_snapshot_processor.process_snapshot(snapshot_id)
        return InventorySyncResult(
            status="published",
            content_hash=outcome.content_hash,
            snapshot_id=snapshot_id,
            local_snapshot_path=outcome.path,
        )

    async def reparse_snapshot(
        self,
        snapshot_id: UUID,
        *,
        approve_inventory_drop: bool = False,
    ) -> InventorySyncResult:
        record = self._registry.find_snapshot(snapshot_id)
        compatibility = self._parser.detect_compatibility(record.path)
        if not compatibility.compatible:
            raise StructuredError(
                code=ErrorCode.PARSER_INCOMPATIBLE,
                summary="ParserAdapter rejected the existing Agent-owned snapshot.",
                retryable=False,
            )
        canonical = self._parse_canonical(record.path)
        validated = self._validator.validate(canonical)
        latest = await self._repository.latest(self._world_id)
        if not approve_inventory_drop:
            self._drop_guard.ensure_publishable(
                previous_count=latest.pal_count if latest is not None else 0,
                new_count=len(validated.pals),
            )
        assert record.content_hash is not None
        assert record.source_modified_at is not None
        published_id = await self._repository.publish(
            InventoryPublishRequest(
                world_id=self._world_id,
                source_save_hash=record.content_hash,
                source_modified_at=record.source_modified_at,
                parser_name=self._parser.name,
                parser_version=self._parser.version,
                snapshot=validated,
            )
        )
        self._registry.record(
            record.path,
            "success",
            snapshot_id=published_id,
            content_hash=record.content_hash,
            source_modified_at=record.source_modified_at,
        )
        if self._published_snapshot_processor is not None:
            await self._published_snapshot_processor.process_snapshot(published_id)
        return InventorySyncResult(
            status="published",
            content_hash=record.content_hash,
            snapshot_id=published_id,
            local_snapshot_path=record.path,
        )

    def _parse_canonical(self, snapshot_path: Path) -> CanonicalSnapshot:
        self._runtime_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        with tempfile.TemporaryDirectory(prefix="parser-", dir=self._runtime_root) as output_dir:
            output_path = Path(output_dir) / "canonical.json"
            parser_result = self._parser.parse(snapshot_path, output_path)
            return normalize_parser_snapshot_payload(parser_result.payload)


def _failure_status(code: ErrorCode) -> Literal["failed", "rejected"]:
    if code.value.startswith("CANONICAL_") or code in {
        ErrorCode.INVENTORY_DROP_REVIEW_REQUIRED,
        ErrorCode.INVENTORY_SNAPSHOT_STALE,
    }:
        return "rejected"
    return "failed"
