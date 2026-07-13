# 本地开发

## 安装

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
cd apps/agent
uv sync --frozen --dev
cd ../..
```

本地开发允许不配置 Supabase：`APP_ENV=development` 时 Agent readiness 只验证本阶段基础配置。生产模式要求有效的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`，否则返回 HTTP 503。

## Web

```bash
pnpm --filter @palhatch/web dev
curl --fail http://localhost:3000/api/health
```

## Agent

```bash
cd apps/agent
uv run uvicorn pal_hatch_helper.main:app --host 127.0.0.1 --port 18765
curl --fail http://127.0.0.1:18765/healthz
curl --fail http://127.0.0.1:18765/readyz
```

不要把 `--host` 改为 `0.0.0.0` 用于服务器部署。Compose 模板显式映射 `127.0.0.1:18765`。

## 配置

根 `.env.example` 是变量目录，`infra/agent/.env.example` 是 Compose 示例。所有值均为虚假占位符。真实值只进入未跟踪的本地文件或部署平台 Secret 管理。
