import pytest
from pydantic import SecretStr, ValidationError

from pal_hatch_helper.settings import Settings


def test_production_configuration_requires_both_supabase_values() -> None:
    settings = Settings(
        app_env="production",
        supabase_url="https://example.supabase.co",
        supabase_service_role_key=None,
    )

    assert settings.readiness_errors() == ("supabase_service_role_key_missing",)


def test_service_role_is_stored_as_a_redacted_secret() -> None:
    service_role = "fixture-service-role-secret-that-must-not-leak"
    settings = Settings(supabase_service_role_key=service_role)

    assert isinstance(settings.supabase_service_role_key, SecretStr)
    assert service_role not in repr(settings)


def test_heartbeat_must_be_shorter_than_the_lease_timeout() -> None:
    with pytest.raises(ValidationError):
        Settings(job_heartbeat_interval_seconds=30, job_lease_timeout_seconds=30)


def test_heartbeat_request_and_safety_window_must_fit_inside_the_lease() -> None:
    with pytest.raises(ValidationError):
        Settings(
            job_heartbeat_interval_seconds=10,
            database_request_timeout_seconds=10,
            job_lease_safety_margin_seconds=10,
            job_lease_timeout_seconds=30,
        )


def test_database_url_requires_https_except_for_local_development() -> None:
    production_http = Settings(
        app_env="production",
        supabase_url="http://example.supabase.co",
        supabase_service_role_key="fixture-service-role",
    )
    development_http = Settings(
        app_env="development",
        supabase_url="http://example.supabase.co",
        supabase_service_role_key="fixture-service-role",
    )
    local_development = Settings(
        app_env="development",
        supabase_url="http://127.0.0.1:54321",
        supabase_service_role_key="fixture-service-role",
    )

    assert production_http.database_configured is False
    assert development_http.database_configured is False
    assert local_development.database_configured is True


def test_invalid_environment_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(app_env="staging-like")
