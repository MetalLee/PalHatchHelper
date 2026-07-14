import asyncio

import pytest

from pal_hatch_helper.breeding.adapter import (
    BreedingEngineAdapter,
    RuntimeScoringProfile,
)
from pal_hatch_helper.breeding.engine import ALGORITHM_VERSION
from pal_hatch_helper.breeding.facts import (
    BreedingRuntimeFacts,
    FixedInventorySnapshot,
    VersionedBreedingCatalog,
)
from pal_hatch_helper.breeding.scoring import (
    COMPONENT_ORDER,
    PROFILE_VERSIONS,
    PROFILE_WEIGHTS_BASIS_POINTS,
)
from pal_hatch_helper.generated import OptimizationMode
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.models.jobs import JobClaim
from tests.helpers import make_job_claim

from .factories import inventory_pal, recipe


def _profiles() -> tuple[RuntimeScoringProfile, ...]:
    return tuple(
        RuntimeScoringProfile(
            version=PROFILE_VERSIONS[mode],
            optimization_mode=mode,
            algorithm_version=ALGORITHM_VERSION,
            weights={
                component.value: value / 10_000
                for component, value in zip(
                    COMPONENT_ORDER,
                    PROFILE_WEIGHTS_BASIS_POINTS[mode],
                    strict=True,
                )
            },
        )
        for mode in OptimizationMode
    )


class FakeRuntimeRepository:
    def __init__(self, claim: JobClaim) -> None:
        inventory = (
            inventory_pal(
                "a-m",
                "pal-a",
                "male",
                passives=("test_passive_a",),
                owner_player_id=claim.job.player_id,
                guild_id=claim.job.guild_id,
            ),
            inventory_pal(
                "b-f",
                "pal-b",
                "female",
                owner_player_id=claim.job.player_id,
                guild_id=claim.job.guild_id,
            ),
        )
        self.profiles = _profiles()
        self.facts = BreedingRuntimeFacts(
            catalog=VersionedBreedingCatalog(
                version_id=claim.job.game_data_version_id,
                content_hash="a" * 64,
                status="published",
                pal_ids=frozenset(("pal-a", "pal-b", "test_target_pal")),
                passive_skill_ids=frozenset(("test_passive_a",)),
                recipes=(recipe("pal-a", "pal-b", "test_target_pal"),),
            ),
            inventory=FixedInventorySnapshot(
                snapshot_id=claim.job.inventory_snapshot_id,
                world_id=claim.job.world_id,
                items=inventory,
            ),
        )

    async def active_scoring_profiles(self) -> tuple[RuntimeScoringProfile, ...]:
        return self.profiles

    async def load_facts(self, _claim: JobClaim) -> BreedingRuntimeFacts:
        return self.facts


def test_claim_adapter_validates_registry_before_calling_the_engine() -> None:
    async def scenario() -> None:
        claim = make_job_claim()
        repository = FakeRuntimeRepository(claim)
        adapter = BreedingEngineAdapter(repository)

        with pytest.raises(StructuredError) as not_initialized:
            await adapter.execute(claim)
        assert not_initialized.value.code is ErrorCode.BREEDING_RUNTIME_PROFILE_MISMATCH

        await adapter.initialize()
        result = await adapter.execute(claim)

        assert result.routes
        assert result.algorithm_version == ALGORITHM_VERSION
        assert result.scoring_profile_version == "balanced-v2"
        assert result.game_data_version_id == claim.job.game_data_version_id

    asyncio.run(scenario())


def test_claim_adapter_rejects_database_weight_drift_at_startup() -> None:
    async def scenario() -> None:
        claim = make_job_claim()
        repository = FakeRuntimeRepository(claim)
        first = repository.profiles[0]
        repository.profiles = (
            first.__class__(
                version=first.version,
                optimization_mode=first.optimization_mode,
                algorithm_version=first.algorithm_version,
                weights={**first.weights, "route_length": 0.99},
            ),
            *repository.profiles[1:],
        )

        with pytest.raises(StructuredError) as caught:
            await BreedingEngineAdapter(repository).initialize()

        assert caught.value.code is ErrorCode.BREEDING_RUNTIME_PROFILE_MISMATCH

    asyncio.run(scenario())
