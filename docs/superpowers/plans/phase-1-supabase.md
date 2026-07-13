# Phase 1：Supabase 数据模型、RLS、RPC 和共享契约执行计划

- 日期：2026-07-13
- 分支：`feat/phase-1-supabase`
- 唯一需求来源：`docs/superpowers/specs/2026-07-13-palworld-breeding-system-design.md`
- 阶段边界：只实现本地数据库语义、测试数据和共享契约；不实现 Worker、存档解析、配种搜索、产品页面、生产连接、部署、提交或推送。

## 基线结论

Phase 0 已由提交 `abf59d8` 建立 pnpm、uv、Supabase 目录、契约生成器和 CI 骨架，开始本阶段时工作区干净。正式规格与总实施计划的 Phase 1 描述没有实质冲突；本计划按本轮任务补充受控库存查询、管理员绑定、完整 Agent 租约 RPC、六类测试身份和明确的补偿回滚步骤。

## 迁移顺序

迁移使用 UTC 时间戳命名并按以下依赖顺序从空库执行：

1. `20260713010000_identity_world_inventory.sql`
   - 创建扩展、数据库枚举、`profiles`、`worlds`、`guilds`、`players`、`player_bindings`、`inventory_snapshots`、`pal_snapshot_items`、`pal_share_preferences`。
   - 使用延迟外键补齐 `worlds.latest_snapshot_id`，创建新 Auth 用户默认 player profile 的触发器，使用触发器拒绝库存快照及其条目的更新和删除。
2. `20260713011000_breeding_data.sql`
   - 创建 `breeding_data_sources`、`breeding_data_versions`、`breeding_recipes`、`scoring_profiles`。
   - 使用生成列归一化父母顺序，补齐 `worlds.active_breeding_version_id`，保留历史版本。
3. `20260713012000_breeding_jobs_and_plans.sql`
   - 创建 `breeding_jobs`、`breeding_plans`、`breeding_routes`、`breeding_steps`、`step_offspring_candidates`。
   - 建立版本固定、幂等、租约、排名、步骤、候选与历史引用所需约束和索引。
4. `20260713013000_security_and_rls.sql`
   - 创建最小权限辅助函数，收紧表级授权，启用 RLS 并建立管理员、玩家、自有数据和计划所有权策略。
   - 基础 `pal_snapshot_items` 对普通用户只开放自有完整行；他人共享条目只通过字段裁剪的 RPC 返回，避免基础表泄露扩展元数据。
5. `20260713014000_rpc.sql`
   - 创建玩家、管理员和 Agent 专用 RPC，逐个固定 `search_path`，显式 revoke/grant，并验证调用 JWT 角色。

所有迁移只向前新增。本阶段在进入任何共享或生产环境前保持未部署状态；本地可通过 `supabase db reset` 从零重放。

## 表、枚举、约束和索引

### 身份、世界与库存

- `profile_role`：`admin`、`player`；新 Auth 用户始终生成 `player`，普通用户无 profile 更新授权。
- `profiles.id` 外键对应 `auth.users.id`；`player_bindings.user_id` 与 `player_id` 分别唯一，绑定目标用户和执行管理员均有外键。
- `worlds.world_uid` 唯一；`guilds(world_id, game_guild_uid)` 和 `players(world_id, game_player_uid)` 唯一。
- 复合外键保证玩家的公会属于同一世界、快照条目的玩家/公会属于同一世界。
- `inventory_snapshot_status` 使用 `pending`、`parsed`、`published`、`failed`、`rejected`；成功哈希按世界唯一，时间均为 `timestamptz`。
- `pal_gender`、`pal_location_type` 为枚举；快照内 `pal_instance_uid` 唯一，被动数组非空元素且无重复，`raw_metadata` 必须是 JSON object。
- 快照与条目均通过数据库触发器不可更新和删除；世界只把 `published` 快照设为 latest。
- 共享偏好主键为 `(world_id, pal_instance_uid)`，保存设置时所有者、更新人和时间；缺失记录由查询 `coalesce(..., true)` 解释为默认共享。

### 配种数据

- 来源、版本和配方字段使用 `breeding_source_type`、`breeding_data_status`、`breeding_recipe_type` 枚举。
- `content_hash` 唯一；published 版本必须具有发布人和发布时间，未发布版本不得伪造完整发布元数据。
- 生成列保存父母 ID 的字典序归一值，并用 `(version_id, normalized_parent_a, normalized_parent_b, recipe_type)` 唯一约束阻止父母交换后的重复。
- `scoring_profiles(version)` 唯一，权重必须为 JSON object；任务通过评分 profile 外键固定评分版本。
- 世界的 active 版本由管理员 RPC 设置且必须是 `published`，不级联删除历史数据。

### 任务、方案与执行步骤

