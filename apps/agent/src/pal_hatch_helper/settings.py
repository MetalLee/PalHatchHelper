import os
import socket
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AppEnvironment = Literal["development", "test", "production"]


class Settings(BaseSettings):
    """Runtime configuration loaded only from the process environment."""

    model_config = SettingsConfigDict(
        env_file=None,
        extra="ignore",
        case_sensitive=False,
    )

    app_env: AppEnvironment = "development"
    supabase_url: str | None = None
    supabase_service_role_key: SecretStr | None = None
    worker_id: str = Field(
        default_factory=lambda: f"{socket.gethostname()}-{os.getpid()}",
        min_length=1,
        max_length=128,
    )
    job_poll_interval_seconds: float = Field(default=2, gt=0, le=300)
    job_heartbeat_interval_seconds: float = Field(default=10, gt=0, le=300)
    job_lease_timeout_seconds: float = Field(default=30, gt=0, le=3600)
    job_lease_safety_margin_seconds: float = Field(default=5, gt=0, le=300)
    job_stale_reap_interval_seconds: float = Field(default=15, gt=0, le=3600)
    job_shutdown_grace_seconds: float = Field(default=30, ge=0, le=3600)
    database_request_timeout_seconds: float = Field(default=10, gt=0, le=300)

    @model_validator(mode="after")
    def validate_worker_timing(self) -> "Settings":
        heartbeat_window = (
            self.job_heartbeat_interval_seconds
            + self.database_request_timeout_seconds
            + self.job_lease_safety_margin_seconds
        )
        if heartbeat_window >= self.job_lease_timeout_seconds:
            raise ValueError(
                "job heartbeat interval, database request timeout, and lease safety "
                "margin must fit inside the lease timeout"
            )
        return self

    def readiness_errors(self) -> tuple[str, ...]:
        if self.app_env != "production":
            return ()

        errors: list[str] = []
        if self.supabase_url is None:
            errors.append("supabase_url_missing")
        elif not _is_https_url(self.supabase_url):
            errors.append("supabase_url_invalid")
        if not _has_secret_value(self.supabase_service_role_key):
            errors.append("supabase_service_role_key_missing")
        return tuple(errors)

    @property
    def database_configured(self) -> bool:
        return bool(
            self.supabase_url
            and _is_database_url_allowed(self.supabase_url, self.app_env)
            and _has_secret_value(self.supabase_service_role_key)
        )

    @property
    def job_worker_configured(self) -> bool:
        return self.database_configured


def _is_https_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and parsed.hostname is not None


def _is_database_url_allowed(value: str, app_env: AppEnvironment) -> bool:
    parsed = urlparse(value)
    if parsed.scheme == "https" and parsed.hostname is not None:
        return True
    return bool(
        app_env in {"development", "test"}
        and parsed.scheme == "http"
        and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    )


def _has_secret_value(value: SecretStr | None) -> bool:
    return value is not None and bool(value.get_secret_value())
