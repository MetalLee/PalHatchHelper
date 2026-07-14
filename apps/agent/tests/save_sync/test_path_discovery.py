from pathlib import Path

import pytest

from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.save_sync.discovery import discover_save_root


def test_discovery_requires_one_explicit_bind_mapping() -> None:
    rendered_compose = {
        "services": {
            "palworld": {
                "volumes": [
                    {
                        "type": "bind",
                        "source": "/srv/confirmed-save",
                        "target": "/game/Pal/Saved",
                    }
                ]
            }
        }
    }

    result = discover_save_root(
        rendered_compose,
        service_name="palworld",
        container_save_path=Path("/game/Pal/Saved"),
    )

    assert result == Path("/srv/confirmed-save")


@pytest.mark.parametrize(
    "rendered_compose",
    [
        {"services": {"palworld": {"volumes": []}}},
        {
            "services": {
                "palworld": {
                    "volumes": [
                        {"type": "bind", "source": "/one", "target": "/game/Pal/Saved"},
                        {"type": "bind", "source": "/two", "target": "/game/Pal/Saved"},
                    ]
                }
            }
        },
    ],
)
def test_discovery_never_guesses_when_mapping_is_missing_or_ambiguous(
    rendered_compose: object,
) -> None:
    with pytest.raises(StructuredError) as caught:
        discover_save_root(
            rendered_compose,
            service_name="palworld",
            container_save_path=Path("/game/Pal/Saved"),
        )

    assert caught.value.code is ErrorCode.SAVE_PATH_NOT_CONFIRMED