- 优化模式、任务状态、步骤状态均使用数据库 enum。任务状态覆盖 `pending`、`processing`、`algorithm_completed`、`ai_enriching`、`retry_pending`、`completed`、`failed`、`cancelled`；步骤状态覆盖正式规格七种状态。
- `desired_passive_ids` 长度为 0 至 4、元素非空且无重复；`algorithm_version` 和评分版本只能由 RPC/Agent 固定。
- 幂等键非空并唯一；另建活动任务唯一索引，防止相同固定输入并行存在。
- 锁字段一致性检查要求 processing 类状态具有完整租约，attempt 非负，完成时间与终态一致。
- `breeding_plans.job_id` 唯一；推荐路线使用延迟外键，防止跨 plan 推荐。
- 路线 rank 在 plan 内唯一且大于零，评分区间、代数、尝试数和借用数均受约束，`score_breakdown` 必须是 JSON object。
- step index 在 route 内唯一；真实父母实例保存为 UID，确认子代保存为 UID；被动数组受同样边界约束。
- 候选主键为 `(step_id, pal_instance_uid, detected_snapshot_id)`，禁止同一步骤/快照重复实例，并保证检测快照世界与任务固定世界一致。
- 所有外键删除行为显式选择 restrict 或 cascade：历史固定版本/快照使用 restrict，纯结果子树使用 cascade。

## RLS 与授权

### 辅助函数

- `is_admin()`：根据 `auth.uid()` 查询 profile；`SECURITY DEFINER`、`search_path = pg_catalog, public`、stable，仅授予 authenticated。
- `current_player_id()`：根据当前用户唯一绑定返回 player；同样固定 search path，仅授予 authenticated。
- `current_guild_id()`：由当前 player 读取 guild；同样固定 search path，仅授予 authenticated。
- 内部 owner/plan 判断函数不授予客户端 execute，只供策略和 RPC 使用。

### 普通玩家

- 可选择自己的 profile 和绑定；不可直接更新 profile/绑定。
- 可读取自己的 player、公会/世界最小上下文、latest published 快照元数据、自有完整 `pal_snapshot_items`。
- 同公会共享条目不从基础表读取，必须调用字段裁剪的 `list_available_pals(scope)`，因此不暴露 `raw_metadata` 或其他完整库存字段。
- 共享偏好不能直接写，只能调用 `set_pal_share_enabled`；函数验证 latest published 快照中的当前所有者。
- 任务不能直接插入或更新；只能调用 `create_breeding_job`。可读取自己的任务和其计划/路线/步骤/候选。
- 步骤不能任意改算法字段，只能通过允许状态转换的 RPC 修改状态并通过确认 RPC 绑定真实候选。
- 配种来源、版本、配方、评分、任务锁、算法结果均无客户端写权限。

### 管理员

- RLS 允许管理员读取全部业务表。
- 管理动作通过数据库验权的 RPC 完成：绑定/解绑、发布或切换配种版本；不能由参数伪造管理员身份。
- 只对需要后台管理的表授予受 RLS 保护的必要写权限，库存不可变触发器对管理员同样生效。

### Agent / Service Role

- Service Role 可绕过 RLS写入同步与算法结果，但领取、心跳、完成、失败和过期回收只能通过 Agent 专用 RPC。
- Agent RPC 在函数内检查 `auth.jwt()->>'role' = 'service_role'`，不把 execute 授予 authenticated；所有 `SECURITY DEFINER` 函数固定 search path。

## RPC

- `create_breeding_job(target_pal_id, desired_passive_ids, optimization_mode, idempotency_key)`：从 `auth.uid()` 和绑定推导 requester/player/guild，从玩家世界读取 published latest snapshot 与 active published 配种版本，从 active scoring profile 固定算法和评分版本；规范化被动和幂等输入，复用相同活动任务，返回 `{job_id, reused}`。
- `set_pal_share_enabled(pal_instance_uid, enabled)`：仅在当前玩家世界的 latest published 快照验证实例当前归属后 upsert 偏好，并保存 owner-at-set 以供 Phase 3 所有者变化时重置。
- `list_available_pals(scope)`：只接受 `all`、`mine`、`shared`；返回自己的完整业务必要字段和同公会已共享条目的最小必要字段，不返回 raw metadata。
- `update_breeding_step_status(step_id, status)`：验证计划属于当前用户且只允许玩家状态转换，不允许篡改算法字段。
- `confirm_step_offspring(step_id, pal_instance_uid, detected_snapshot_id)`：验证候选属于自己的计划，原子确认唯一候选并更新步骤真实子代与完成状态。
- `claim_breeding_job(worker_id)`：仅 Service Role；使用 `FOR UPDATE SKIP LOCKED` 选择 pending/retry_pending，原子写 processing、锁、心跳和 attempt。
- `heartbeat_breeding_job(job_id, worker_id)`、`complete_breeding_job(job_id, worker_id)`、`fail_breeding_job(job_id, worker_id, error_code, retryable)`：仅 Service Role；校验当前锁拥有者和合法状态，使用稳定错误码。
- `release_stale_breeding_jobs(stale_before)`：仅 Service Role；将失效租约回收到 retry_pending 并清空锁。
- `admin_bind_player(user_id, player_id)`、`admin_unbind_player(user_id)`：仅数据库确认的管理员调用，维护一对一绑定和审计字段。
- `admin_publish_breeding_version(world_id, version_id)`：仅管理员，把 validated 版本发布并切换 world active 指针；历史版本不删除。

