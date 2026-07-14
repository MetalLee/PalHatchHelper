# PalHatchHelper

PalHatchHelper 第一版是“帕鲁配种协作工作台”。当前仓库的 Phase 4 代码实现已完成且自动化高风险门禁已通过；真实来源许可、固定 source commit/release、Palworld Steam build ID、游戏版本和配方真实性仍待人工验收，因此真实数据生产发布继续阻塞，Phase 4 不标记为最终完成。Phase 5 Web 基础已按批准的并行边界完成实现与自动化门禁，只使用 Phase 1 RLS/RPC、Phase 3 脱敏库存以及本地或预览 Supabase。仓库不连接生产 Supabase、不读取真实 Palworld 存档或游戏包，也未接入真实生产配种数据。

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

同一镜像还提供 `job-worker`、`save-worker` 和 `catalog` 命令边界。没有真实配种 Handler 时 Job Worker 默认安全拒绝领取；Save Worker 仅在数据库、世界、明确确认的只读路径和 Parser 配置齐全时运行；catalog 只接收结构化目录，不实现游戏包提取。

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

- `/opt/palworld` 与真实存档只允许在部署阶段获批后由人员确认路径，并只读挂载给独立 Save Worker；当前仓库验证不访问它们。
- Agent 不提供公网任务 API，健康接口只绑定回环地址。
- `.env`、Service Role、AI Key 和真实服务器凭证不得进入 Git。
- 当前阶段不部署到 `/opt/services/palworld-manager`，不操作 Palworld 或 mihomo 容器。

设计规格与分阶段计划位于 `docs/superpowers/`。
