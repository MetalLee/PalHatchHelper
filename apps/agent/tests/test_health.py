import json
from pathlib import Path

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator  # type: ignore[import-untyped]

from pal_hatch_helper.main import create_app
from pal_hatch_helper.settings import Settings


def assert_readiness_contract(payload: object) -> None:
    schema_path = (
        Path(__file__).parents[3]
        / "packages"
        / "contracts"
        / "schema"
        / "readiness-status.schema.json"
    )
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    Draft202012Validator(schema).validate(payload)


def test_healthz_reports_process_health() -> None:
    client = TestClient(create_app(Settings(app_env="development")))

    response = client.get("/healthz")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "agent"
    assert body["version"] == "0.0.0"
    assert body["timestamp"].endswith("Z")


def test_development_is_ready_without_supabase() -> None:
    client = TestClient(create_app(Settings(app_env="development")))

    response = client.get("/readyz")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["database_configured"] is False
    assert response.json()["job_worker_configured"] is False
    assert response.json()["save_worker_configured"] is False
    assert response.json()["game_catalog"] == {
        "status": "not_configured",
        "active_version_id": None,
        "cache_status": "empty",
    }
    assert_readiness_contract(response.json())


def test_production_is_not_ready_without_supabase() -> None:
    client = TestClient(create_app(Settings(app_env="production")))

    response = client.get("/readyz")

    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"
    assert response.json()["error_code"] == "configuration_invalid"
    assert response.json()["database_configured"] is False
    assert response.json()["job_worker_configured"] is False
    assert_readiness_contract(response.json())


def test_production_database_only_configuration_is_not_save_worker_ready() -> None:
    service_role = "fixture-service-role-secret-that-must-not-leak"
    client = TestClient(
        create_app(
            Settings(
                app_env="production",
                supabase_url="https://example.supabase.co",
                supabase_service_role_key=service_role,
            )
        )
    )

    response = client.get("/readyz")

    assert response.status_code == 503
    assert response.json()["database_configured"] is True
    assert response.json()["job_worker_configured"] is True
    assert response.json()["save_worker_configured"] is False
    assert service_role not in response.text
    assert_readiness_contract(response.json())


def test_production_reports_save_worker_ready_without_paths_or_secrets_in_response() -> None:
    client = TestClient(
        create_app(
            Settings(
                app_env="production",
                supabase_url="https://example.supabase.co",
                supabase_service_role_key="fixture-service-role",
                palworld_compose_dir="/confirmed/compose",
                palworld_save_root="/confirmed/save",
                palworld_world_id="10000000-0000-4000-8000-000000000001",
                palworld_world_uid="fixture-world-001",
                parser_name="fixture-parser",
                parser_version="1.0.0",
                parser_command_json='["/usr/bin/fixture-parser", "{output_path}"]',
                parser_required_files_json='["World.sav"]',
            )
        )
    )

    response = client.get("/readyz")

    assert response.status_code == 200
    assert response.json()["save_worker_configured"] is True
    assert "/confirmed" not in response.text
