from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from pal_hatch_helper import __version__
from pal_hatch_helper.models.system_status import ReadinessStatus, ServiceStatus, SystemStatus
from pal_hatch_helper.settings import Settings


def build_health_router(settings: Settings) -> APIRouter:
    router = APIRouter(tags=["operations"])

    @router.get("/healthz", response_model=SystemStatus)
    def healthz() -> SystemStatus:
        return SystemStatus.now(
            status=ServiceStatus.OK,
            service="agent",
            version=__version__,
        )

    @router.get("/readyz", response_model=ReadinessStatus)
    def readyz() -> ReadinessStatus | JSONResponse:
        errors = settings.readiness_errors()
        if errors:
            payload = ReadinessStatus(
                **SystemStatus.now(
                    status=ServiceStatus.NOT_READY,
                    service="agent",
                    version=__version__,
                ).model_dump(),
                error_code="configuration_invalid",
                database_configured=settings.database_configured,
                job_worker_configured=settings.job_worker_configured,
            )
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content=payload.model_dump(mode="json"),
            )
        return ReadinessStatus(
            **SystemStatus.now(
                status=ServiceStatus.READY,
                service="agent",
                version=__version__,
            ).model_dump(),
            error_code=None,
            database_configured=settings.database_configured,
            job_worker_configured=settings.job_worker_configured,
        )

    return router
