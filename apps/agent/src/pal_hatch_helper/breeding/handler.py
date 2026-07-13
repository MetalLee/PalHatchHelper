from typing import Protocol

from pal_hatch_helper.models.jobs import JobClaim, JobExecutionResult


class BreedingJobHandler(Protocol):
    """Phase 2 execution seam; the deterministic algorithm arrives in a later phase."""

    async def handle(self, claim: JobClaim) -> JobExecutionResult: ...
