# PalHatch Helper Agent

Python 3.12 私有 Agent。Phase 3 在任务租约和统一游戏目录之上增加只读快照复制、受限 Parser 子进程、CanonicalSnapshot 校验、失败记录和原子库存发布。仓库测试只读取全合成脱敏 fixture；不读取真实 Palworld 存档、不解析游戏包、不搜索配种路线，也不调用 AI。

```bash
uv sync --dev
uv run pal-hatch-helper api
uv run pal-hatch-helper job-worker
uv run pal-hatch-helper save-worker
uv run pal-hatch-helper catalog --help
```

- `api` 默认只绑定 `127.0.0.1:18765`，只暴露 `/healthz` 和 `/readyz`。
- `job-worker` 已有完整轮询主循环，但 Phase 2 没有真实 `BreedingJobHandler`，因此默认安全拒绝启动，不会领取后伪造算法结果。测试通过 Fake Handler 注入运行。
- `save-worker` 已实现 Phase 3 同步闭环；缺少数据库、明确确认的绝对路径、世界或 Parser 配置时返回 `SAVE_WORKER_CONFIGURATION_REQUIRED`，路径不存在或不安全时返回 `SAVE_PATH_NOT_CONFIRMED`。
- `catalog validate` 可离线校验规范目录；stage/publish/rollback/warm-cache/inspect 需要显式测试 Supabase Service Role。目录命令没有真实 `extract` 子命令。

游戏目录环境变量和操作流程见 `docs/operations/game-catalog.md`。未配置目录不会让现有健康/readiness 整体失败。

Save Worker 配置、只读协议、失败行为和保留策略见 `docs/operations/save-sync.md`。API `/readyz` 只反映 API/数据库边界，不会因为 Save Worker 未配置而从 200 回退为 503；响应中的 `save_worker_configured` 单独报告该命令是否可启动。

本地 Supabase 集成测试只接受回环 URL：

先执行 `supabase db reset`，再从本地 Supabase 状态中读取测试 URL 和本地 service-role；集成测试会拒绝非回环 URL：

```bash
eval "$(supabase status -o env)"
TEST_SUPABASE_URL="${API_URL}" \
  TEST_SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY} \
  uv run pytest -m integration
```
