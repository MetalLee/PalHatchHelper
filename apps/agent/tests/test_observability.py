import io

from pal_hatch_helper.observability.logging import configure_logging, get_logger


def test_structured_logs_redact_service_role_and_authorization_values() -> None:
    stream = io.StringIO()
    configure_logging(stream=stream)
    logger = get_logger("test")
    service_role = "fixture-service-role-secret-that-must-not-leak"

    logger.info(
        "worker_configured",
        extra={
            "event": "worker_configured",
            "service_role_key": service_role,
            "authorization": f"Bearer {service_role}",
            "worker_id": "fixture-worker",
        },
    )

    output = stream.getvalue()
    assert service_role not in output
    assert "fixture-worker" in output
    assert "[REDACTED]" in output
