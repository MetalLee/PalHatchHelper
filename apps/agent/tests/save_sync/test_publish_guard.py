from collections.abc import Mapping
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from uuid import UUID

import pytest

from pal_hatch_helper.generated import CanonicalSnapshot
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.normalization.validator import CanonicalSnapshotValidator
from pal_hatch_helper.parsers.adapter import CompatibilityResult, ParserResult
from pal_hatch_helper.repositories.database import JSONValue
from pal_hatch_helper.repositories.inventory import (
    InventoryFailureRequest,
    InventoryPublishRequest,
    LatestInventorySnapshot,
    SupabaseInventoryRepository,
)
from pal_hatch_helper.save_sync.publisher import InventoryDropGuard
from pal_hatch_helper.save_sync.service import InventorySyncService
from pal_hatch_helper.save_sync.snapshot import SnapshotCopier
from tests.normalization.test_canonical_snapshot import canonical_payload

WORLD_ID = UUID("10000000-0000-4000-8000-000000000001")
SNAPSHOT_ID = UUID("40000000-0000-4000-8000-000000000004")


def _validated_snapshot() -> object:
    payload = canonical_payload()
    pals = payload["pals"]
    assert isinstance(pals, list) and isinstance(pals[0], dict)
    pals[0]["pal_id"] = "lamball"
    pals[0]["passive_skill_ids"] = ["artisan"]
    pals[0]["metadata"] = {
        "source_internal_name": "Lamball",
        "source_passive_skill_internal_names": ["Artisan"],
    }
    return CanonicalSnapshotValidator(
        expected_world_uid="fixture-world-001",
        known_pal_ids={"lamball"},
        known_passive_skill_ids={"artisan"},
    ).validate(CanonicalSnapshot.model_validate(payload))


def test_inventory_drop_below_half_and_over_fifty_is_rejected() -> None:
    with pytest.raises(StructuredError) as caught:
        InventoryDropGuard().ensure_publishable(previous_count=120, new_count=59)

    assert caught.value.code is ErrorCode.INVENTORY_DROP_REVIEW_REQUIRED
    InventoryDropGuard().ensure_publishable(previous_count=120, new_count=60)
    InventoryDropGuard().ensure_publishable(previous_count=99, new_count=49)


class StubDatabase:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, JSONValue]]] = []

    async def rpc(self, function_name: str, parameters: Mapping[str, JSONValue]) -> JSONValue:
        self.calls.append((function_name, dict(parameters)))
        if function_name == "get_latest_inventory_snapshot_for_agent":
            return {
                "snapshot_id": str(SNAPSHOT_ID),
                "source_save_hash": "a" * 64,
                "pal_count": 1,
            }
        if function_name == "get_inventory_catalog_ids_for_agent":
            return {"pal_ids": ["lamball"], "passive_skill_ids": ["artisan"]}
        if function_name == "publish_inventory_snapshot":
            return str(SNAPSHOT_ID)
        if function_name == "record_inventory_snapshot_failure":
            return str(SNAPSHOT_ID)
        raise AssertionError(function_name)

    async def close(self) -> None:
        return None


def test_repository_writes_only_normalized_payload_via_atomic_rpc() -> None:
    async def scenario() -> None:
        database = StubDatabase()
        repository = SupabaseInventoryRepository(database)
        latest = await repository.latest(WORLD_ID)
        assert latest is not None and latest.pal_count == 1
        catalog = await repository.catalog_ids(WORLD_ID)
        assert catalog.pal_ids == {"lamball"}
        assert catalog.passive_skill_ids == {"artisan"}
        request = InventoryPublishRequest(
            world_id=WORLD_ID,
            source_save_hash="b" * 64,
            source_modified_at=datetime(2026, 7, 14, 3, tzinfo=UTC),
            parser_name="fixture-parser",
            parser_version="1.0.0",
            snapshot=_validated_snapshot(),  # type: ignore[arg-type]
        )

        published_id = await repository.publish(request)

        assert published_id == SNAPSHOT_ID
        name, parameters = database.calls[-1]
        assert name == "publish_inventory_snapshot"
        assert parameters["p_world_id"] == str(WORLD_ID)
        payload = parameters["p_snapshot"]
        assert isinstance(payload, dict)
        assert "source_path" not in payload
        assert "raw_save" not in payload
        assert payload["source_save_hash"] == "b" * 64

        failed_id = await repository.record_failure(
            InventoryFailureRequest(
                world_id=WORLD_ID,
                source_save_hash="e" * 64,
                source_modified_at=datetime(2026, 7, 14, 4, tzinfo=UTC),
                parser_name="fixture-parser",
                parser_version="1.0.0",
                status="failed",
                error_code=ErrorCode.PARSER_OUTPUT_INVALID,
                error_summary="Fixture parser output was invalid.",
            )
        )

        assert failed_id == SNAPSHOT_ID
        name, parameters = database.calls[-1]
        assert name == "record_inventory_snapshot_failure"
        failure = parameters["p_failure"]
        assert isinstance(failure, dict)
        assert failure["status"] == "failed"
        assert failure["error_code"] == "PARSER_OUTPUT_INVALID"
        assert "source_path" not in failure

    import asyncio

    asyncio.run(scenario())


