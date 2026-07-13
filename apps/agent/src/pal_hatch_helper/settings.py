from typing import Literal
from urllib.parse import urlparse

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
    supabase_service_role_key: str | None = None

    def readiness_errors(self) -> tuple[str, ...]:
        if self.app_env != "production":
            return ()

        errors: list[str] = []
        if self.supabase_url is None:
            errors.append("supabase_url_missing")
        elif not _is_https_url(self.supabase_url):
            errors.append("supabase_url_invalid")
        if not self.supabase_service_role_key:
            errors.append("supabase_service_role_key_missing")
        return tuple(errors)


def _is_https_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and parsed.hostname is not None
