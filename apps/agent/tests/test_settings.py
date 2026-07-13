import pytest
from pydantic import ValidationError

from pal_hatch_helper.settings import Settings


def test_production_configuration_requires_both_supabase_values() -> None:
    settings = Settings(
        app_env="production",
        supabase_url="https://example.supabase.co",
        supabase_service_role_key=None,
    )

    assert settings.readiness_errors() == ("supabase_service_role_key_missing",)


def test_invalid_environment_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(app_env="staging-like")  # type: ignore[arg-type]
