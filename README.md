# PalHatchHelper

PalHatchHelper 第一版是“帕鲁配种协作工作台”。当前仓库处于 Phase 0：提供可运行的 Next.js 前端、私有 FastAPI Agent、共享契约示例、单仓验证入口和 CI，不连接真实 Supabase，不读取真实存档，也不实现配种算法。

## 前置工具

- Node.js 22（见 `.nvmrc`）
- pnpm 9.15.x
- Python 3.12
- [uv](https://docs.astral.sh/uv/)
- Docker（只在本地构建或检查 Agent 镜像时需要）

## 从零开始

```bash
git clone <repository-url>
cd PalHatchHelper
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile
cd apps/agent
uv sync --frozen --dev
cd ../..
pnpm check
```

复制示例配置只用于本地开发；不要把真实值提交到 Git：

```bash
cp .env.example .env.local
```

启动 Web：

```bash
pnpm --filter @palhatch/web dev
```

启动本地 Agent 健康接口：

```bash
cd apps/agent
uv run uvicorn pal_hatch_helper.main:app --host 127.0.0.1 --port 18765
```

访问 `http://localhost:3000`、`http://127.0.0.1:18765/healthz` 和 `http://127.0.0.1:18765/readyz`。

## 验证

根目录统一入口：

```bash
pnpm check
```

Agent 独立入口：

```bash
cd apps/agent
uv sync --frozen --dev
uv run ruff check .
uv run ruff format --check .
uv run mypy src
uv run pytest
```

更多命令见 [本地开发](docs/operations/local-development.md) 和 [验证手册](docs/operations/verification.md)。

## 安全边界

- `/opt/palworld` 与真实存档只允许在后续获批阶段只读检查和复制；当前阶段完全不访问。
- Agent 不提供公网任务 API，健康接口只绑定回环地址。
- `.env`、Service Role、AI Key 和真实服务器凭证不得进入 Git。
- 当前阶段不部署到 `/opt/services/palworld-manager`，不操作 Palworld 或 mihomo 容器。

设计规格与分阶段计划位于 `docs/superpowers/`。
