from fastapi import FastAPI

from pal_hatch_helper import __version__
from pal_hatch_helper.api.health import build_health_router
from pal_hatch_helper.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or Settings()
    application = FastAPI(
        title="PalHatch Helper Agent",
        version=__version__,
        docs_url=None,
        redoc_url=None,
    )
    application.include_router(build_health_router(resolved_settings))
    return application


app = create_app()
