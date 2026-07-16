from dataclasses import dataclass
from typing import Protocol

from pal_hatch_helper.breeding.engine import ALGORITHM_VERSION, DeterministicBreedingEngine
from pal_hatch_helper.breeding.facts import BreedingRuntimeFacts
from pal_hatch_helper.breeding.scoring import (
    COMPONENT_ORDER,
    PROFILE_VERSIONS,
    PROFILE_WEIGHTS_BASIS_POINTS,
)
from pal_hatch_helper.generated import (
    BreedingEngineRequest,
    BreedingEngineResult,
    BreedingSearchLimits,
    OptimizationMode,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.models.jobs import JobClaim


@dataclass(frozen=True, slots=True)
class RuntimeScoringProfile:
    version: str
    optimization_mode: OptimizationMode
    algorithm_version: str
    weights: dict[str, float]


class BreedingRuntimeRepository(Protocol):
    async def active_scoring_profiles(self) -> tuple[RuntimeScoringProfile, ...]: ...

    async def load_facts(self, claim: JobClaim) -> BreedingRuntimeFacts: ...


class BreedingEngineAdapter:
    """Construct the deterministic request only from a claimed, version-fixed job."""

    def __init__(
        self,
        repository: BreedingRuntimeRepository,
        *,
        engine: DeterministicBreedingEngine | None = None,
        limits: BreedingSearchLimits | None = None,
    ) -> None:
        self._repository = repository
        self._engine = engine or DeterministicBreedingEngine()
        self._limits = limits or BreedingSearchLimits(
            max_generations=5,
            max_expanded_nodes=200_000,
            timeout_ms=30_000,
            max_species_routes_per_pal=512,
            max_assignment_states_per_mask=64,
            max_candidate_routes=1_000,
            max_results=24,
        )
        self._initialized = False

    async def initialize(self) -> None:
        validate_runtime_scoring_profiles(await self._repository.active_scoring_profiles())
        self._initialized = True

    async def execute(self, claim: JobClaim) -> BreedingEngineResult:
        if not self._initialized:
            raise StructuredError(
                code=ErrorCode.BREEDING_RUNTIME_PROFILE_MISMATCH,
                summary="The breeding runtime profile registry was not validated at startup.",
                retryable=False,
            )
        facts = await self._repository.load_facts(claim)
        job = claim.job
        if facts.catalog.content_hash != job.game_data_content_hash:
            raise StructuredError(
                code=ErrorCode.BREEDING_GAME_DATA_CONTENT_MISMATCH,
                summary="The claimed job content hash does not match its exact catalog facts.",
                retryable=False,
            )
        limits = self._limits.model_copy(update={"max_generations": job.max_generations})
        request = BreedingEngineRequest(
            target_pal_id=job.target_pal_id,
            desired_passive_ids=sorted(job.desired_passive_ids),
            world_id=job.world_id,
            inventory_snapshot_id=job.inventory_snapshot_id,
            game_data_version_id=job.game_data_version_id,
            game_data_content_hash=facts.catalog.content_hash,
            algorithm_version=job.algorithm_version,
            scoring_profile_version=job.scoring_profile_version,
            optimization_mode=job.optimization_mode,
            requester_player_id=job.player_id,
            requester_guild_id=job.guild_id,
            allow_shared_inventory=job.allow_guild_shared,
            allow_locked_reuse=False,
            inventory=list(facts.inventory.items),
            limits=limits,
        )
        return self._engine.search(request, facts)


def validate_runtime_scoring_profiles(
    profiles: tuple[RuntimeScoringProfile, ...],
) -> None:
    by_mode = {profile.optimization_mode: profile for profile in profiles}
    if set(by_mode) != set(OptimizationMode):
        raise _profile_mismatch()
    for mode in OptimizationMode:
        profile = by_mode[mode]
        expected_weights = {
            component.value: basis_points / 10_000
            for component, basis_points in zip(
                COMPONENT_ORDER,
                PROFILE_WEIGHTS_BASIS_POINTS[mode],
                strict=True,
            )
        }
        if (
            profile.version != PROFILE_VERSIONS[mode]
            or profile.algorithm_version != ALGORITHM_VERSION
            or profile.weights != expected_weights
        ):
            raise _profile_mismatch()


def _profile_mismatch() -> StructuredError:
    return StructuredError(
        code=ErrorCode.BREEDING_RUNTIME_PROFILE_MISMATCH,
        summary="Database scoring profiles do not match the deterministic engine registry.",
        retryable=False,
    )
