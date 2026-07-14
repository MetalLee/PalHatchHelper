# PalHatchHelper

PalHatchHelper 第一版是“帕鲁配种协作工作台”。当前仓库已完成 Phase 2.5：除私有 Agent、任务租约和 Supabase 权限基础外，已经具备统一静态游戏目录的共享契约、不可变版本包、关系投影、发布/回滚和精确版本缓存。它不连接生产 Supabase，不读取真实存档或真实游戏包，也尚未实现真实配种 Handler、路线算法或 AI。

## 前置工具

- Node.js 22（见 `.nvmrc`）
- pnpm 9.15.x
- Python 3.12
- [uv](https://docs.astral.sh/uv/)
- Docker（只在本地构建或检查 Agent 镜像时需要）
- Supabase CLI（只连接本地开发实例）

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
uv run pal-hatch-helper api
```

同一镜像还提供 `job-worker`、`save-worker` 和 `catalog` 命令边界。没有真实配种 Handler 时 Job Worker 默认安全拒绝领取；Save Worker 只保留 Phase 3 入口；catalog 只接收结构化目录，不实现游戏包提取。

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

本地数据库重建与权限测试见 [Supabase 本地开发](docs/operations/supabase-local-development.md)。

## 安全边界

- `/opt/palworld` 与真实存档只允许在后续获批阶段只读检查和复制；Phase 2 完全不访问。
- Agent 不提供公网任务 API，健康接口只绑定回环地址。
- `.env`、Service Role、AI Key 和真实服务器凭证不得进入 Git。
- 当前阶段不部署到 `/opt/services/palworld-manager`，不操作 Palworld 或 mihomo 容器。

设计规格与分阶段计划位于 `docs/superpowers/`。
