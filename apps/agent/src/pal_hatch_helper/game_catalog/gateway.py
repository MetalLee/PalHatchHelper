from collections.abc import Mapping
from typing import Protocol, TypeGuard
from uuid import UUID

from pydantic import BaseModel, ValidationError

from pal_hatch_helper.game_catalog.models import LoadedGameCatalog
from pal_hatch_helper.generated import (
    BreedingDataDiffReport,
    CatalogActiveSkill,
    CatalogBreedingRecipe,
    CatalogLocalization,
    CatalogPal,
    CatalogPalActiveSkill,
    CatalogPartnerSkill,
    CatalogPassiveSkill,
    GameCatalogManifest,
    GameDataSource,
    GameDataVersion,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.repositories.database import DatabaseClient, JSONValue


class CatalogImportGateway(Protocol):
    async def begin_import(
        self,
        *,
        source_id: UUID | None,
        manifest: GameCatalogManifest,
        artifact_bucket: str,
        artifact_path: str,
    ) -> tuple[UUID, UUID]: ...

    async def stage_batch(
        self,
        *,
        import_run_id: UUID,
        entity_type: str,
        idempotency_key: str,
        records: list[dict[str, JSONValue]],
    ) -> None: ...

    async def finalize_import(self, import_run_id: UUID) -> UUID: ...


class SupabaseCatalogGateway:
    def __init__(self, database: DatabaseClient) -> None:
        self._database = database

    async def begin_import(
        self,
        *,
        source_id: UUID | None,
        manifest: GameCatalogManifest,
        artifact_bucket: str,
        artifact_path: str,
    ) -> tuple[UUID, UUID]:
        payload = await self._database.rpc(
            "begin_game_data_import",
            {
                "p_source_id": str(source_id) if source_id is not None else None,
                "p_manifest": _json_mapping(manifest.model_dump(mode="json")),
                "p_artifact_bucket": artifact_bucket,
                "p_artifact_path": artifact_path,
            },
        )
        row = _single_row(payload)
        try:
            return UUID(_string(row, "version_id")), UUID(_string(row, "import_run_id"))
        except (ValueError, KeyError) as error:
            raise _invalid_response() from error

    async def stage_batch(
        self,
        *,
        import_run_id: UUID,
        entity_type: str,
        idempotency_key: str,
        records: list[dict[str, JSONValue]],
    ) -> None:
        records_value: list[JSONValue] = [record for record in records]
        await self._database.rpc(
            "stage_catalog_batch",
            {
                "p_import_run_id": str(import_run_id),
                "p_entity_type": entity_type,
                "p_idempotency_key": idempotency_key,
                "p_records": records_value,
            },
        )

    async def finalize_import(self, import_run_id: UUID) -> UUID:
        payload = await self._database.rpc(
            "finalize_catalog_import", {"p_import_run_id": str(import_run_id)}
        )
        if not isinstance(payload, str):
            raise _invalid_response()
        try:
            return UUID(payload)
        except ValueError as error:
            raise _invalid_response() from error

    async def publish(self, world_id: UUID, version_id: UUID) -> UUID:
        return await self._version_rpc("publish_game_data_version", world_id, version_id)

    async def rollback(self, world_id: UUID, version_id: UUID) -> UUID:
        return await self._version_rpc("rollback_game_data_version", world_id, version_id)

    async def breeding_diff(
        self,
        from_version_id: UUID,
        to_version_id: UUID,
    ) -> BreedingDataDiffReport:
        payload = await self._database.rpc(
            "get_breeding_data_diff",
            {
                "p_from_version_id": str(from_version_id),
                "p_to_version_id": str(to_version_id),
            },
        )
        try:
            return BreedingDataDiffReport.model_validate(payload)
        except ValidationError as error:
            raise _invalid_response() from error

    async def get_version(self, version_id: UUID) -> GameDataVersion | None:
        payload = await self._database.rpc(
            "get_game_data_version_for_agent", {"p_version_id": str(version_id)}
        )
        if payload == [] or payload is None:
            return None
        row = _single_row(payload)
        try:
            return GameDataVersion.model_validate(row)
        except ValidationError as error:
            raise _invalid_response() from error

    async def get_source(self, source_id: UUID) -> GameDataSource | None:
        payload = await self._database.rpc(
            "get_game_data_source_for_agent",
            {"p_source_id": str(source_id)},
        )
        if payload == [] or payload is None:
            return None
        row = _single_row(payload)
        try:
            return GameDataSource.model_validate(row)
        except ValidationError as error:
            raise _invalid_response() from error

    async def load_projection(self, version_id: UUID) -> LoadedGameCatalog | None:
        payload = await self._database.rpc(
            "load_game_catalog_projection", {"p_version_id": str(version_id)}
        )
        if payload is None:
            return None
        if not isinstance(payload, dict):
            raise _invalid_response()
        try:
            manifest = GameCatalogManifest.model_validate(payload["manifest"])
            return LoadedGameCatalog(
                manifest=manifest,
                pals=_models(payload, "pals", CatalogPal),
                passive_skills=_models(payload, "passive_skills", CatalogPassiveSkill),
                active_skills=_models(payload, "active_skills", CatalogActiveSkill),
                pal_active_skills=_models(payload, "pal_active_skills", CatalogPalActiveSkill),
                partner_skills=_models(payload, "partner_skills", CatalogPartnerSkill),
                breeding_recipes=_models(payload, "breeding_recipes", CatalogBreedingRecipe),
                localizations=_models(payload, "localizations", CatalogLocalization),
            )
        except (KeyError, ValidationError, TypeError) as error:
            raise _invalid_response() from error

    async def _version_rpc(self, name: str, world_id: UUID, version_id: UUID) -> UUID:
        payload = await self._database.rpc(
            name,
            {"p_world_id": str(world_id), "p_version_id": str(version_id)},
        )
        if not isinstance(payload, str):
            raise _invalid_response()
        try:
            return UUID(payload)
        except ValueError as error:
            raise _invalid_response() from error


def _models[T: BaseModel](payload: dict[str, JSONValue], key: str, model: type[T]) -> tuple[T, ...]:
    values = payload[key]
    if not isinstance(values, list):
        raise TypeError(key)
    return tuple(model.model_validate(item) for item in values)


def _single_row(payload: JSONValue) -> dict[str, JSONValue]:
    if isinstance(payload, list) and len(payload) == 1 and isinstance(payload[0], dict):
        return payload[0]
    if isinstance(payload, dict):
        return payload
    raise _invalid_response()


def _string(row: Mapping[str, JSONValue], key: str) -> str:
    value = row[key]
    if not isinstance(value, str):
        raise KeyError(key)
    return value


def _json_mapping(value: object) -> dict[str, JSONValue]:
    if not isinstance(value, dict) or not _is_json_mapping(value):
        raise TypeError("expected JSON mapping")
    return value


def _is_json_mapping(value: object) -> TypeGuard[dict[str, JSONValue]]:
    return isinstance(value, dict) and all(isinstance(key, str) for key in value)


def _invalid_response() -> StructuredError:
    return StructuredError(
        code=ErrorCode.DATABASE_RESPONSE_INVALID,
        summary="Supabase returned an invalid game catalog response.",
        retryable=False,
    )
