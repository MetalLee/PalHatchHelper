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

Web/Agent 本地开发允许不配置 Supabase：`APP_ENV=development` 时 Agent readiness 只验证基础配置。Phase 1/2 数据库与 Worker 集成开发必须使用 Supabase CLI 本地实例，步骤见 `supabase-local-development.md`。生产模式要求有效的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`，否则返回 HTTP 503；本阶段不连接生产。

## Web

`.env.local` 使用 `NEXT_PUBLIC_APP_URL` 作为 Web 的唯一公开 URL 来源，不另设重复的
`PALBEACON_PUBLIC_URL`。Steam OpenID 在本地仍要求浏览器可通过 HTTPS 回调；纯单元测试会 mock Steam HTTP，
不会访问真实 Steam。邮箱登录与注册设置 `ENABLE_PASSWORD_LOGIN=true`；本地 Supabase 配置已启用 signup。

公开登录与 Sync Route 所需服务端变量：

```text
NEXT_PUBLIC_APP_URL=http://localhost:3000
STEAM_WEB_API_KEY=
ENABLE_PASSWORD_LOGIN=true
SUPABASE_SERVICE_ROLE_KEY=<local service role only>
SYNC_MAX_PAYLOAD_BYTES=5242880
SYNC_PAIRING_CODE_TTL_SECONDS=600
```

`STEAM_WEB_API_KEY` 可留空，登录会使用安全显示名兜底。Service Role 只能进入 Web Server Route 和既有
Agent，不能使用 `NEXT_PUBLIC_` 前缀，也不能出现在浏览器 bundle、URL 或日志中。

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

## PalBeacon Sync CLI

```bash
pnpm --filter palbeacon-sync build
node apps/sync/dist/cli.js init \
  --url http://localhost:3000 \
  --code ABCD-EFGH \
  --save-dir /path/to/Pal/Saved/SaveGames
```

开发可用 `PALBEACON_PARSER_BIN` 指向本地 Linux x64 Parser。CLI 不访问 Docker Socket、RCON 或远程命令，
也不修改原始存档；它只解析稳定的临时只读副本。随包 Parser 已集成固定版本的开源 palooz/ooz
解码核心，不需要 Python 或外部解压库。不得把真实存档或来源不明的二进制加入 fixture 或提交。

## 配置

根 `.env.example` 是变量目录，`infra/agent/.env.example` 是 Compose 示例。所有值均为虚假占位符。真实值只进入未跟踪的本地文件或部署平台 Secret 管理。
