# Phase 8 管理员与生产文件评审

评审日期：2026-07-17

模式：`DEVELOP_ADMIN`

基线：`b41dbd54f371502b7d24bdc368420248a418f437`

分支：`agent/phase-8-admin-production`

## 结论

Phase 8 第一轮管理员功能、受控 Agent 命令队列、共享契约和生产部署文件已经完成。本轮只在本地开发栈验证，没有连接生产 Supabase/Vercel、没有写入 `/opt/services/palworld-manager`、没有读取或修改真实存档，也没有操作 Palworld 或 mihomo。

```yaml
phase_8:
  admin_implementation: completed
  automated_gates: passed
  production_deploy: completed
  end_to_end_acceptance: completed
  first_release: completed
```

## 管理员功能

- `/admin`：Agent、Save Worker、Job Worker、Candidate Detector 心跳，最近快照、Parser、目录版本、任务计数、AI 降级、失败安全摘要、磁盘分级和部署版本。
- `/admin/bindings`：用户安全摘要、游戏玩家、搜索、创建/修改/解除绑定、冲突与乐观并发、绑定历史。
- `/admin/save-parser`：保存同步/Parser/磁盘/保留状态，以及安全同步、已有 Agent 快照重解析、异常下降批准或拒绝、过期 Agent 快照清理命令。
- `/admin/breeding-data`：目录版本、七类计数、来源/provenance/diff、私有标准化 tar.zst 上传，以及 validate、stage、publish、rollback、inspect、warm-cache、reject。
- `/admin/jobs`：固定 snapshot/catalog 的任务摘要，重试、取消、确认后回收超时锁、任务创建开关和 Template Provider 自检。
- `/admin/settings`：非秘密运行设置的版本化更新、硬上限、乐观并发、审计和上一版本回滚；秘密只显示配置状态与检查时间。

所有页面和管理员动作都使用服务端用户 JWT 调用 `is_admin`/管理员 RPC；数据库动作再次校验角色。管理员页面强制动态、`no-store`、`Vary: Cookie`，没有 Service Role，普通玩家得到稳定 `ADMIN_ACCESS_DENIED`。页面覆盖 loading、empty、error、stale，表格在 iPhone 宽度内局部滚动，动作不依赖 hover。

## Migration、RPC 与 RLS

只增加了两个向前 migration：

- `20260717010000_phase8_admin_foundation.sql`
- `20260717011000_phase8_admin_catalog_operations.sql`

新增/扩展内容包括不可变 `admin_audit_events`、`player_binding_events`、`agent_commands`、`agent_command_results`、Worker 心跳、`runtime_settings_versions`、`deployment_records`、管理员目录上传/操作队列和绑定并发版本。普通玩家不能读取管理员表，浏览器不能直接写命令内部字段，Agent 只以 Service Role 领取和完成必要队列记录。

绑定 RPC 使用双向唯一约束、幂等键和期望版本；设置 RPC 使用不可变版本与硬上限；目录 publish 只允许 validated version，rollback 只切换 world pointer；任务动作不能修改路线、配方、score 或固定版本。所有新增 RPC 固定 `search_path`，返回稳定错误码，并写不可更新/删除的审计事件。

首次管理员由幂等 `bootstrap_first_admin` RPC 根据环境中的现有邮箱执行：不创建密码、不修改其他用户、有其他管理员时拒绝扩大权限。

## 共享契约

`packages/contracts/schema/phase8-admin.schema.json` 是 Phase 8 单一 JSON Schema，生成 TypeScript 与 Pydantic，覆盖：

- `AdminOverview`
- `AdminBindingCandidate` / `AdminBindingEvent`
- `AdminSaveParserStatus`
- `AdminCatalogVersion` / `AdminCatalogAction`
- `AdminJobSummary` / `AdminJobAction`
- `RuntimeSettings` / `RuntimeSettingsVersion`
- `AgentCommandStatus`
- `AdminAuditEvent`
- `AdminError`

Web 的运行时解析和 Agent 的 Pydantic 模型都来自该契约；数据库类型生成白名单包含新增管理员 RPC。生成漂移检查通过。

## Agent command worker

新增 `command-worker`，只接受以下命令：

