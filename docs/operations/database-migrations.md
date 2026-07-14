# 数据库迁移规则

## 新增迁移

文件使用 UTC 时间戳和单一职责命名：

```text
supabase/migrations/YYYYMMDDHHMMSS_description.sql
```

已应用文件不可修改。任何修复都追加更晚的向前迁移；需要撤销时追加补偿迁移。正式规格优先于实施计划。

新增迁移前后按固定流程执行：

```bash
git status --short
supabase db reset
supabase db lint
supabase test db
pnpm database:types
pnpm typecheck
pnpm test
git diff --check
git diff --stat
```

## Phase 1 顺序

1. `20260713010000_identity_world_inventory.sql`：枚举、身份、世界、公会、玩家、不可变库存和共享偏好。
2. `20260713011000_breeding_data.sql`：来源、版本、归一化配方、评分 profile 和 world active 指针。
3. `20260713012000_breeding_jobs_and_plans.sql`：任务租约、方案、路线、步骤和候选。
4. `20260713013000_security_and_rls.sql`：辅助函数、grant、private schema 和全部 RLS。
5. `20260713014000_rpc.sql`：玩家、管理员和 Service Role RPC 以及逐函数授权。
6. `20260714010000_phase2_worker_lifecycle.sql`：Phase 2 Worker fencing token 与恢复生命周期。
7. `20260714020000_versioned_game_catalog.sql`：Phase 2.5 统一游戏数据、目录投影、批次导入、发布/回滚、RLS 与私有制品 Bucket。
8. `20260714030000_phase3_inventory_sync.sql` 至 `20260714032000_phase3_inventory_hardening.sql`：Phase 3 库存原子发布、目录 lookup、失败元数据、service-role JWT 双重校验与乱序水位。
9. `20260714040000_phase4a_breeding_data_diff.sql`：Phase 4 配种事实差异审查。
10. `20260715010000_phase4_review_hardening.sql`：Phase 4 评审 BLOCKER/HIGH 修复，包括 v2 评分注册表、受审计来源、精确运行事实 RPC、稳定 ID/目录成员约束和统一目录发布门禁。
11. `20260715020000_phase5_web_foundation.sql`：Phase 5 浏览器安全库存分页/筛选投影、固定活动目录版本的本地化显示/搜索和同步状态摘要；不放宽基础表 RLS，也不新增未经目标规模验证的索引。

Phase 5 的不透明分页游标固定 `snapshot_id + game_data_version_id + pal_id + pal_instance_uid`。评审发现原先仅扫描排序键的本地 `Index Only Scan` 不能代表包含权限候选集、目录/本地化连接、筛选、总数和分页的完整 RPC，因此已撤回 `pal_snapshot_items_page_order_idx`，不把小型 seed 的局部计划当作性能证据。`scripts/check-structure.mjs` 会拒绝该阻塞式普通索引重新混入 Phase 5 事务迁移。

若目标规模的完整 RPC 基准证明需要新索引，必须先保存可复现 SQL、合成数据规模、`EXPLAIN (ANALYZE, BUFFERS)` 与端到端延迟，再使用单独获批的 `CREATE INDEX CONCURRENTLY` 非事务迁移流程，并在库存发布并发执行时验证写入阻塞处于可接受范围。

Phase 2.5 迁移保留并镜像旧 `breeding_data_*`，优先复用 UUID，回填 world/job 新指针。空库 reset 时 seed 发生在迁移之后，因此兼容触发器也必须覆盖 seed 和旧代码的后续写入。验证升级时同时断言回填行数和历史任务版本不变。

`supabase/seed.sql` 不是迁移，只在 reset 后写入本地 fixture。

## SQL 审查规则

- 枚举和 check constraint 约束所有状态与输入边界，不接受任意状态字符串。
- 跨世界关系使用复合外键；历史快照/配种版本引用使用 restrict。
- 新业务表必须同时声明表级 grant、启用 RLS、添加正向与负向测试。
- 普通客户端不能直接写安全关键字段；使用校验 `auth.uid()`/数据库角色的 RPC。
- `SECURITY DEFINER` 必须固定 search path、schema-qualify 对象、校验输入并显式 revoke/grant。
- 迁移、Seed 和测试不得包含生产 URL、真实 UID、真实存档内容或秘密。
- 配方和算法事实只能来自后续人工验证的数据流程；迁移只定义结构。

## 类型漂移

表、枚举、RPC 签名变化后先 reset，再生成 `packages/contracts/src/database.types.ts`。业务请求/响应字段变化先修改 JSON Schema，再运行 `pnpm contracts:generate`。不得在 TypeScript 和 Python 各自手工维护 DTO。

## 回滚

本地回滚首选恢复代码到上一审查版本后 `supabase db reset`。这只影响本项目的本地数据库。

共享测试环境必须新增补偿迁移，按依赖反序处理：

1. revoke 新 RPC execute；
2. 删除新 policy；
3. 删除 RPC 和辅助函数；
4. 删除候选、步骤、路线、方案和任务结果子树；
5. 清空 world 的 snapshot/version 指针；
6. 在确认没有历史引用后处理配种、库存和身份对象；
7. 重新生成并发布上一兼容契约。

不得用 cascade 删除历史快照、已发布配种版本或历史方案。生产迁移在 Phase 1 尚未执行；未来必须先备份、在升级副本演练、准备补偿迁移并获得明确审批。
