# PalHatch Helper Agent

Python 3.12 私有 Agent。Phase 2.5 在任务租约和数据库 Adapter 之上增加统一游戏目录的规范化校验、不可变制品、批次导入、精确版本读取和 SQLite 缓存；仍不读取真实存档、不解析游戏包、不搜索配种路线，也不调用 AI。

```bash
uv sync --dev
uv run pal-hatch-helper api
uv run pal-hatch-helper job-worker
uv run pal-hatch-helper save-worker
uv run pal-hatch-helper catalog --help
```

- `api` 默认只绑定 `127.0.0.1:18765`，只暴露 `/healthz` 和 `/readyz`。
- `job-worker` 已有完整轮询主循环，但 Phase 2 没有真实 `BreedingJobHandler`，因此默认安全拒绝启动，不会领取后伪造算法结果。测试通过 Fake Handler 注入运行。
- `save-worker` 只保留 Phase 3 命令边界并返回稳定的未实现错误，不读取任何存档。
- `catalog validate` 可离线校验规范目录；stage/publish/rollback/warm-cache/inspect 需要显式测试 Supabase Service Role。目录命令没有真实 `extract` 子命令。

游戏目录环境变量和操作流程见 `docs/operations/game-catalog.md`。未配置目录不会让现有健康/readiness 整体失败。

本地 Supabase 集成测试只接受回环 URL：

先执行 `supabase db reset`，再从本地 Supabase 状态中读取测试 URL 和本地 service-role；集成测试会拒绝非回环 URL：

```bash
eval "$(supabase status -o env)"
TEST_SUPABASE_URL="${API_URL}" \
  TEST_SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY} \
  uv run pytest -m integration
```
