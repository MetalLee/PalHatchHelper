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
