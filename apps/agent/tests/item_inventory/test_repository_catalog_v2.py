import asyncio
from collections.abc import Mapping
from uuid import UUID

import pytest

from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.repositories.database import JSONValue
from pal_hatch_helper.repositories.inventory import SupabaseInventoryRepository

WORLD_ID = UUID("10000000-0000-4000-8000-000000000001")
VERSION_ID = UUID("71000000-0000-4000-8000-000000000001")


class CatalogDatabase:
    def __init__(self, payload: JSONValue) -> None:
        self.payload = payload

    async def rpc(
        self,
        function_name: str,
        parameters: Mapping[str, JSONValue],
    ) -> JSONValue:
        assert function_name == "get_inventory_catalog_ids_for_agent"
        assert parameters == {"p_world_id": str(WORLD_ID)}
        return self.payload

    async def close(self) -> None:
        return None


def catalog_payload() -> dict[str, JSONValue]:
    return {
        "game_data_version_id": str(VERSION_ID),
        "pal_ids": ["lamball"],
        "passive_skill_ids": ["artisan"],
        "item_ids": ["ingot", "nail"],
        "item_aliases": {"old_ingot": "ingot"},
        "item_recipes": [
            {
                "recipe_id": "recipe.nail",
                "product_item_id": "nail",
                "product_count": 5,
                "ingredients": [{"slot": 1, "item_id": "ingot", "count": 2}],
                "craft_kind": "handcraft",
                "work_amount": 1,
                "workable_attribute": 1,
                "energy_type": None,
                "energy_amount": 0,
                "unlock_item_id": None,
                "deny_recipe_chain": [],
                "metadata": {},
            }
        ],
    }


def test_repository_parses_versioned_items_aliases_and_recipes() -> None:
    async def scenario() -> None:
        result = await SupabaseInventoryRepository(CatalogDatabase(catalog_payload())).catalog_ids(
            WORLD_ID
        )

        assert result.game_data_version_id == VERSION_ID
        assert result.item_ids == {"ingot", "nail"}
        assert result.item_aliases == {"old_ingot": "ingot"}
        assert result.item_recipes[0].recipe_id == "recipe.nail"
        assert result.item_recipes[0].ingredients[0].item_id == "ingot"

    asyncio.run(scenario())


def test_repository_rejects_non_string_aliases() -> None:
    payload = catalog_payload()
    payload["item_aliases"] = {"old_ingot": 7}

    async def scenario() -> None:
        with pytest.raises(StructuredError) as caught:
            await SupabaseInventoryRepository(CatalogDatabase(payload)).catalog_ids(WORLD_ID)
        assert caught.value.code is ErrorCode.DATABASE_RESPONSE_INVALID

    asyncio.run(scenario())
