# Phase 2：Python Agent、任务轮询与恢复执行计划

- 日期：2026-07-14
- 分支：`feat/phase-2-agent`
- 唯一需求来源：`docs/superpowers/specs/2026-07-13-palworld-breeding-system-design.md`
- 阶段边界：只实现私有 Agent 的数据库访问、任务租约、轮询恢复、进程入口和脱敏观测；不读取存档、不实现 ParserAdapter、配种搜索或 AI，不连接生产 Supabase，不部署或推送。阶段验收通过后，仅按用户明确批准提交并本地合入 `main`。

## 基线结论

Phase 1 已提供任务表以及 Service Role 专用的原子领取、心跳、完成、失败和超时回收 RPC，领取使用 `FOR UPDATE SKIP LOCKED`。当前 Agent 只有 FastAPI 健康接口和基础配置，没有 CLI、Repository、Worker、退避或结构化日志。Phase 1 的状态枚举包含 `cancelled`，但租约只校验 Worker ID，且缺少持有租约时的取消和优雅停止主动释放 RPC；本阶段使用新的前向迁移补充每次领取唯一的 fencing token，并补齐取消和释放语义，不改写 Phase 1 迁移。

## 交付顺序

1. 先为 Repository/DatabaseClient、任务模型、退避、Worker 生命周期、SIGTERM、日志脱敏、CLI 边界、健康摘要和数据库权限编写失败测试。
2. 新增只依赖 `httpx` 的 Supabase REST/RPC Adapter；不引入重量级 Supabase SDK。
3. 实现 `JobClaim`、`JobLease`、`JobHeartbeat`、`JobExecutionResult`、`StructuredError` 和稳定错误码。
4. 实现单并发 `JobWorker`、周期 heartbeat、`StaleJobReaper`、有上限指数退避与抖动、Handler 异常隔离和优雅停止。
5. 新增租约持有者取消与主动释放 RPC；主动释放不把未完成的关停计入业务重试次数。
6. 建立 `api`、`job-worker`、`save-worker` 三个命令边界。Phase 2 不实现真实 Save Worker 或真实 `BreedingJobHandler`；测试用 Fake Handler 验证完整生命周期。
7. 运行 Agent 局部验证、本地 Supabase 数据库/RPC/权限验证、契约生成与 Phase 0/全仓回归，最后检查 Git diff 和秘密扫描。

## 关键语义

- Repository 只调用 Phase 1/2 Agent RPC，不直接更新任务租约字段。
- 每次领取生成新的 `lease_token`；心跳、完成、失败、取消和主动释放必须同时校验 Job ID、Worker ID 与 token，旧进程即使复用相同 Worker ID 也不能修改新租约。
- Worker 启动及周期运行 stale reaper；失效 heartbeat 按数据库 `max_attempts` 进入 `retry_pending` 或 `failed`。
- 心跳请求设独立超时并在租约安全余量前停止 Handler；心跳间隔、请求超时和安全余量之和必须严格小于租约时长。
- Handler 成功、可重试失败、不可重试失败和取消分别映射到完成、重试/失败、失败和取消 RPC。
- 收到 SIGTERM 后立即停止领取；当前 Handler 在宽限期内可完成，超时则取消本地执行并主动释放租约。
- 数据库暂时不可用使用有上限指数退避；一次成功访问后重置退避。不可重试的权限或契约错误立即停止领取或心跳处理，不以重试掩盖永久故障。
- 日志只记录稳定事件、错误码、Worker ID、Job ID 和计数，不记录 Service Role、Authorization 头、任务敏感载荷或数据库原始错误体。
- API 只提供 `/healthz`、`/readyz`，readiness 返回脱敏的数据库和 Worker 基础配置布尔摘要，不提供任务 API。
- Supabase 运行地址必须使用 HTTPS；仅开发和测试环境的回环地址允许 HTTP。

## 预计文件

- `apps/agent/src/pal_hatch_helper/{cli,workers,repositories,models,observability}/**`
- `apps/agent/tests/{repositories,workers}/**` 及 CLI、配置、日志、健康测试。
- `supabase/migrations/20260714010000_phase2_worker_lifecycle.sql`
- `supabase/tests/{rpc,rls}.sql`、生成的数据库类型和 readiness 共享契约。
- Agent/infra 运行说明与 Compose 三进程边界。

## 验证命令

```bash
cd apps/agent
uv run pytest tests/repositories tests/workers tests/test_cli.py tests/test_observability.py
uv run ruff check .
uv run ruff format --check .
uv run mypy src tests
cd ../..
supabase db reset
supabase db lint
supabase test db
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' pnpm database:test:concurrency
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' pnpm database:types
eval "$(supabase status -o env)"
(cd apps/agent && TEST_SUPABASE_URL="${API_URL}" TEST_SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY} uv run pytest -m integration)
pnpm contracts:generate
pnpm contracts:check
pnpm check
git diff --check
git status --short
git diff --stat
```

若 Supabase CLI 不可用，只允许通过项目级临时工具安装并连接 `127.0.0.1`；仍不可用时必须报告缺失工具、未覆盖验证和安装方式，不得连接远程项目或伪造通过。

## 回滚

- 停止本地测试 Worker；pending/retry_pending 任务保留，现有 processing 任务由 stale RPC 回收。
- 本地数据库通过 reset 回到迁移集合；共享环境只能追加补偿迁移，先撤销新函数 execute 权限，再删除 Phase 2 RPC，绝不修改已应用的 Phase 1 迁移。
- 只撤销本阶段提交或未提交修改；不触碰 `/opt/palworld`、真实存档、生产凭证、生产 Supabase、远程仓库或部署目录。
