from dataclasses import dataclass

from pal_hatch_helper.generated import (
    CatalogActiveSkill,
    CatalogBreedingRecipe,
    CatalogItem,
    CatalogItemRecipe,
    CatalogLocalization,
    CatalogPal,
    CatalogPalActiveSkill,
    CatalogPartnerSkill,
    CatalogPassiveSkill,
    GameCatalogManifest,
)


@dataclass(frozen=True, slots=True)
class LoadedGameCatalog:
    """Validated immutable runtime view backed by generated contract models."""

    manifest: GameCatalogManifest
    pals: tuple[CatalogPal, ...]
    passive_skills: tuple[CatalogPassiveSkill, ...]
    active_skills: tuple[CatalogActiveSkill, ...]
    pal_active_skills: tuple[CatalogPalActiveSkill, ...]
    partner_skills: tuple[CatalogPartnerSkill, ...]
    breeding_recipes: tuple[CatalogBreedingRecipe, ...]
    localizations: tuple[CatalogLocalization, ...]
    items: tuple[CatalogItem, ...] = ()
    item_recipes: tuple[CatalogItemRecipe, ...] = ()

    @property
    def content_hash(self) -> str:
        return self.manifest.content_hash

    @property
    def schema_version(self) -> str:
        return self.manifest.schema_version
