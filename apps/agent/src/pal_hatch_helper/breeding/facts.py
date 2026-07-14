from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from pal_hatch_helper.generated import BreedingEngineInventoryPal, CatalogBreedingRecipe

CatalogRuntimeStatus = Literal["extracting", "staging", "validated", "published", "rejected"]


@dataclass(frozen=True, slots=True)
class VersionedBreedingCatalog:
    """Exact immutable catalog facts loaded for one database version UUID."""

    version_id: UUID
    content_hash: str
    status: CatalogRuntimeStatus
    pal_ids: frozenset[str]
    passive_skill_ids: frozenset[str]
    recipes: tuple[CatalogBreedingRecipe, ...]


@dataclass(frozen=True, slots=True)
class FixedInventorySnapshot:
    """Inventory facts tied to one immutable snapshot and world."""

    snapshot_id: UUID
    world_id: UUID
    items: tuple[BreedingEngineInventoryPal, ...]


@dataclass(frozen=True, slots=True)
class BreedingRuntimeFacts:
    catalog: VersionedBreedingCatalog
    inventory: FixedInventorySnapshot
