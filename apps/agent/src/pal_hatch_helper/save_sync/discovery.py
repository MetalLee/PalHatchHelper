from collections.abc import Mapping
from pathlib import Path

from pal_hatch_helper.models.errors import ErrorCode, StructuredError


def discover_save_root(
    rendered_compose: object,
    *,
    service_name: str,
    container_save_path: Path,
) -> Path:
    """Read one explicit bind mapping from `docker compose config --format json` output."""
    if not container_save_path.is_absolute() or not service_name:
        raise _not_confirmed()
    if not isinstance(rendered_compose, Mapping):
        raise _not_confirmed()
    services = rendered_compose.get("services")
    if not isinstance(services, Mapping):
        raise _not_confirmed()
    service = services.get(service_name)
    if not isinstance(service, Mapping):
        raise _not_confirmed()
    volumes = service.get("volumes")
    if not isinstance(volumes, list):
        raise _not_confirmed()

    matches: list[Path] = []
    for volume in volumes:
        if not isinstance(volume, Mapping):
            continue
        source = volume.get("source")
        target = volume.get("target")
        if (
            volume.get("type") != "bind"
            or not isinstance(source, str)
            or not isinstance(target, str)
        ):
            continue
        source_path = Path(source)
        if Path(target) == container_save_path and source_path.is_absolute():
            matches.append(source_path)
    if len(matches) != 1:
        raise _not_confirmed()
    return matches[0]


def _not_confirmed() -> StructuredError:
    return StructuredError(
        code=ErrorCode.SAVE_PATH_NOT_CONFIRMED,
        summary="Exactly one explicit bind mapping must confirm the save root.",
        retryable=False,
    )
