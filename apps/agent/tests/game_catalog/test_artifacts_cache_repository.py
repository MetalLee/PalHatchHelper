import asyncio
from pathlib import Path
from uuid import UUID

import pytest

from pal_hatch_helper.game_catalog.artifacts import LocalCatalogArtifactStore
from pal_hatch_helper.game_catalog.cache import CatalogSQLiteCache
from pal_hatch_helper.game_catalog.repository import LayeredGameCatalogRepository
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

VERSION_ID = UUID("71000000-0000-4000-8000-000000000001")


def test_local_artifact_store_round_trips_bytes_atomically(tmp_path: Path) -> None:
    async def scenario() -> None:
        store = LocalCatalogArtifactStore(tmp_path)
        await store.put_version_bundle("a" * 64, b"fixture-bundle")

        assert await store.exists("a" * 64)
        assert await store.get_version_bundle("a" * 64) == b"fixture-bundle"

    asyncio.run(scenario())


def test_sqlite_cache_discards_corruption_instead_of_serving_it(tmp_path: Path) -> None:
    cache = CatalogSQLiteCache(tmp_path)
    path = cache.path_for(VERSION_ID)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"not sqlite")

    assert cache.load(VERSION_ID, expected_content_hash="a" * 64, schema_version="1.0.0") is None
    assert not path.exists()


def test_exact_version_load_never_falls_back_to_another_version(tmp_path: Path) -> None:
    async def scenario() -> None:
        repository = LayeredGameCatalogRepository.for_local_testing(tmp_path)

        with pytest.raises(StructuredError) as caught:
            await repository.load_version(VERSION_ID)

        assert caught.value.code is ErrorCode.GAME_DATA_VERSION_NOT_FOUND
        assert repository.last_requested_version_id == VERSION_ID

    asyncio.run(scenario())
