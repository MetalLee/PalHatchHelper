from collections import OrderedDict
from pathlib import Path
from typing import Protocol
from uuid import UUID

from pal_hatch_helper.game_catalog.artifacts import (
    CatalogArtifactStore,
    LocalCatalogArtifactStore,
    extract_catalog_bundle_atomic,
)
from pal_hatch_helper.game_catalog.cache import CatalogSQLiteCache
from pal_hatch_helper.game_catalog.models import LoadedGameCatalog
from pal_hatch_helper.game_catalog.paths import CatalogPaths
from pal_hatch_helper.game_catalog.validation import (
    SUPPORTED_SCHEMA_VERSIONS,
    load_catalog_directory,
)
from pal_hatch_helper.generated import GameDataVersion
from pal_hatch_helper.models.errors import ErrorCode, StructuredError


class GameCatalogRepository(Protocol):
    async def load_version(self, version_id: UUID) -> LoadedGameCatalog: ...


class CatalogVersionMetadataStore(Protocol):
    async def get_version(self, version_id: UUID) -> GameDataVersion | None: ...


class CatalogProjectionStore(Protocol):
    async def load_projection(self, version_id: UUID) -> LoadedGameCatalog | None: ...


class InMemoryCatalogMetadataStore:
    def __init__(self, versions: tuple[GameDataVersion, ...] = ()) -> None:
        self._versions = {version.id: version for version in versions}

    async def get_version(self, version_id: UUID) -> GameDataVersion | None:
        return self._versions.get(version_id)

    def put(self, version: GameDataVersion) -> None:
        self._versions[version.id] = version


class LayeredGameCatalogRepository:
    def __init__(
        self,
        *,
        paths: CatalogPaths,
        metadata_store: CatalogVersionMetadataStore,
        artifact_store: CatalogArtifactStore,
        projection_store: CatalogProjectionStore | None = None,
        max_memory_versions: int = 2,
    ) -> None:
        self._paths = paths
        self._metadata_store = metadata_store
        self._artifact_store = artifact_store
        self._projection_store = projection_store
        self._cache = CatalogSQLiteCache(paths.cache)
        self._max_memory_versions = max(1, max_memory_versions)
        self._memory: OrderedDict[UUID, LoadedGameCatalog] = OrderedDict()
        self.last_requested_version_id: UUID | None = None

    @classmethod
    def for_local_testing(cls, data_dir: Path) -> "LayeredGameCatalogRepository":
        paths = CatalogPaths(data_dir)
        paths.ensure()
        return cls(
            paths=paths,
            metadata_store=InMemoryCatalogMetadataStore(),
            artifact_store=LocalCatalogArtifactStore(paths.bundles),
        )

    async def load_version(self, version_id: UUID) -> LoadedGameCatalog:
        self.last_requested_version_id = version_id
        memory_value = self._memory.get(version_id)
        if memory_value is not None:
            self._memory.move_to_end(version_id)
            return memory_value

        metadata = await self._metadata_store.get_version(version_id)
        if metadata is None:
            raise StructuredError(
                code=ErrorCode.GAME_DATA_VERSION_NOT_FOUND,
                summary="The exact requested game data version does not exist.",
                retryable=False,
            )
        if metadata.schema_version not in SUPPORTED_SCHEMA_VERSIONS:
            raise StructuredError(
                code=ErrorCode.GAME_DATA_SCHEMA_UNSUPPORTED,
                summary="The exact requested game data schema is unsupported.",
                retryable=False,
            )

        catalog = self._cache.load(
            version_id,
            expected_content_hash=metadata.content_hash,
            schema_version=metadata.schema_version,
        )
        normalized_path = self._paths.normalized / metadata.content_hash
        if catalog is None and normalized_path.is_dir():
            catalog = load_catalog_directory(normalized_path)
        if catalog is None and await self._artifact_store.exists(metadata.content_hash):
            bundle = await self._artifact_store.get_version_bundle(metadata.content_hash)
            extract_catalog_bundle_atomic(bundle, normalized_path)
            catalog = load_catalog_directory(normalized_path)
        if catalog is None and self._projection_store is not None:
            catalog = await self._projection_store.load_projection(version_id)
        if catalog is None:
            raise StructuredError(
                code=ErrorCode.GAME_DATA_ARTIFACT_MISSING,
                summary="No valid artifact or projection exists for the exact requested version.",
                retryable=False,
            )
        if catalog.content_hash != metadata.content_hash:
            raise StructuredError(
                code=ErrorCode.GAME_DATA_HASH_MISMATCH,
                summary="The requested game data content hash does not match its metadata.",
                retryable=False,
            )
        self._cache.build(version_id, catalog)
        self._remember(version_id, catalog)
        return catalog

    def _remember(self, version_id: UUID, catalog: LoadedGameCatalog) -> None:
        self._memory[version_id] = catalog
        self._memory.move_to_end(version_id)
        while len(self._memory) > self._max_memory_versions:
            self._memory.popitem(last=False)
