import asyncio
from collections.abc import Mapping
from uuid import UUID

from pal_hatch_helper.game_catalog.gateway import SupabaseCatalogGateway
from pal_hatch_helper.repositories.database import JSONValue

FROM_VERSION_ID = UUID("73000000-0000-4000-8000-000000000001")
TO_VERSION_ID = UUID("73000000-0000-4000-8000-000000000002")


class DiffDatabaseClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Mapping[str, JSONValue]]] = []

    async def rpc(
        self,
        function_name: str,
        parameters: Mapping[str, JSONValue],
    ) -> JSONValue:
        self.calls.append((function_name, parameters))
        return {
            "schema_version": "1.0.0",
            "from_content_hash": "a" * 64,
            "to_content_hash": "b" * 64,
            "added": [],
            "removed": [],
            "changed": [],
            "counts": {"added": 0, "removed": 0, "changed": 0, "unchanged": 3},
        }

    async def close(self) -> None:
        return None


def test_gateway_reads_a_typed_breeding_diff_without_changing_versions() -> None:
    async def scenario() -> None:
        database = DiffDatabaseClient()
        gateway = SupabaseCatalogGateway(database)

        report = await gateway.breeding_diff(FROM_VERSION_ID, TO_VERSION_ID)

        assert report.counts.unchanged == 3
        assert database.calls == [
            (
                "get_breeding_data_diff",
                {
                    "p_from_version_id": str(FROM_VERSION_ID),
                    "p_to_version_id": str(TO_VERSION_ID),
                },
            )
        ]

    asyncio.run(scenario())
