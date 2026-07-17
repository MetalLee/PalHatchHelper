# PalHatchHelper

PalHatchHelper 第一版是“帕鲁配种协作工作台”。Phase 4 的实现、自动化门禁、Build `24181105` 真实目录验收及本地测试 world 发布/回滚演练均已完成；Phase 5 Web 基础、Phase 6 配种器与异步路线、Phase 7 执行计划，以及 Phase 8 第一轮管理员工作台、受控命令队列和生产部署文件也已完成本地实现与自动化门禁。当前仍是 `MODE=DEVELOP_ADMIN`：生产 Supabase、Vercel 和腾讯云 Agent 部署均为 `not_started`，仓库不读取或修改真实 Palworld 存档，也不操作 Palworld 或 mihomo。

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

同一镜像还提供 `job-worker`、`save-worker`、`command-worker` 和 `catalog` 命令边界。Job Worker 在本地数据库与 Service Role 配置齐全时组装 Phase 6 确定性 Handler，也支持 `--once` 完成单任务验收；Save Worker 仅在数据库、世界、明确确认的只读路径和 Parser 配置齐全时运行；Command Worker 只领取共享契约允许的白名单命令；catalog 只接收结构化目录，不实现游戏包提取。

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