class FakeParser:
    name = "fixture-parser"
    version = "1.0.0"

    def __init__(
        self,
        payload: dict[str, object] | None = None,
        error: StructuredError | None = None,
    ) -> None:
        self.payload = payload or canonical_payload()
        self.error = error
        self.parse_calls = 0

    def required_files(self) -> tuple[PurePosixPath, ...]:
        return (PurePosixPath("World.sav"),)

    def detect_compatibility(self, snapshot_path: Path) -> CompatibilityResult:
        return CompatibilityResult(compatible=True, reason_code=None)

    def parse(self, snapshot_path: Path, output_path: Path) -> ParserResult:
        self.parse_calls += 1
        if self.error is not None:
            raise self.error
        return ParserResult(output_path=output_path, payload=self.payload)


class FakeInventoryRepository:
    def __init__(self, latest: LatestInventorySnapshot | None = None) -> None:
        self.latest_value = latest
        self.publish_requests: list[InventoryPublishRequest] = []
        self.failure_requests: list[InventoryFailureRequest] = []

    async def latest(self, world_id: UUID) -> LatestInventorySnapshot | None:
        return self.latest_value

    async def publish(self, request: InventoryPublishRequest) -> UUID:
        self.publish_requests.append(request)
        return SNAPSHOT_ID

    async def record_failure(self, request: InventoryFailureRequest) -> UUID:
        self.failure_requests.append(request)
        return SNAPSHOT_ID


def _source(tmp_path: Path) -> Path:
    source = tmp_path / "source"
    source.mkdir()
    (source / "World.sav").write_bytes(b"redacted")
    return source


def _service(
    tmp_path: Path,
    parser: FakeParser,
    repository: FakeInventoryRepository,
) -> InventorySyncService:
    return InventorySyncService(
        world_id=WORLD_ID,
        source_root=_source(tmp_path),
        runtime_root=tmp_path / "runtime",
        copier=SnapshotCopier(
            snapshot_root=tmp_path / "snapshots",
            stability_delay_seconds=0,
        ),
        parser=parser,
        validator=CanonicalSnapshotValidator(
            expected_world_uid="fixture-world-001",
            known_pal_ids={"lamball"},
            known_passive_skill_ids={"artisan"},
        ),
        repository=repository,
    )


def test_parser_failure_never_replaces_previous_valid_inventory(tmp_path: Path) -> None:
    async def scenario() -> None:
        previous = LatestInventorySnapshot(SNAPSHOT_ID, "a" * 64, 1)
        repository = FakeInventoryRepository(previous)
        parser = FakeParser(
            error=StructuredError(
                code=ErrorCode.PARSER_OUTPUT_INVALID,
                summary="fixture invalid output",
                retryable=False,
            )
        )

        with pytest.raises(StructuredError):
            await _service(tmp_path, parser, repository).sync_once()

        assert repository.publish_requests == []
        assert len(repository.failure_requests) == 1
        failure = repository.failure_requests[0]
        assert failure.error_code is ErrorCode.PARSER_OUTPUT_INVALID
        assert failure.status == "failed"
        assert repository.latest_value == previous

    import asyncio

    asyncio.run(scenario())


def test_successful_canonical_snapshot_is_published_once(tmp_path: Path) -> None:
    async def scenario() -> None:
        repository = FakeInventoryRepository()
        parser = FakeParser()

        result = await _service(tmp_path, parser, repository).sync_once()

        assert result.status == "published"
        assert result.snapshot_id == SNAPSHOT_ID
        assert parser.parse_calls == 1
        assert len(repository.publish_requests) == 1

    import asyncio

    asyncio.run(scenario())


def test_inventory_guard_rejects_before_repository_publish(tmp_path: Path) -> None:
    async def scenario() -> None:
        previous = LatestInventorySnapshot(SNAPSHOT_ID, "a" * 64, 120)
        repository = FakeInventoryRepository(previous)
        payload = canonical_payload()
        pals = payload["pals"]
        assert isinstance(pals, list)
        template = deepcopy(pals[0])
        assert isinstance(template, dict)
        pals.clear()
        for index in range(59):
            pal = deepcopy(template)
            pal["instance_uid"] = f"fixture-pal-{index:03d}"
            pals.append(pal)

        with pytest.raises(StructuredError) as caught:
            await _service(tmp_path, FakeParser(payload), repository).sync_once()

        assert caught.value.code is ErrorCode.INVENTORY_DROP_REVIEW_REQUIRED
        assert repository.publish_requests == []
        assert len(repository.failure_requests) == 1
        assert repository.failure_requests[0].status == "rejected"

    import asyncio

    asyncio.run(scenario())
