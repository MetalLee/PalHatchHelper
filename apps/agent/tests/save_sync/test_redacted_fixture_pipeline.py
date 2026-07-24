from __future__ import annotations

import asyncio
import stat
import sys
from collections.abc import Mapping
from pathlib import Path, PurePosixPath
from uuid import UUID

from pal_hatch_helper.normalization.validator import CanonicalSnapshotValidator
from pal_hatch_helper.parsers.subprocess import SubprocessParserAdapter
from pal_hatch_helper.repositories.database import JSONValue
from pal_hatch_helper.repositories.inventory import SupabaseInventoryRepository
from pal_hatch_helper.save_sync.service import InventorySyncService
from pal_hatch_helper.save_sync.snapshot import SnapshotCopier

FIXTURE_ROOT = Path(__file__).parents[4] / "data" / "parser-fixtures" / "minimal-save"
PARSER_COMMAND = Path(__file__).parents[1] / "parsers" / "redacted_fixture_command.py"
WORLD_ID = UUID("10000000-0000-4000-8000-000000000001")
SNAPSHOT_ID = UUID("40000000-0000-4000-8000-000000000004")


class CapturingDatabase:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, JSONValue]]] = []

    async def rpc(self, function_name: str, parameters: Mapping[str, JSONValue]) -> JSONValue:
        self.calls.append((function_name, dict(parameters)))
        if function_name == "get_latest_inventory_snapshot_for_agent":
            return None
        if function_name == "publish_inventory_snapshot":
            return str(SNAPSHOT_ID)
        if function_name == "record_inventory_snapshot_failure":
            return str(SNAPSHOT_ID)
        raise AssertionError(function_name)

    async def close(self) -> None:
        return None


def _source_evidence() -> dict[str, tuple[bytes, int]]:
    return {
        path.relative_to(FIXTURE_ROOT).as_posix(): (
            path.read_bytes(),
            stat.S_IMODE(path.stat().st_mode),
        )
        for path in sorted(FIXTURE_ROOT.rglob("*"))
        if path.is_file()
    }


def test_redacted_fixture_reaches_repository_through_the_sandboxed_parser(
    tmp_path: Path,
) -> None:
    async def scenario() -> None:
        before = _source_evidence()
        database = CapturingDatabase()
        parser = SubprocessParserAdapter(
            name="redacted-fixture-parser",
            version="1.0.0",
            command=(
                sys.executable,
                str(PARSER_COMMAND),
                "{snapshot_path}",
                "{output_path}",
            ),
            declared_files=(
                PurePosixPath("World.sav"),
                PurePosixPath("Players/0001.sav"),
            ),
            timeout_seconds=5,
            memory_limit_bytes=256 * 1024 * 1024,
            cpu_limit_seconds=2,
            runtime_read_paths=(PARSER_COMMAND,),
        )
        service = InventorySyncService(
            world_id=WORLD_ID,
            source_root=FIXTURE_ROOT,
            runtime_root=tmp_path / "runtime",
            copier=SnapshotCopier(
                snapshot_root=tmp_path / "snapshots",
                stability_delay_seconds=0,
                disk_reserve_bytes=0,
            ),
            parser=parser,
            validator=CanonicalSnapshotValidator(
                expected_world_uid="fixture-world-001",
                known_pal_ids={"lamball"},
                known_passive_skill_ids={"artisan"},
            ),
            repository=SupabaseInventoryRepository(database),
        )

        result = await service.sync_once()

        assert result.status == "published"
        assert result.snapshot_id == SNAPSHOT_ID
        assert _source_evidence() == before
        function_name, parameters = database.calls[-1]
        assert function_name == "publish_inventory_snapshot"
        payload = parameters["p_snapshot"]
        assert isinstance(payload, dict)
        assert payload["server"] == {
            "world_uid": "fixture-world-001",
            "save_version": "fixture-v1",
            "captured_at": "2026-07-14T03:00:00Z",
        }
        assert payload["guilds"] == [{"guild_uid": "fixture-guild-001", "name": "Fixture Guild"}]
        assert payload["players"] == [
            {
                "player_uid": "fixture-player-001",
                "nickname": "Redacted Player",
                "level": 20,
                "guild_uid": "fixture-guild-001",
            }
        ]
        pals = payload["pals"]
        assert isinstance(pals, list)
        assert pals == [
            {
                "instance_uid": "fixture-pal-instance-001",
                "owner_player_uid": "fixture-player-001",
                "guild_uid": "fixture-guild-001",
                "pal_id": "lamball",
                "is_boss": False,
                "gender": "female",
                "level": 12,
                "passive_skill_ids": ["artisan"],
                "location_type": "base",
                "location_name": "Fixture Base",
                "location_id": "fixture-base-001",
                "location_slot_index": 7,
                "location_access_scope": "guild",
                "ownership_scope": "player",
                "owner_resolved": True,
                "guild_resolved": True,
                "shared_eligible": True,
                "warning_codes": [],
                "metadata": {
                    "source_internal_name": "Lamball",
                    "source_passive_skill_internal_names": ["Artisan"],
                },
            }
        ]

    asyncio.run(scenario())
