# syntax=docker/dockerfile:1.7
FROM ghcr.io/astral-sh/uv:0.11.28 AS uv
FROM python:3.12.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

COPY --from=uv /uv /uvx /bin/

RUN groupadd --system --gid 10001 palhatch \
    && useradd --system --uid 10001 --gid palhatch --home-dir /app palhatch \
    && mkdir -p /app \
    && chown palhatch:palhatch /app

WORKDIR /app
COPY --chown=palhatch:palhatch pyproject.toml uv.lock README.md ./
COPY --chown=palhatch:palhatch src ./src

USER palhatch
RUN uv sync --frozen --no-dev

EXPOSE 18765
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:18765/healthz', timeout=2)"]

CMD ["pal-hatch-helper", "api", "--host", "0.0.0.0", "--port", "18765"]
