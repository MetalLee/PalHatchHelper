import asyncio
import logging
from typing import cast
from uuid import UUID

from pydantic import ValidationError

from pal_hatch_helper.breeding.adapter import RuntimeScoringProfile
from pal_hatch_helper.breeding.facts import (
    BreedingRuntimeFacts,
    CatalogRuntimeStatus,
    FixedInventorySnapshot,
    VersionedBreedingCatalog,
)
from pal_hatch_helper.game_catalog.gateway import SupabaseCatalogGateway
from pal_hatch_helper.game_catalog.repository import GameCatalogRepository
from pal_hatch_helper.generated import BreedingEngineInventoryPal, OptimizationMode
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.models.jobs import JobClaim
from pal_hatch_helper.repositories.database import DatabaseClient

logger = logging.getLogger(__name__)


class SupabaseBreedingRuntimeRepository:
    def __init__(
        self,
        database: DatabaseClient,
        *,
        catalog_gateway: SupabaseCatalogGateway,
        catalog_repository: GameCatalogRepository,
    ) -> None:
        self._database = database
        self._catalog_gateway = catalog_gateway
        self._catalog_repository = catalog_repository

    async def active_scoring_profiles(self) -> tuple[RuntimeScoringProfile, ...]:
        payload = await self._database.rpc("get_active_scoring_profiles_for_agent", {})
        if not isinstance(payload, list):
            raise _invalid_response()
        profiles: list[RuntimeScoringProfile] = []
        try:
            for value in payload:
                if not isinstance(value, dict):
                    raise ValueError("invalid profile")
                raw_weights = value.get("weights")
                if not isinstance(raw_weights, dict):
                    raise ValueError("invalid weights")
                weights: dict[str, float] = {}
                for key, weight in raw_weights.items():
                    if not isinstance(weight, int | float) or isinstance(weight, bool):
                        raise ValueError("invalid weights")
                    weights[key] = float(weight)
                profiles.append(
                    RuntimeScoringProfile(
                        version=str(value["version"]),
                        optimization_mode=OptimizationMode(str(value["optimization_mode"])),
                        algorithm_version=str(value["algorithm_version"]),
                        weights=weights,
                    )
                )
        except (KeyError, ValueError) as error:
            raise _invalid_response() from error
        return tuple(profiles)

    async def load_facts(self, claim: JobClaim) -> BreedingRuntimeFacts:
        metadata, catalog, inventory_payload = await asyncio.gather(
            self._catalog_gateway.get_version(claim.job.game_data_version_id),
            self._catalog_repository.load_version(claim.job.game_data_version_id),
            self._database.rpc(
                "get_breeding_inventory_for_agent",
                {"p_job_id": str(claim.job.job_id)},
            ),
        )
        if metadata is None or metadata.status != "published":
            raise StructuredError(
                code=ErrorCode.BREEDING_GAME_DATA_NOT_PUBLISHED,
                summary="The claimed job catalog version is not published.",
                retryable=False,
            )
        if catalog.content_hash != metadata.content_hash:
            raise StructuredError(
                code=ErrorCode.BREEDING_GAME_DATA_CONTENT_MISMATCH,
                summary="The exact catalog metadata and loaded facts disagree.",
                retryable=False,
            )
        if metadata.content_hash != claim.job.game_data_content_hash:
            raise StructuredError(
                code=ErrorCode.BREEDING_GAME_DATA_CONTENT_MISMATCH,
                summary="The claimed job content hash does not match catalog metadata.",
                retryable=False,
            )
        catalog_pal_ids = frozenset(item.pal_id for item in catalog.pals)
        inventory = _inventory_snapshot(inventory_payload, catalog_pal_ids)
        return BreedingRuntimeFacts(
            catalog=VersionedBreedingCatalog(
                version_id=metadata.id,
                content_hash=metadata.content_hash,
                status=cast(CatalogRuntimeStatus, metadata.status),
                pal_ids=catalog_pal_ids,
                passive_skill_ids=frozenset(
                    item.passive_skill_id for item in catalog.passive_skills
                ),
                recipes=catalog.breeding_recipes,
            ),
            inventory=inventory,
        )


def _inventory_snapshot(
    payload: object,
    catalog_pal_ids: frozenset[str],
) -> FixedInventorySnapshot:
    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
        raise _invalid_response()
    try:
        items: list[BreedingEngineInventoryPal] = []
        normalized_count = 0
        filtered_count = 0
        for value in payload["items"]:
            item = BreedingEngineInventoryPal.model_validate(value)
            if item.pal_id in catalog_pal_ids:
                items.append(item)
                continue
            if item.pal_id.startswith("boss_") and item.pal_id[5:] in catalog_pal_ids:
                items.append(item.model_copy(update={"pal_id": item.pal_id[5:]}))
                normalized_count += 1
                continue
            filtered_count += 1
        if normalized_count:
            logger.warning(
                "breeding_inventory_species_normalized",
                extra={
                    "event": "breeding_inventory_species_normalized",
                    "normalized_count": normalized_count,
                },
            )
        if filtered_count:
            logger.warning(
                "breeding_inventory_species_filtered",
                extra={
                    "event": "breeding_inventory_species_filtered",
                    "filtered_count": filtered_count,
                },
            )
        return FixedInventorySnapshot(
            snapshot_id=UUID(str(payload["snapshot_id"])),
            world_id=UUID(str(payload["world_id"])),
            items=tuple(items),
        )
    except (KeyError, ValueError, ValidationError) as error:
        raise _invalid_response() from error


def _invalid_response() -> StructuredError:
    return StructuredError(
        code=ErrorCode.DATABASE_RESPONSE_INVALID,
        summary="Supabase returned invalid breeding runtime facts.",
        retryable=False,
    )
