# PalHatch Helper Agent

Python 3.12 FastAPI 私有 Agent 骨架。Phase 0 仅提供本地健康和 readiness，不轮询 Supabase、不读取存档、不运行 Worker。

```bash
uv sync --dev
uv run uvicorn pal_hatch_helper.main:app --host 127.0.0.1 --port 18765
```
