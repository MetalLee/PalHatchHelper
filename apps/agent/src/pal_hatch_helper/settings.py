import json
import os
import socket
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse
from uuid import UUID

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AppEnvironment = Literal["development", "test", "production"]


class Settings(BaseSettings):
    """Runtime configuration loaded only from the process environment."""

    model_config = SettingsConfigDict(
        env_file=None,
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
    )

    app_env: AppEnvironment = "development"
    app_version: str = Field(default="development", min_length=1, max_length=120)
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
    command_poll_interval_seconds: float = Field(default=2, gt=0, le=300)
    command_stale_after_seconds: float = Field(default=120, ge=30, le=3600)
    database_request_timeout_seconds: float = Field(default=10, gt=0, le=300)
    palhatch_data_dir: Path = Field(default=Path("./data"))
    game_catalog_bucket: str = Field(default="game-catalog-artifacts", min_length=1, max_length=120)
    game_catalog_cache_max_versions: int = Field(default=2, ge=1, le=32)
    breeding_remote_sources_enabled: bool = False
    breeding_source_timeout_seconds: float = Field(default=30, gt=0, le=300)
    breeding_source_maximum_bytes: int = Field(
        default=10 * 1024 * 1024,
        ge=1024,
        le=100 * 1024 * 1024,
    )
    ai_openai_compatible_base_url: str | None = None
    ai_openai_compatible_api_key: SecretStr | None = None
    ai_openai_compatible_model: str | None = Field(default=None, min_length=1, max_length=120)
    ai_codex_cli_enabled: bool = False
    ai_provider_timeout_seconds: float = Field(default=30, gt=0, le=300)
    ai_maximum_response_bytes: int = Field(default=32_000, ge=1024, le=1_000_000)
    palworld_compose_dir: Path | None = None
    palworld_save_root: Path | None = None
    palworld_save_mount_read_only_verified: bool = False
    palworld_world_id: UUID | None = None
    palworld_world_uid: str | None = Field(default=None, min_length=1, max_length=128)
    parser_name: str | None = Field(default=None, min_length=1, max_length=100)
    parser_version: str | None = Field(default=None, min_length=1, max_length=100)
    parser_command_json: str | None = None
    parser_required_files_json: str | None = None
    palhatch_oodle_lib: Path | None = None
    palhatch_oodle_sha256: str | None = Field(
        default=None,
        pattern=r"^[0-9a-f]{64}$",
    )
    save_poll_interval_seconds: float = Field(default=300, gt=0, le=3600)
    save_stability_delay_seconds: float = Field(default=10, ge=0, le=300)
    parser_timeout_seconds: float = Field(default=180, gt=0, le=1800)
    parser_memory_limit_bytes: int = Field(
        default=1536 * 1024 * 1024,
        ge=64 * 1024 * 1024,
        le=8 * 1024 * 1024 * 1024,
    )
    parser_cpu_limit_seconds: int = Field(default=180, ge=1, le=1800)

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

    @property
    def save_worker_configured(self) -> bool:
        return self.database_configured and not self.save_worker_configuration_errors()

    def save_worker_configuration_errors(self) -> tuple[str, ...]:
        errors: list[str] = []
        if self.palworld_compose_dir is None:
            errors.append("palworld_compose_dir_missing")
        elif not self.palworld_compose_dir.is_absolute():
            errors.append("palworld_compose_dir_invalid")
        if self.palworld_save_root is None:
            errors.append("palworld_save_root_missing")
        elif not self.palworld_save_root.is_absolute():
            errors.append("palworld_save_root_invalid")
        if self.palworld_world_id is None:
            errors.append("palworld_world_id_missing")
        if self.palworld_world_uid is None:
            errors.append("palworld_world_uid_missing")
        if self.parser_name is None or self.parser_version is None:
            errors.append("parser_identity_missing")
        if self.parser_command_json is None:
            errors.append("parser_command_missing")
        elif not self.parser_command or not Path(self.parser_command[0]).is_absolute():
            errors.append("parser_command_invalid")
        if self.parser_required_files_json is None:
            errors.append("parser_required_files_missing")
        elif not self.parser_required_files:
            errors.append("parser_required_files_invalid")
        if self.parser_name == "palhatch-plm-save-parser":
            if self.palhatch_oodle_lib is None:
                errors.append("palhatch_oodle_lib_missing")
            elif not self.palhatch_oodle_lib.is_absolute():
                errors.append("palhatch_oodle_lib_invalid")
            if self.palhatch_oodle_sha256 is None:
                errors.append("palhatch_oodle_sha256_missing")
        return tuple(errors)

    @property
    def parser_command(self) -> tuple[str, ...]:
        return _json_string_tuple(self.parser_command_json)

    @property
    def parser_required_files(self) -> tuple[str, ...]:
        values = _json_string_tuple(self.parser_required_files_json)
        if any(
            Path(value).is_absolute()
            or not value
            or "\\" in value
            or any(part in {"", ".", ".."} for part in value.split("/"))
            for value in values
        ):
            return ()
        return values

    @property
    def game_catalog_cache_status(self) -> Literal["empty", "warm", "error"]:
        cache_directory = self.palhatch_data_dir / "game-catalog" / "cache"
        try:
            return "warm" if any(cache_directory.glob("*.sqlite")) else "empty"
        except OSError:
            return "error"


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


def _json_string_tuple(value: str | None) -> tuple[str, ...]:
    if value is None:
        return ()
    try:
        decoded = json.loads(value)
    except json.JSONDecodeError:
        return ()
    if (
        not isinstance(decoded, list)
        or not decoded
        or not all(isinstance(item, str) and item for item in decoded)
    ):
        return ()
    return tuple(decoded)