- `sync_save_once`
- `reparse_snapshot`
- `approve_inventory_snapshot`
- `reject_inventory_snapshot`
- `cleanup_expired_agent_snapshots`
- `retry_breeding_job`
- `cancel_breeding_job`
- `reap_stale_job_lock`
- `template_ai_healthcheck`
- `warm_catalog_cache`

未知类型以 `AGENT_COMMAND_NOT_ALLOWED` 拒绝。实现没有 `eval`、`shell=True`、用户路径、Docker/进程命令；领取使用租约和幂等结果，重启可恢复。目录上传处理只读取私有 Storage 的精确对象键，限制 64 MiB package、512 MiB 展开量、标准化成员白名单，并复用现有 Catalog validate/stage gateway。运行设置会约束 Job/AI 并发、Provider 顺序、Parser 超时和快照保留数，Template 始终作为降级后备。

## 生产文件与回滚

`infra/agent/docker-compose.production.yml` 包含 `api`、`job-worker`、`save-worker`、`command-worker`。四服务使用 UID/GID 10001、只读根文件系统、`cap_drop: ALL`、`no-new-privileges`、PID/CPU/内存限制、日志轮转和 immutable `${AGENT_IMAGE}`；源存档、Palworld Compose 和 Parser bundle 只读，数据目录可写。API 仅发布到 `127.0.0.1:18765`，没有 host network 或 Docker socket。

部署文件包括：

- `infra/agent/.env.production.example`
- `backup-production.sh`
- `deploy-production.sh`
- `verify-production.sh`
- `rollback-production.sh`
- `bootstrap-admin.sh`

脚本均使用 `set -euo pipefail`、支持 `--dry-run`、校验工作目录/环境文件权限/Git SHA/镜像 digest/磁盘/端口，并只操作四个 PalHatchHelper Agent 服务。部署失败会使用记录的 previous immutable image 自动回切；显式回滚脚本执行相同的四服务边界。

Vercel 配置增加 CSP、HSTS 和其他安全 header，管理员/API 响应 `no-store`，健康路由展示 `VERCEL_GIT_COMMIT_SHA`。Production 浏览器变量清单只允许 Supabase URL、anon key 和 app URL。

完整生产顺序、备份、Supabase、目录发布、Agent、Vercel、bootstrap、smoke 与失败回滚见 [`docs/operations/production-deployment.md`](../operations/production-deployment.md)。

## 自动化结果

- `pnpm check`：通过；含格式、ESLint、TypeScript、43 个 Web 单测、24 个 contracts 单测、8 个 catalog 单测、Web production build、Agent Ruff/Mypy 和 200 passed / 4 skipped pytest、结构、禁用资产和秘密扫描。
- `supabase db reset`：从零应用全部 migration 并 seed 成功。
- `supabase db lint`：Phase 8 无 error；仅保留 Phase 6/7 历史函数的两个既有类型转换 warning。
- `supabase test db`：13 个文件、358 个 pgTAP 全部通过；Phase 8 文件含 47 个断言。
- `pnpm contracts:check`：生成漂移检查通过。
- `pnpm database:test:concurrency`：并发 claim 与幂等冲突检查通过。
- `pnpm check:phase5`：iPhone 项目 10/10，通过 Phase 5–8 完整 E2E。
- `docker compose ... config --quiet`：通过。
- `bash -n infra/agent/scripts/*.sh`：通过。

本地 E2E runner 在数据库 reset 后重启本地 Supabase Kong，避免其缓存已变化的 Auth 容器地址；并在测试期间暂停不参与 E2E 的本地 Studio、Analytics、Realtime、Inbucket 和 pg-meta，结束 reset 后恢复。Storage 保持运行供固定目录 artifact 验收使用。

## 第二轮仍需提供的生产值

只有用户明确把 MODE 改为 `DEPLOY_PRODUCTION` 后才可读取或使用：

- `/opt/services/palworld-manager/.env.production` 的生产 Supabase、Vercel、正式域名和镜像仓库配置。
- immutable Agent `repository:git-sha@sha256:digest`。
- 生产 world ID/UID、只读保存根、Parser bundle/版本/命令。
- `BOOTSTRAP_ADMIN_EMAIL` 对应的现有 Supabase 用户。
- 当前生产 backup、catalog pointer、Vercel deployment 和 previous Agent image 参考。

本评审不代表生产部署或端到端生产验收完成。
