# PalBeacon

PalBeacon 是面向《幻兽帕鲁》私人服务器的数据监控、帕鲁库存与配种协作控制台。服务器状态、帕鲁库存与配种计划，尽在一个看板。Keep your world visible. 时刻掌握你的帕鲁世界。

第一版继续以安全同步库存、确定性配种路线比较和“我的计划”只读收藏为核心闭环。公开入口使用 Steam OpenID 登录；自建服务器可通过 `palbeacon-sync` 配对并定时上传脱敏后的标准化库存。原有私有 Agent 发布路径继续保留。代码仓库与内部工程标识仍为 `PalHatchHelper`；Supabase、Vercel 和腾讯云私有 Agent 已完成生产部署，当前发布标识与回滚引用记录在 [v1 生产发布记录](docs/releases/v1-production-deployment.md)。开发与测试默认仍只使用 fixture 和本地 Supabase，不读取或修改真实 Palworld 存档，也不操作 Palworld 或 mihomo。

## 前置工具

- Node.js 22（见 `.nvmrc`）
- pnpm 9.15.x
- Python 3.12
- [uv](https://docs.astral.sh/uv/)
- Docker（只在本地构建或检查 Agent 镜像时需要）
- Supabase CLI（开发默认只连接本地实例；生产操作必须按运行手册明确获批）

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

本地构建公开 Sync CLI：

```bash
pnpm --filter palbeacon-sync build
node apps/sync/dist/cli.js --help
```

第一版只支持 Linux x64。CLI 包含仓库现有 Go Parser，但不包含或下载 Oodle 库；完整用法见 [apps/sync/README.md](apps/sync/README.md)。

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

- `/opt/palworld` 与真实存档只允许在部署阶段获批后由人员确认路径，并只读挂载给独立 Save Worker；开发验证不访问它们。
- Agent 不提供公网任务 API，健康接口只绑定回环地址。
- `.env`、Service Role、AI Key 和真实服务器凭证不得进入 Git。
- 生产发布只按受控运行手册操作 PalHatchHelper 服务，绝不操作 Palworld 或 mihomo 容器。

设计规格与分阶段计划位于 `docs/superpowers/`。