## 共享契约生成

- JSON Schema 是 `breeding-job`、`pal-list-item`、`system-status` 的业务契约源；保留 Phase 0 readiness Schema。
- Node 生成器从 Schema 生成 TypeScript 文件并生成 Python Pydantic 模型模块，两个产物带“禁止手改”标记；根脚本提供生成和漂移检查。
- `database.types.ts` 优先由本地 Supabase CLI 在重建数据库后生成；若 CLI 的 postgres-meta 容器不可用，可使用仓库中强制拒绝非回环 URL 的 catalog introspection 生成器，产物仍必须来自真实重建 schema，不能用手工 DTO 冒充生成结果。
- AJV 测试验证 Schema 结构、日期格式、0 至 4 个被动和优化模式；Python pytest 对同一合法/非法 fixture 验证 Pydantic 行为。

## 测试身份矩阵

Seed 与 pgTAP 使用固定虚构 UUID，绝不使用真实玩家、UID 或秘密：

| 身份                 | 世界/公会/绑定                       | 主要允许行为                                       | 主要拒绝行为                          |
| -------------------- | ------------------------------------ | -------------------------------------------------- | ------------------------------------- |
| admin                | world_local / 管理员 profile         | 全服读取、绑定、版本发布                           | 直接修改不可变快照                    |
| player_a             | world_local / guild_alpha / player_a | 自有完整库存、同公会共享、创建自己任务、改自有共享 | 他人完整库存、他人共享修改、角色提升  |
| player_b_same_guild  | world_local / guild_alpha / player_b | 与 player_a 对称                                   | 读取 player_a 未共享条目              |
| player_c_other_guild | world_local / guild_beta / player_c  | 自有库存和本公会共享                               | guild_alpha 共享池                    |
| unbound_user         | 无玩家绑定                           | 读取自己的 profile                                 | 创建任务、读取库存                    |
| service_role         | JWT role service_role                | 领取、心跳、完成、失败、回收                       | 通过 authenticated 权限暴露 Agent RPC |

测试覆盖本轮列出的 15 项权限/RPC场景，并增加枚举、数组、父母归一化、不可变快照、字段裁剪、非法状态转换和输入校验。并发领取通过两个独立会话/事务证明同一任务只返回一次；历史引用测试在切换 active 版本和 latest snapshot 后确认旧 plan 仍引用原版本。

## Seed

`supabase/seed.sql` 以确定性虚构 UUID 创建一个世界、两个公会、三名游戏玩家、管理员与四个普通测试用户、绑定、少量 published 快照、共享/非共享实例、一个 published 配种版本、一个 scoring profile、少量人工测试配方以及 pending/processing/completed 任务样例。Auth 测试用户使用仅本地固定邮箱和不可用于任何生产系统的固定测试密码哈希；文件不包含 anon/service role key。

## 验证命令

按顺序执行并保存真实结果：

```bash
node --version
pnpm --version
python --version
uv --version
supabase --version
docker --version
supabase start
supabase db reset
supabase db lint
supabase test db
pnpm contracts:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cd apps/agent
uv run ruff check .
uv run ruff format --check .
uv run mypy src
uv run pytest
cd ../..
pnpm typecheck
pnpm test
pnpm check
git diff --check
git status --short
git diff --stat
```

若裸工具缺失，不使用 sudo，也不伪造通过；记录命令、错误、受影响验证和官方安装方向。若 Supabase 可通过项目本地工具无特权运行，则仅连接 `127.0.0.1` 本地实例。

## 回滚方式

- 本地开发：停止本项目本地 Supabase 后执行 `supabase db reset` 回到当前迁移集合；撤销本阶段代码时先人工审查 `git diff`，只删除未提交的 Phase 1 文件并恢复本阶段修改，不触碰 Phase 0 或用户改动。
- 已应用共享测试环境：不改写已应用迁移，追加补偿迁移，顺序为撤销新 RPC execute 权限、删除策略、删除 RPC/辅助函数、删除结果子表、删除任务表、清除 world 两个可空指针、删除配种/库存/身份表与枚举；应用保持上一兼容契约版本。
- 生产：本阶段明确不执行生产迁移。未来上线必须先备份、在升级副本重放并获得独立批准；历史快照、配种版本和方案不得用级联回滚删除。
