# PalHatch Helper Agent

Python 3.12 私有 Agent。Phase 2 提供 Supabase RPC Repository、任务租约/心跳/回收、单并发 Job Worker、结构化日志和三种进程入口；仍不读取存档、不解析、不搜索配种路线，也不调用 AI。

```bash
uv sync --dev
uv run pal-hatch-helper api
uv run pal-hatch-helper job-worker
uv run pal-hatch-helper save-worker
```

- `api` 默认只绑定 `127.0.0.1:18765`，只暴露 `/healthz` 和 `/readyz`。
- `job-worker` 已有完整轮询主循环，但 Phase 2 没有真实 `BreedingJobHandler`，因此默认安全拒绝启动，不会领取后伪造算法结果。测试通过 Fake Handler 注入运行。
- `save-worker` 只保留 Phase 3 命令边界并返回稳定的未实现错误，不读取任何存档。

本地 Supabase 集成测试只接受回环 URL：

先执行 `supabase db reset`，再从本地 Supabase 状态中读取测试 URL 和本地 service-role；集成测试会拒绝非回环 URL：

```bash
eval "$(supabase status -o env)"
TEST_SUPABASE_URL="${API_URL}" \
  TEST_SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY} \
  uv run pytest -m integration
```
