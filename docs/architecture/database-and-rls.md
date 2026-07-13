# 数据库模型与 RLS 边界

## 范围

Phase 1 只建立 Supabase PostgreSQL 数据结构、权限和共享契约。数据库中不保存完整原始存档，不实现存档解析、Agent Worker 或配种搜索算法，也没有执行生产迁移。

## 关系模型

```text
auth.users ── profiles
    │             │
    └── player_bindings ── players ── guilds ── worlds
                                │                   │
                                │                   ├── latest_snapshot_id
                                │                   └── active_breeding_version_id
                                │
inventory_snapshots ── pal_snapshot_items
                                │
                        pal_share_preferences

breeding_data_sources ── breeding_data_versions ── breeding_recipes
                                      │
scoring_profiles ── breeding_jobs ── breeding_plans ── breeding_routes
                          │                                  │
                  fixed snapshot/version              breeding_steps
                                                             │
                                                step_offspring_candidates
```

世界、公会、玩家、快照和条目使用复合外键阻止跨世界关联。游戏玩家 UID 只在所属世界内唯一；昵称仅用于显示。一个 Auth 用户和一个游戏玩家只能各自出现在一条绑定中。

## 不可变与版本固定

- `inventory_snapshots` 和 `pal_snapshot_items` 插入后由触发器拒绝 update/delete。解析流程必须在完整结果可用后一次写入最终状态；失败记录单独插入，不能部分修改成功快照。
- `worlds.latest_snapshot_id` 只能指向同世界 `published` 快照。
- 同一世界的成功存档哈希唯一；已发布配种版本和其中配方不可修改或删除；发布新版本只切换世界 active 指针。
- `breeding_jobs` 固定 inventory snapshot、breeding data version、algorithm version 和 scoring profile version。历史任务通过 restrict 外键保留原引用。
- 配方父母使用 generated columns 按字典序归一化，唯一约束把 `A × B` 与 `B × A` 视为同一组合。

## 库存共享语义

共享偏好和快照条目分表保存。不存在 `pal_share_preferences` 行时，受控查询使用 `coalesce(..., true)`，语义为默认可共享。偏好同时保存 `owner_player_id_at_set`；后续存档同步阶段发现实例所有者变化时，可据此重置为 true。

`pal_snapshot_items` 基础表不会向普通玩家暴露同公会他人行。普通玩家读取：

- 自有完整当前库存：基础表受 RLS 保护，只允许 latest snapshot 且 owner 为当前绑定玩家。
- 同公会共享库存：只能调用 `list_available_pals('all'|'mine'|'shared')`，函数返回固定字段，不包含 `raw_metadata`。
- 其他公会、owner/guild 未解析、明确关闭共享的条目：受控查询均排除。

## 身份与授权矩阵

| 资源              | 普通玩家                    | 管理员                      | Service Role       |
| ----------------- | --------------------------- | --------------------------- | ------------------ |
| profile / binding | 只读自己                    | 读取全部，绑定通过 RPC      | 数据同步所需访问   |
| 玩家与库存        | 自己完整、同公会共享投影    | 全服读取                    | 同步写入           |
| 分享偏好          | 只通过自有实例 RPC          | 后续管理 RPC                | owner 变化时重置   |
| 配种版本          | 读取 active/历史任务版本    | 只写 staging、通过 RPC 发布 | 拉取和校验写入     |
| 任务与结果        | 创建/读取自己；有限步骤 RPC | 读取全部                    | 专用租约和结果写入 |
| Worker 锁字段     | 无读写入口之外的写权限      | 不直接修改                  | 仅 Agent RPC       |

表级 grant 和 RLS 同时生效。玩家没有 `breeding_jobs` insert/update 权限，因此不能绕过创建 RPC 传入 requester、snapshot、version 或 algorithm。普通用户也没有 profile update 权限，不能把自己的 role 改为 admin。

## 安全函数

公开辅助函数为 `is_admin()`、`current_player_id()` 和 `current_guild_id()`。计划所有权判断位于未暴露给 PostgREST 的 `private` schema。所有 `SECURITY DEFINER` 函数：

- 固定 `search_path = pg_catalog, public`；
- 使用 schema-qualified 对象；
- 校验空值、长度、枚举和当前身份；
- 先 revoke 默认 execute，再只授予 `authenticated` 或 `service_role`；
- 使用稳定大写错误码，如 `ADMIN_REQUIRED`、`PAL_NOT_OWNED`、`JOB_LOCK_NOT_OWNED`。

Service Role 专用函数还检查 JWT role，不能只依赖函数授权。浏览器和 Next.js 客户端永远不能持有 Service Role Key。

## 核心 RPC

- `create_breeding_job`：从 `auth.uid()` 和绑定推导玩家，固定 published 快照、published 配种版本以及 active 评分/算法版本；排序被动并生成 SHA-256 fingerprint；相同幂等请求返回已有任务。
- 幂等键与 fingerprint 必须一一对应；即使两个请求在唯一约束处并发竞争，冲突回读也会再次校验 fingerprint。
- `set_pal_share_enabled`：只在当前世界 latest published 快照验证实例当前 owner 后 upsert。
- `list_available_pals`：严格接受三种 scope，输出字段裁剪后的可用池。
- `update_breeding_step_status` / `confirm_step_offspring`：校验计划所有权和有限状态转换，候选确认保存真实实例 UID。
- 管理员 RPC：绑定、解绑以及发布/切换 validated 配种版本，管理员身份只从数据库读取。客户端不能直接插入 published 版本或修改 validated 配方。
- Agent RPC：claim、heartbeat、complete、fail、release stale。claim 使用 `FOR UPDATE SKIP LOCKED` 并原子增加 attempt，complete 可安全重试。

## 索引依据

索引围绕 world/UID 唯一性、latest snapshot owner/guild 列表、被动 GIN 查询、任务 requester 历史、pending claim 队列和失效 heartbeat 建立。活动任务 fingerprint 使用 partial unique index，避免重复点击并行创建相同工作。
