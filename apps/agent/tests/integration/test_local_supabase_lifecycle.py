import asyncio
import os
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import httpx
import pytest
from pydantic import SecretStr

from pal_hatch_helper.breeding.adapter import BreedingEngineAdapter
from pal_hatch_helper.game_catalog.gateway import SupabaseCatalogGateway
from pal_hatch_helper.game_catalog.models import LoadedGameCatalog
from pal_hatch_helper.game_catalog.validation import load_catalog_directory
from pal_hatch_helper.generated import CatalogBreedingRecipe
from pal_hatch_helper.models.jobs import JobClaim, JobExecutionResult
from pal_hatch_helper.repositories.breeding import SupabaseBreedingRuntimeRepository
from pal_hatch_helper.repositories.database import SupabaseDatabaseClient
from pal_hatch_helper.repositories.jobs import SupabaseJobRepository
from pal_hatch_helper.workers.job_worker import JobWorker

pytestmark = pytest.mark.integration
TARGET_JOB_ID = UUID("60000000-0000-4000-8000-000000000001")


def test_claimed_local_supabase_job_enters_the_version_validated_engine() -> None:
    supabase_url = os.environ.get("TEST_SUPABASE_URL")
    service_role = os.environ.get("TEST_SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role:
        pytest.skip("reset local Supabase credentials are not configured")
    if urlparse(supabase_url).hostname not in {"127.0.0.1", "localhost", "::1"}:
        pytest.fail("integration test refuses non-loopback Supabase URLs")

    class CapturingEngineHandler:
        def __init__(self, adapter: BreedingEngineAdapter) -> None:
            self.adapter = adapter
            self.claims: list[JobClaim] = []
            self.route_counts: list[int] = []

        async def handle(self, claim: JobClaim) -> JobExecutionResult:
            self.claims.append(claim)
            result = await self.adapter.execute(claim)
            self.route_counts.append(len(result.routes))
            return JobExecutionResult.succeeded()

    class FixtureCatalogRepository:
        async def load_version(self, _version_id: UUID) -> LoadedGameCatalog:
            base = load_catalog_directory(
                Path(__file__).parents[4] / "data" / "catalog-fixtures" / "minimal-valid"
            )
            pal_template = base.pals[0]
            passive_template = base.passive_skills[0]
            return LoadedGameCatalog(
                manifest=base.manifest.model_copy(update={"content_hash": "c" * 64}),
                pals=tuple(
                    pal_template.model_copy(
                        update={"pal_id": pal_id, "name_key": f"fixture.{pal_id}.name"}
                    )
                    for pal_id in (
                        "test_parent_a",
                        "test_parent_b",
                        "test_child_pal",
                        "test_private_pal",
                        "test_other_guild_pal",
                    )
                ),
                passive_skills=(
                    passive_template.model_copy(
                        update={
                            "passive_skill_id": "test_passive_a",
                            "name_key": "fixture.passive.a",
                        }
                    ),
                ),
                active_skills=(),
                pal_active_skills=(),
                partner_skills=(),
                breeding_recipes=(
                    CatalogBreedingRecipe(
                        parent_a_pal_id="test_parent_a",
                        parent_b_pal_id="test_parent_b",
                        child_pal_id="test_child_pal",
                        recipe_type="normal",
                        metadata={"fixture": True},
                    ),
                ),
                localizations=(),
            )

    async def scenario() -> None:
        database = SupabaseDatabaseClient(
            base_url=supabase_url,
            service_role_key=SecretStr(service_role),
        )
        repository = SupabaseJobRepository(database)
        gateway = SupabaseCatalogGateway(database)
        runtime_repository = SupabaseBreedingRuntimeRepository(
            database,
            catalog_gateway=gateway,
            catalog_repository=FixtureCatalogRepository(),
        )
        adapter = BreedingEngineAdapter(runtime_repository)
        await adapter.initialize()
        handler = CapturingEngineHandler(adapter)
        worker = JobWorker(
            repository,
            handler,
            worker_id="phase2-local-integration-worker",
            heartbeat_interval_seconds=0.005,
            lease_timeout_seconds=0.05,
        )
        try:
            assert await worker.run_once()
            target_claim = handler.claims[-1]
            assert target_claim.job.job_id == TARGET_JOB_ID
            assert target_claim.lease.lease_token is not None
            assert len(handler.route_counts) == 1
            assert handler.route_counts[0] > 0
            persisted_job = await read_job_status(
                supabase_url=supabase_url,
                service_role=service_role,
                job_id=TARGET_JOB_ID,
            )
            assert persisted_job == {
                "status": "completed",
                "locked_by": None,
                "lease_token": None,
            }
        finally:
            await database.close()

    asyncio.run(scenario())


async def read_job_status(
    *,
    supabase_url: str,
    service_role: str,
    job_id: UUID,
) -> dict[str, object]:
    async with httpx.AsyncClient(trust_env=False) as client:
        response = await client.get(
            f"{supabase_url}/rest/v1/breeding_jobs",
            headers={
                "apikey": service_role,
                "Authorization": f"Bearer {service_role}",
            },
            params={
                "id": f"eq.{job_id}",
                "select": "status,locked_by,lease_token",
            },
        )
        response.raise_for_status()
        payload = response.json()
        assert isinstance(payload, list) and len(payload) == 1
        row = payload[0]
        assert isinstance(row, dict)
        return row
