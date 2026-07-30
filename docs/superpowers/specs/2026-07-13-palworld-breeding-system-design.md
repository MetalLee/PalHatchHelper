# PalHatch Helper 第一版系统设计

- 2026-07-31 Catalog 2.0、物品库存与递归配方修订：design=approved、implementation=in_progress、production_deploy=not_started
- 修订状态：2026-07-31 公共 Sync 世界身份、存档发现与公会有效性修订 design=approved、implementation=completed、affected_automated_gates=passed、production_deploy=not_started
- 文档状态：已完成设计评审；2026-07-30 Landing 轮播真实名称与配方修订 design=approved、implementation=completed、affected_automated_gates=passed、browser_acceptance=passed、production_deploy=not_started；2026-07-30 公开双语首页与搜索引擎收录修订 design=approved、implementation=completed、affected_automated_gates=passed、browser_acceptance=passed、production_deploy=not_started；2026-07-29 顶部品牌、数据徽标与 GitHub 入口修订 design=approved、implementation=completed、affected_automated_gates=passed、browser_acceptance=passed、production_deploy=not_started；2026-07-29 未绑定引导、Steam 头像与导航收口修订 design=approved、implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-28 中英文 i18n 与语言路由修订 design=approved、implementation=in_progress、production_deploy=not_started；2026-07-28 全局被动单排交替三角纹理修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-28 已选被动定宽与计划卡片左对齐修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-28 计划网格与配种被动布局修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-28 配种工作台目标与被动布局、五代上限和 Phase 5 验收提速修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-28 我的计划与配种路线视觉收口修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-27 配种工作台创建页聚焦与被动效果说明修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-27 全局被动品级视觉与库存被动多选修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-27 帕鲁库存用户语言、目录 ID 隐藏、卡片密度/阴影与视口分页修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-27 路线语义去重、2000+ 库存容量与“我的计划”收藏化修订 implementation=completed、automated_gates=passed、production_deploy=completed；2026-07-24 库存快照 24 小时保留修订、Boss/公会库存修订和库存位置/次元帕鲁仓库修订已批准；Phase 4 implementation=completed、automated_gates=passed、real_data_acceptance=completed、local_test_publish=completed、production_publish=not_started；Phase 5 implementation=completed、automated_gates=passed；Phase 6 implementation=completed、automated_gates=passed、local_integration=completed、production_deploy=completed
- 日期：2026-07-13
- 代码仓库：`https://github.com/MetalLee/PalHatchHelper.git`
- 服务器端部署目录：`/data/projects/PalHatchHelper`
- 帕鲁服务器目录：`/opt/palworld`
- 前端部署：Vercel
- 用户、数据库与任务控制面：Supabase

## 1. 背景与目标

当前腾讯云广州 Ubuntu 服务器为 4 核 CPU、8 GB 内存、5 Mbps 公网带宽，已经通过 Docker Compose 运行《幻兽帕鲁》Dedicated Server，并通过 Docker 运行 mihomo。服务器已安装 Codex CLI。

第一版建设一个“帕鲁配种工作台”，从本地帕鲁存档中安全解析玩家、公会和帕鲁库存数据，根据玩家设定的目标帕鲁与最多四个期望被动，生成真实可执行的多代配种方案。

长期方向是逐步发展为帕鲁服务器总监控看板，但第一版必须优先完成以下闭环：

```text
同步真实库存
→ 选择目标帕鲁与期望被动
→ 计算合法候选路线
→ 比较去重后的方案
→ 收藏到“我的计划”
→ 随时查看已收藏路线
```

## 2. 第一版范围

### 2.1 必须实现

1. 使用 Supabase Auth 登录。
2. 管理员查看全服数据；普通玩家只查看绑定角色及完成配种所需的公会共享数据。
3. 管理员手动绑定 Supabase 用户与游戏玩家 UID。
4. 服务器 Agent 每五分钟检查存档变化，创建安全副本后解析。
5. 解析玩家、公会、帕鲁实例、所有者、性别、被动、头目标志和可证明的精确位置。
6. 公会帕鲁默认可共享，玩家可以主动关闭自己帕鲁的共享状态。
7. 玩家选择目标帕鲁和最多四个期望被动。
8. 确定性算法使用固定游戏数据版本中的配种关系计算合法路线。
9. 支持综合推荐、最快路线、最高成功率、最少借用四种评分模式。
10. 至少返回三条语义不同的可比较候选路线；库存不足时仍返回合法的缺口路线并明确所缺父本、母本、性别和被动要求。
11. 帕鲁种类、配方拓扑和目标被动分配相同的路线视为同一路线；个体、父母槽位性别/朝向、所有者、位置以及非目标被动身份不构成新路线。
12. 同一路线只保留一个真实库存代表，优先非目标干扰被动更少的组合，再使用既有成本和稳定键确定唯一结果。
13. 玩家可以把 `ready` 或 `needs_inventory` 路线收藏到“我的计划”，并以只读方式查看与移除；不维护人工进度、候选子代或步骤状态。
14. 统一游戏数据支持本地标准化、制品暂存、关系校验、管理员发布和回滚。
15. AI 只负责候选路线排序辅助和自然语言解释，不能创造配种关系。
16. 外部 AI API、Codex CLI 和本地模板组成三级降级链路。
17. 前端使用自定义域名访问 Vercel；大陆帕鲁服务器不开放新的公网 Web 端口。

### 2.2 明确不实现

1. 个体值优化。
2. 闪光、Boss 体型优化。
3. 主动技能继承优化。
4. 自动操作游戏、自动移动帕鲁或修改存档。
5. 实时地图和实时玩家位置。
6. DPS 统计。
7. 基地布局和生产效率分析。
8. 自动重启帕鲁服务器。
9. 每日主动配种推荐模式。
10. 终极个体多目标优化模式。
11. 配种计划人工推进、候选子代检测、子代确认和库存实例锁定。

## 3. 核心设计决策

| 领域 | 决策 |
|---|---|
| 第一版配种模式 | 目标驱动：目标帕鲁 + 最多 4 个期望被动 |
| 权限 | 管理员 + 普通玩家混合模式 |
| 库存范围 | 同公会共享库存 |
| 默认共享 | 新帕鲁默认可共享，玩家主动关闭 |
| 配种计算 | 确定性算法生成候选 + AI 辅助排序解释 |
| 游戏数据更新 | 原始提取层 + 不可变标准化包 + PostgreSQL 投影 + 管理员发布/回滚 |
| 前后端部署 | Vercel 前端 + Supabase 控制面 + 服务器私有 Agent |
| 服务器通信 | Agent 主动轮询 Supabase，不接受公网入站任务 |
| 存档同步 | 每 5 分钟检查，稳定后复制副本并解析 |
| 数据库库存保留 | 已被更新快照取代的标准化库存明细最多保留 24 小时；每个世界的最新有效库存始终保留 |
| 解析器 | ParserAdapter + 受控独立子进程 |
| 后端技术栈 | Python 3.12 + FastAPI + Pydantic |
| 用户绑定 | 第一版由管理员手动绑定 |
| 我的计划 | 路线收藏；保持“我的计划”产品语义，只读展示已收藏路线，不维护执行进度 |
| 默认优化 | 综合评分，并提供三个快捷优化模式 |

## 4. 总体架构

```text
玩家浏览器
    │
    ▼
Vercel · Next.js 前端与 BFF
    │
    ├── Supabase Auth
    ├── Supabase PostgreSQL
    ├── Supabase Realtime
    └── 受 RLS/RPC 保护的数据访问
            ▲
            │ HTTPS 主动出站轮询
            │
腾讯云广州服务器
/opt/services/palworld-manager
    ├── FastAPI 本地健康接口
    ├── Save Worker
    ├── ParserAdapter
    ├── Breeding Engine
    ├── AIProvider
    └── Job Worker
            │
            ▼
/opt/palworld
只读检查并复制存档，不修改原文件
```

### 4.1 网络边界

1. 域名只绑定 Vercel。
2. 腾讯云服务器不新增公开的 80、443 或业务 API 端口。
3. Agent 只通过 HTTPS 主动访问 Supabase 和外部 AI 服务。
4. FastAPI 仅绑定 `127.0.0.1:18765`，用于 SSH 运维和本地健康检查。
5. mihomo 的 7890 和 9090 继续只绑定宿主机回环地址。
6. 不修改 Docker daemon 全局代理，帕鲁容器不通过 mihomo。

### 4.2 一次配种任务的数据流

```text
用户提交目标与被动
→ Supabase 创建 pending 任务
→ Agent 原子领取任务
→ 固定库存快照、统一游戏数据和算法版本
→ 确定性算法搜索合法候选
→ 综合评分与路线排序
→ AIProvider 生成辅助解释
→ 保存计划、路线和评分明细
→ 前端实时或轮询显示结果
```

## 5. 单仓目录设计

```text
PalHatchHelper/
├── apps/
│   ├── web/                         # Next.js 前端，部署到 Vercel
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── overview/
│   │   │   ├── pals/
│   │   │   ├── breeder/
│   │   │   ├── plans/
│   │   │   ├── data-status/
│   │   │   └── admin/
│   │   └── lib/supabase/
│   └── agent/
│       ├── src/pal_hatch_helper/
│       │   ├── api/
│       │   ├── workers/
│       │   ├── save_sync/
│       │   ├── parsers/
│       │   ├── breeding/
│       │   ├── ai/
│       │   ├── repositories/
│       │   └── models/
│       ├── tests/
│       ├── Dockerfile
│       └── pyproject.toml
├── packages/
│   ├── contracts/                   # JSON Schema、OpenAPI 和生成类型
│   ├── pal-catalog/                 # 帕鲁、被动和显示元数据
│   └── ui/                          # 可复用 UI 组件
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   ├── tests/
│   └── functions/
├── data/
│   ├── breeding-fixtures/
│   └── parser-fixtures/
├── infra/
│   ├── agent/
│   │   ├── docker-compose.yml
│   │   ├── .env.example
│   │   └── scripts/
│   └── vercel/
├── docs/
│   ├── architecture/
│   ├── operations/
│   └── superpowers/specs/
├── .github/workflows/
├── AGENTS.md
└── README.md
```

前端 TypeScript 和后端 Python 共享 JSON Schema/OpenAPI 契约，分别生成 TypeScript 类型与 Pydantic 模型。业务字段不能在两端手工重复定义。

## 6. 数据模型

### 6.1 用户与角色

#### `profiles`

- `id uuid primary key`，对应 `auth.users.id`
- `display_name text`
- `role text check in ('admin','player')`
- `created_at timestamptz`

#### `player_bindings`

- `user_id uuid unique`
- `player_id uuid unique`
- `bound_by uuid`
- `bound_at timestamptz`
- `claim_code_hash text nullable`，为未来认领码预留

第一版只有管理员可以创建、解除和修改绑定。

### 6.2 世界、公会和玩家

#### `worlds`

- `id uuid primary key`
- `world_uid text unique`
- `name text`
- `latest_snapshot_id uuid nullable`
- `active_game_data_version_id uuid nullable`
- `active_breeding_version_id uuid nullable`
- `created_at timestamptz`

#### `guilds`

- `id uuid primary key`
- `world_id uuid`
- `game_guild_uid text`
- `name text`
- `last_seen_at timestamptz`
- 唯一约束：`world_id + game_guild_uid`

#### `players`

- `id uuid primary key`
- `world_id uuid`
- `guild_id uuid nullable`
- `game_player_uid text`
- `nickname text`
- `level integer nullable`
- `last_seen_at timestamptz`
- 唯一约束：`world_id + game_player_uid`

### 6.3 库存快照

#### `inventory_snapshots`

- `id uuid primary key`
- `world_id uuid`
- `source_save_hash text`
- `source_modified_at timestamptz`
- `save_version text nullable`
- `parser_name text`
- `parser_version text`
- `status text`
- `captured_at timestamptz`
- `parsed_at timestamptz nullable`
- `error_code text nullable`
- `error_summary text nullable`
- `payload_purged_at timestamptz nullable`

#### `pal_snapshot_items`

- `id uuid primary key`
- `snapshot_id uuid`
- `world_id uuid`
- `pal_instance_uid text`
- `pal_id text`
- `owner_player_id uuid nullable`
- `guild_id uuid nullable`
- `ownership_scope text check in ('player','guild','unresolved')`
- `is_boss boolean nullable`，仅历史 Parser 版本允许为空；新快照必须写入明确布尔值
- `gender text`
- `level integer nullable`
- `passive_skill_ids text[]`
- `location_type text`
- `location_name text nullable`
- `location_id text nullable`，保存稳定 Base UID 或不泄露原始容器 GUID 的逻辑仓库 ID
- `location_slot_index integer nullable`，保存来源中的从零开始绝对槽位
- `location_access_scope text check in ('player','guild','unresolved')`
- `raw_metadata jsonb`
- 唯一约束：`snapshot_id + pal_instance_uid`

快照事实字段不可修改。`payload_purged_at` 是唯一允许由受控清理 RPC 更新的生命周期字段；
其非空表示对应 `pal_snapshot_items` 已删除，只保留小型审计存根。`raw_metadata`
只保存经过筛选的扩展字段，不保存完整原始存档。

#### `pal_instance_lifecycle`

- `world_id uuid`
- `pal_instance_uid text`
- `first_seen_at timestamptz`
- `last_seen_at timestamptz`
- 主键：`world_id + pal_instance_uid`

该表只保存跨快照的实例首次/最近发现时间，不保存所有者、被动、位置或完整库存。
它仅用于库存生命周期审计与受控清理，不参与“我的计划”进度或候选判断。

### 6.4 共享偏好

#### `pal_share_preferences`

- `world_id uuid`
- `pal_instance_uid text`
- `owner_player_id_at_set uuid nullable`
- `share_enabled boolean default true`
- `updated_by uuid nullable`
- `updated_at timestamptz`
- 主键：`world_id + pal_instance_uid`

规则：

1. 首次发现实例时默认 `share_enabled=true`。
2. 同一实例且所有者未变化时保留设置。
3. 所有者发生变化时重置为可共享。
4. 实例暂时消失时不立即删除偏好记录。
5. 普通玩家只能修改自己当前拥有的帕鲁。

### 6.5 统一游戏数据版本

`game_data_version` 是静态游戏事实的权威版本边界，同一版本同时固定帕鲁目录、被动特性、主动技能、帕鲁可学习技能、伙伴技能、本地化、普通配种关系和特殊配种关系。图鉴编号仅用于显示，所有关系使用稳定英文内部 ID。

#### `game_data_sources`

- `id uuid primary key`
- `name text`
- `source_type text check in ('game_package','github','url','upload')`
- `source_path text nullable`
- `source_url text nullable`
- `enabled boolean`
- `created_at timestamptz`

#### `game_data_versions`

- `id uuid primary key`
- `source_id uuid nullable`
- `game_build_id text nullable`
- `game_version text nullable`
- `package_hash text`
- `content_hash text unique`
- `schema_version text`
- `extractor_name text`
- `extractor_version text`
- `artifact_bucket text nullable`
- `artifact_path text nullable`
- `status text check in ('extracting','staging','validated','published','rejected')`
- `manifest jsonb`
- `validation_report jsonb`
- `imported_at/validated_at/published_at timestamptz`
- `published_by uuid nullable`

关系查询使用 `catalog_pals`、`catalog_passive_skills`、`catalog_active_skills`、`catalog_pal_active_skills`、`catalog_partner_skills`、`catalog_localizations` 和 `catalog_breeding_recipes` 普通关系表；每张表以 `version_id` 参与主键。父母顺序归一化为 `least(parent1,parent2)` 与 `greatest(parent1,parent2)`。

旧 `breeding_data_sources`、`breeding_data_versions`、`breeding_recipes` 和 `worlds.active_breeding_version_id` 暂时保留。迁移复用旧 UUID、回填统一版本并在兼容期双写；新代码以 `game_data_version_id` 为权威，不在本阶段破坏性删除旧对象。

### 6.6 配种任务与结果

#### `breeding_jobs`

- `id uuid primary key`
- `requester_user_id uuid`
- `player_id uuid`
- `guild_id uuid nullable`
- `target_pal_id text`
- `desired_passive_ids text[]`，长度 0 到 4
- `optimization_mode text`
- `inventory_snapshot_id uuid`
- `game_data_version_id uuid`，权威精确版本
- `breeding_data_version_id uuid`，兼容旧代码，暂不删除
- `algorithm_version text`
- `scoring_profile_version text`
- `status text`
- `locked_by text nullable`
- `locked_at timestamptz nullable`
- `heartbeat_at timestamptz nullable`
- `attempt_count integer default 0`
- `error_code text nullable`
- `created_at timestamptz`
- `completed_at timestamptz nullable`

任务使用 PostgreSQL 原子领取函数，并在内部使用 `FOR UPDATE SKIP LOCKED`。

#### `breeding_plans`

- `id uuid primary key`
- `job_id uuid unique`
- `recommended_route_id uuid nullable`
- `ai_provider text`
- `ai_model text nullable`
- `ai_explanation text nullable`
- `generated_at timestamptz`

#### `breeding_routes`

- `id uuid primary key`
- `plan_id uuid`
- `rank integer`
- `total_score numeric`
- `generation_count integer`
- `estimated_attempts_min integer nullable`
- `estimated_attempts_max integer nullable`
- `borrowed_pal_count integer`
- `inventory_coverage numeric`
- `inheritance_score numeric`
- `feasibility_status text check in ('ready','needs_inventory')`
- `missing_pal_count integer`
- `score_breakdown jsonb`

路线载荷中的每个父母来源为 `inventory`、`intermediate` 或 `missing`。`missing` 只表达确定性的需求占位，必须包含帕鲁稳定 ID、所需性别和所需被动，不得伪造实例 UID、所有者、位置或已拥有被动。路线同时保存按 `pal_id + gender + required_passive_ids` 聚合的 `missing_requirements` 与 `adoptable`；`adoptable` 仅描述当前库存是否完整，不限制路线收藏。

#### `saved_breeding_plans`

- `requester_user_id uuid`
- `route_id uuid`
- `saved_at timestamptz`
- 主键：`requester_user_id + route_id`

“我的计划”是用户对已物化配种路线的收藏关系。路线详情继续由固定任务结果提供，因此收藏不会复制或修改配方、评分、真实父母和版本信息。保存与移除均幂等；普通玩家只能读写自己的收藏。旧执行计划、进度、候选和事件数据不迁移，可在前向迁移中删除。

## 7. 权限与 RLS

### 7.1 普通玩家

可以：

1. 查看绑定角色的完整库存。
2. 修改自己帕鲁的共享设置。
3. 查看同公会可共享帕鲁的最小必要信息。
4. 创建和查看自己的配种任务。
5. 查看、收藏和移除自己的计划路线。
6. 查看方案中借用帕鲁的名称、性别、被动、所有者显示名和位置。

不可以：

1. 查看其他玩家完整库存。
2. 修改其他玩家的共享设置。
3. 查看 Supabase Service Role Key。
4. 查看原始存档、服务器文件路径或完整解析堆栈。
5. 发布或回滚统一游戏数据。
6. 创建或修改其他玩家的计划。

### 7.2 管理员

可以：

1. 查看全服玩家、公会、库存和任务。
2. 管理用户与玩家绑定。
3. 批量修改共享设置。
4. 审核、发布和回滚统一游戏数据。
5. 查看同步、解析、任务和 AI 运行状态。
6. 代任意玩家创建方案。

### 7.3 Agent

Agent 使用独立 Supabase Service Role，只保存在服务器 `.env` 中。前端永远不能获取该密钥。涉及共享库存和任务创建的关键操作优先通过受鉴权的 PostgreSQL RPC 完成。

## 8. 存档同步与安全副本

### 8.1 路径发现

程序不得写死宿主机存档路径。部署初始化时必须在 `/opt/palworld` 执行：

```bash
cd /opt/palworld
docker compose config
```

根据 `volumes` 映射确认实际宿主机存档目录，并写入 Agent 环境变量：

```dotenv
PALWORLD_COMPOSE_DIR=/opt/palworld
PALWORLD_SAVE_ROOT=/confirmed/host/save/path
```

无法确认唯一映射时，Agent 进入 `not_ready`，不得猜测路径。

### 8.2 安全快照协议

Save Worker 每五分钟执行一次检查：

1. 由 ParserAdapter 声明需要的存档文件集合。
2. 采集相对路径、大小和修改时间。
3. 间隔约十秒再次采集；两次清单一致才继续。
4. 复制到 `data/snapshots/.tmp-<uuid>`。
5. 优先使用 `cp --reflink=auto`，不支持时退化为普通复制。
6. 复制后再次比对源文件和副本清单。
7. 一致后原子重命名为 `data/snapshots/<utc>-<short-hash>`。
8. 计算整体内容哈希；与上一成功快照相同时跳过解析。
9. 解析失败时保留上一份有效库存，不更新 `latest_snapshot_id`。

默认保留：

- 最近 3 份成功原始快照。
- 最近 1 份失败快照或失败快照最多保留 24 小时。
- Supabase 中已被更新快照取代的 `pal_snapshot_items` 从数据库写入时间起最多保留 24 小时。
- 每个世界的 `latest_snapshot_id` 及其明细始终保留；存档长期不变化时不得清空当前库存。
- 成功快照清理明细后保留带 `payload_purged_at` 的小型审计存根；失败或拒绝快照元数据
  在 24 小时后删除。
- 任务、路线、我的计划收藏、玩家、公会和共享偏好不随快照级联删除。
- 24 小时以数据库 `created_at` 计算，清理必须按小批次执行并与同一世界的发布、任务创建互斥。
- 完整存档不上传 Supabase。

Save Worker 每轮检查后调用受 Service Role 保护的清理 RPC。RPC 不接受客户端提供的保留时长，
永不删除最新有效库存，只允许更新 `payload_purged_at`、删除对应明细及过期失败记录。
相同内容哈希在旧载荷已清理后再次出现时创建新的快照发生记录，不复用已清理的存根。

## 9. ParserAdapter 与标准化

### 9.1 接口

```python
class ParserAdapter(Protocol):
    name: str
    version: str

    def detect_compatibility(
        self,
        snapshot_path: Path,
    ) -> CompatibilityResult: ...

    def parse(
        self,
        snapshot_path: Path,
        output_path: Path,
    ) -> ParserResult: ...
```

第三方解析器以独立子进程运行，输入只读快照目录，输出临时 JSON 文件。

### 9.2 资源限制

- 超时：默认 180 秒。
- 内存上限：默认 1.5 GB。
- CPU：约 1 核。
- 网络：默认不需要网络。
- 输入目录：只读。
- 输出目录：只允许写临时结果。

解析器崩溃、超时或输出非法 JSON 时，不允许部分数据进入 Supabase。

### 9.3 CanonicalSnapshot

```text
server
├── world_uid
├── save_version
└── captured_at

players[]
├── player_uid
├── nickname
├── level
└── guild_uid

pals[]
├── instance_uid
├── owner_player_uid
├── guild_uid
├── pal_id
├── is_boss
├── gender
├── level
├── passive_skill_ids[]
├── location_type
├── location_name
├── location_id
├── location_slot_index
└── location_access_scope
```

### 9.4 校验规则

1. `world_uid` 必须存在并匹配当前世界。
2. 玩家 UID 不得出现冲突映射。
3. 帕鲁实例 UID 在快照内唯一。
4. 帕鲁种类必须能映射到同一数据版本中的可配种目录帕鲁，或能由该版本受审计的
   `pal_name.PAL_NAME_*` 本地化事实确认是可入库但不可配种的游戏角色；两者都无法确认时记录
   告警。库存来源中以 `boss_` 开头的头目个体先去除一层前缀；头目随从内部名末尾保留的
   `_otomo` 是角色用途后缀，也在头目前缀去除后移除，再以剩余部分作为基础帕鲁稳定 ID。
   原始内部名保留在筛选后的 `raw_metadata` 中用于审计。`is_boss` 独立于基础帕鲁 ID：
   保存数据的 `IsBoss=true` 或原始内部名具有一层 `boss_` 前缀时均为 `true`，两者都不满足时
   为 `false`；来源证据保留在筛选后的审计元数据中。标准化后仍无法映射时才记录
   `UNKNOWN_PAL`。只有正式 `catalog_pals` 中的帕鲁能进入配种计算，本地化事实不会生成或改变
   配种关系。
5. 性别只接受受支持枚举或 `unknown`。
6. 未识别被动保留原值并标记，不丢弃整只帕鲁。
7. 所有权分为 `player`、`guild` 和 `unresolved`。有效玩家 UID 映射为 `player`；位于基地、
   玩家所有者为空且公会可确认的工作帕鲁映射为 `guild`；其余无法可靠确认归属的帕鲁标记为
   `unresolved`。存档内位置访问范围独立分为 `player`、`guild` 和 `unresolved`，不得根据
   `_dps.sav` 文件名、建造者或基地归属猜测次元帕鲁仓库的公私设置。
8. 位置类型支持 `player_party`、`player_storage`、`base`、`dimensional_storage`、
   `viewing_cage` 和 `unknown`。基地工作帕鲁保存稳定 Base UID 与工作槽位；普通帕鲁终端和
   次元帕鲁仓库保存绝对槽位。展示页码固定由
   `floor(location_slot_index / 30) + 1`、格号由
   `location_slot_index % 30 + 1` 计算，不重复持久化。原始 CharacterContainer GUID 不进入
   CanonicalSnapshot 或浏览器响应。无法证明精度时对应字段为空并记录稳定告警。
9. 次元帕鲁仓库来自同一稳定快照中显式声明的 `Players/<UID>_dps.sav`。Parser 必须保留其中
   稳定实例 UID，并验证帕鲁在普通库存与次元仓库之间移动时不会产生冲突或虚假的新实例。
   能从受控 fixture 证明仓库对公会开放时，`location_access_scope=guild`；私人仓库为
   `player`；格式未知或证据不足时为 `unresolved`，且不得自动进入其他玩家的公会共享池。
10. 库存数量异常下降时进入待审核状态。

默认异常下降阈值：新快照帕鲁总数低于上一有效快照的 50%，且绝对减少超过 50 只时，不自动发布。

## 10. 游戏静态目录数据基础设施

### 10.1 三层数据结构

```text
Agent 本地原始提取结果
→ 标准化不可变目录版本包
→ Supabase PostgreSQL 查询投影
```

原始层只用于诊断提取错误、比较游戏版本和重新标准化，不供浏览器或算法读取。本阶段不解析 `.pak`、`.utoc` 或 `.ucas`，也不伪装已经完成真实游戏包提取。

### 10.2 本地目录和标准化格式

根目录来自 `PALHATCH_DATA_DIR`；生产部署可配置为 `/opt/services/palworld-manager/data`，代码不得写死该路径：

```text
game-catalog/
├── extraction/{staging,raw,failed}/
├── normalized/<content-hash>/
├── bundles/
├── cache/
└── runtime/
```

标准化目录包含 `manifest.json`、`validation-report.json`、`checksums.sha256`，以及 `pals.jsonl`、`passive-skills.jsonl`、`active-skills.jsonl`、`pal-active-skills.jsonl`、`partner-skills.jsonl`、`breeding-recipes.jsonl`、`localizations.jsonl`。JSONL 固定 UTF-8、LF、每行一个对象、key 稳定排序、无多余空格、文件末尾换行；记录按稳定主键排序，集合语义数组排序去重，禁止 NaN、Infinity 和未声明字段。所有文件先写临时路径、flush/fsync、完整校验，再原子 rename。

### 10.3 manifest 与 content hash

manifest 记录 schema/game build/game version/package hash/content hash、提取器版本、UTC 创建时间、locale、计数、压缩方式和逐文件 SHA-256。先对七个 JSONL 文件分别计算 SHA-256，再按文件名排序，将 `schema_version + filename + sha256 + record_count` 生成为规范 JSON 后计算 `content_hash`。修改时间、绝对路径、随机 UUID、manifest 自身和 validation report 不进入 hash，因此相同内容稳定得到相同版本。

### 10.4 制品、staging 与查询投影

完整版本以标准库可生成的确定性 `tar.gz` 保存到私有 Bucket `game-catalog-artifacts`：

```text
versions/<content-hash>/catalog.tar.gz
versions/<content-hash>/manifest.json
versions/<content-hash>/validation-report.json
```

匿名和 authenticated 用户默认不能直接下载。Agent 使用已有 Service Role 配置上传，不上传游戏包、安装目录、存档、图标、音频或模型。数据库以幂等批次写入 `game_data_import_runs`/`game_data_import_batches`；`finalize_catalog_import` 在单一事务中校验计数、主外键、本地化和配种关系后写入关系投影。未完成 staging、rejected 和导入异常对普通查询不可见，失败不会改变当前活动版本。

### 10.5 发布、回滚和任务固定

`publish_game_data_version` 只接受完整 `validated` 版本，原子切换指定世界的 `active_game_data_version_id`，并在兼容期同步旧指针；`rollback_game_data_version` 只切换到已有 published 版本，不重新导入、不删除或降级任何版本。任务创建 RPC 在同一数据库事务中固定：

```text
inventory_snapshot_id
+ game_data_version_id
+ algorithm_version
+ scoring_profile_version
```

### 10.6 Agent 精确版本读取

运行时按“进程内有限缓存 → `cache/<version-id>.sqlite` → 本地 normalized → 私有 Storage 制品 → PostgreSQL 投影”加载。SQLite 以临时文件构建后原子替换，保存 version/content/schema 元数据并以只读模式打开；不匹配或损坏时删除并从事实源重建。

`load_version(requested_version_id)` 只加载请求的精确版本。任何层发现 manifest、hash、checksum、schema、重复记录或外键损坏都立即返回稳定错误；不得继续尝试另一事实层掩盖同一版本的损坏，更不得回退到世界当前版本、最新 published 版本或本地最近版本。历史任务因此保持可复现。

## 11. 确定性配种算法

### 11.1 输入

- 目标帕鲁。
- 0 到 4 个期望被动。
- 固定库存快照。
- 公会共享偏好。
- 固定统一游戏数据版本中的配种关系。
- 优化模式。
- 最大代数，默认 5。

### 11.2 候选库存

包含：

1. 玩家自己的全部可用帕鲁。
2. 同公会 `share_enabled=true` 的帕鲁。
3. 同公会所有、位于基地且归属已解析的工作帕鲁；这类实例没有玩家所有者，按公会共享库存
   参与计算。
4. 位于次元帕鲁仓库且存档内访问范围已证明为 `guild` 的同公会帕鲁；保留实际玩家所有者，
   但按游戏内公会可访问库存参与计算。

排除：

1. 所有权为 `unresolved`，或玩家/公会归属与所有权类型不一致。
2. 已从当前快照消失。
3. 已关闭共享且不属于请求玩家。
4. 管理员禁用或标记不可配种。
5. 性别不满足当前步骤。
6. 属于其他玩家且位于次元帕鲁仓库，但访问范围为 `player` 或 `unresolved`。

### 11.3 两层搜索

第一层搜索帕鲁种类路线，将关系建模为：

```text
父本种类 + 母本种类 → 子代种类
```

使用受限启发式搜索，设置：

- 最大代数：5。
- 最大展开节点数：配置化。
- 单目标最大候选路线数：配置化。
- 单任务最大算法时间：配置化。

第二层为路线分配真实实例并评估：

- 性别可行性。
- 目标被动覆盖度。
- 非目标被动数量。
- 借用数量。
- 中间实例数量。
- 中间实例需要保留的被动。
- 替代父母组合。

实例分配允许把无法由固定库存满足的起始父母保留为 `missing` 需求，因此配方链合法但库存不完整时仍可返回候选。目标帕鲁的现有实例不能作为零步完成路线；若固定配方允许，它仍可作为非零步路线的真实父本或母本。

路线按可行性分层：

1. `ready`：所有起始父母均绑定固定库存中的真实实例。
2. `needs_inventory`：至少一个起始父母是缺失需求。

搜索必须增量生成、分配和评分目标候选。种类枚举达到硬预算时，已经完成合法性校验和实例/缺口分配的候选不得丢弃。普通 beam/状态剪枝属于启发式剪枝，不等同于硬安全上限；只有超时或全局节点预算耗尽且仍有未探索状态时才标记搜索不完整。

搜索状态和最终候选都必须执行语义去重：

1. 库存叶子在帕鲁种类、目标被动覆盖和搜索所需输出性别相同时属于同一状态；实例 UID、所有者、位置和非目标被动身份不形成额外搜索分支。
2. 中间状态按配方拓扑、子代种类、目标被动分配及搜索所需输出性别生成固定长度语义签名；相同签名只保留一个代表。
3. 最终路线签名忽略实例 UID、父母槽位方向和性别朝向、所有者、位置及非目标被动身份，但保留帕鲁种类拓扑、配方类型和目标被动检查点。
4. 相同签名的代表先选库存完整/缺口更少的候选，再按非目标被动总数、借用、尝试成本、既有模式评分和稳定物理键选择。
5. 软目标按语义不同路线计数。得到至少三条 `ready` 语义路线后不再为了填充内部候选上限启动缺库存搜索；硬节点和 30 秒时间预算保持不变。

生产容量以单快照 2000+ 帕鲁为最低压力基线。压力验证必须至少覆盖 2048 个库存实例、大量语义重复个体和无关种类，并证明状态去重不会触发默认 200,000 节点或 30 秒上限。去重在入队和组合前完成，不能仅在最终结果列表过滤，否则不得视为满足容量要求。

若当前游戏版本缺少可验证的精确遗传概率数据，前端只显示“难度低/中/高”和尝试次数区间，并明确标记为策略估计。

## 12. 综合评分

默认评分维度：

- 路线长度。
- 当前库存覆盖率。
- 被动集中度。
- 公会借用成本。
- 中间帕鲁成本。
- 预计尝试成本。
- 路线稳定性。
- 缺失起始父母数量及其被动要求成本。

库存覆盖率固定定义为“由真实库存满足的起始父母需求数 / 全部起始父母需求数”，不得用步骤中库存父母出现次数近似。默认推荐先按可行性分层：存在 `ready` 路线时推荐项必须来自 `ready`；没有 `ready` 路线时先最小化缺失实例数量和缺失被动要求，再应用模式评分。四种优化模式只在同一可行性层级内改变顺序。

快捷模式通过切换权重实现：

1. 综合推荐。
2. 最快路线。
3. 最高成功率。
4. 最少借用。

所有评分权重保存为版本化 `scoring_profile_version`。每条路线保存完整 `score_breakdown`，AI 无权修改基础分数。

## 13. AIProvider

统一接口包含：

1. `OpenAICompatibleProvider`
2. `CodexCliProvider`
3. `TemplateProvider`

默认降级顺序：

```text
外部兼容 API
→ Codex CLI
→ 本地模板
```

### 13.1 数据最小化

仅发送：

- 目标帕鲁。
- 期望被动。
- 已脱敏候选路线。
- 评分明细。
- 优化模式。

禁止发送：

- 完整存档。
- Supabase 邮箱和登录信息。
- 服务器公网 IP。
- 原始文件路径。
- 与当前任务无关的完整库存。

### 13.2 Codex CLI 约束

- 并发数 1。
- 严格超时。
- 在临时工作目录运行。
- 禁止修改代码仓。
- 不授予任意工具执行权限。
- 登录不可用时直接降级为模板，不阻塞算法结果。

### 13.3 mihomo

外部 AI Provider 容器按需通过宿主机网关访问 mihomo。Codex CLI 通过宿主机受控包装脚本按需注入：

```dotenv
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
ALL_PROXY=socks5://127.0.0.1:7890
```

不修改系统全局代理，不让帕鲁容器走代理。

## 14. 任务状态机与恢复

任务状态：

```text
pending
→ processing
→ algorithm_completed
→ ai_enriching
→ completed
```

异常状态：

```text
processing → retry_pending → processing
processing → failed
processing → cancelled
```

领取时写入：

- `locked_by`
- `locked_at`
- `heartbeat_at`
- `attempt_count`

Worker 处理时定期刷新心跳。锁超时且心跳失效的任务回收到 `retry_pending`。

幂等键由以下信息生成：

```text
requester
+ player
+ target
+ desired_passives
+ inventory_snapshot
+ game_data_version
+ optimization_mode
```

重复点击不会并行生成相同任务。

## 15. “我的计划”路线收藏

“我的计划”保持前后端统一产品语义，实现为路线收藏：

1. 结果页可幂等保存任意 `ready` 或 `needs_inventory` 路线。
2. `/plans` 展示当前用户收藏的路线摘要与保存时间。
3. `/plans/[routeId]` 只读展示计算时已物化的完整路线、评分、缺口与版本信息。
4. 用户可以移除收藏；移除不删除原配种任务或路线。
5. 不提供开始、暂停、重试、跳过、确认子代、自动推进或候选检测。

## 16. 方案可复现

每个方案在计算时固定：

```text
库存快照版本
+ 游戏数据版本
+ 算法版本
+ 评分版本
+ AI Provider 记录
```

收藏始终读取计算时已物化的路线、评分明细、版本和解释。库存变化不会改写收藏内容；库存快照明细过期后不保证按旧库存重新运行算法，但可返回原任务以当前库存重新计算。原路线或任务被授权删除时，数据库外键级联移除收藏关系。

## 17. 前端产品设计

### 17.1 产品定位

第一版前端是“帕鲁配种协作工作台”，不是通用服务器管理后台。配种创建、去重方案比较和“我的计划”收藏查看是绝对主线。

技术栈：

- Next.js + TypeScript。
- shadcn/ui。
- Tailwind CSS。
- Supabase Auth 与浏览器客户端。
- 深色优先、现代游戏工具风格。

登录页与业务页面的 CSS 风景背景不显示上方白云装饰。业务 Hero 只保留与当前任务相关的标题、
说明和主要操作；“我的计划”与配种工作台 Hero 不在右侧放置纯装饰图标组，也不为其预留空白。

### 17.2 左侧导航

普通玩家桌面端导航固定为：

```text
概览
帕鲁列表
配种器
我的计划
```

数据状态不再作为主导航项；桌面端状态入口保留在用户下拉菜单，移动端保留在菜单中的状态入口，
避免同一目标重复出现。

管理员入口放入用户头像菜单：

```text
管理后台
├── 玩家绑定
├── 存档与解析
├── 游戏数据
├── 任务与 AI
└── 系统设置
```

桌面导航的当前选中框与 Hover/键盘焦点框必须相互独立：当前选中框固定在当前路由，
Hover 框在导航项之间水平滑动并保留轻量果冻反馈，离开导航后只隐藏 Hover 框。两者均使用
与用户菜单 Hover 一致的无边框强调色状态；动效遵循 reduced-motion。帕鲁库存入口统一使用
爪印图标。

### 17.3 移动端导航

底部导航：

```text
概览 | 帕鲁 | 配种器 | 计划
```

数据状态在顶部状态入口或用户菜单中展示，并与桌面导航使用相同的状态语义。

### 17.4 概览页

展示：

- 最近收藏的计划路线。
- 打开配种器的快捷入口。
- 打开帕鲁列表的快捷入口。
- 最新库存同步时间与数据版本摘要。

没有计划时显示明确空状态；有计划时展示目标、被动、路线摘要和保存时间。
最近收藏项目必须同时提供清晰的 Hover 与键盘焦点反馈；“查看帕鲁”入口使用爪印图标。
概览页不重复展示库存统计卡片或与顶部导航相同的快捷入口卡片；库存数量在帕鲁列表页展示。
概览页只查询渲染所需的数据状态与最近收藏，不为已移除的统计卡片发起库存分页查询。
概览、帕鲁列表和配种器只展示完成当前任务所需的中性快照/版本事实，不重复显式展示
“数据已过期”“存档解析异常”或“当前使用上一份有效库存”等全局状态提示。

### 17.5 帕鲁列表

原“我的帕鲁”和“公会共享”合并为 `/pals`，使用范围切换：

```text
全部 | 我的帕鲁 | 公会共享
```

默认“全部”展示当前玩家可用于配种的完整候选池。

统一筛选：

- 名称或编号。
- 头目。
- 所有者。
- 性别。
- 被动。
- 位置。
- 共享状态。
- 稀有被动。

库存筛选项使用“被动技能”标签；选项按照配种工作台相同的 rank 降序排列，同 rank 按稳定内部 ID
排序。被动筛选支持同时选择最多四项，并使用 AND 语义：结果必须同时拥有全部所选被动。被动选项、
筛选器中的已选项和业务页面中的被动词条统一使用相同的品级徽标；筛选参数以可重复的
`passive` URL 参数传递，范围、视图和分页切换必须完整保留全部选择。

被动徽标只按固定游戏数据版本中的 `rank` 决定品级视觉，不以 `is_negative` 覆盖颜色：

- `rank <= -1` 使用红色文字/边框和暗红背景。
- `rank = 1` 使用白色文字/边框和中性深色背景。
- `rank = 2` 或 `3` 使用金黄色文字/边框和暗金背景。
- `rank = 4` 使用 `#68ffd8` 文字/边框和偏青绿背景。
- `rank = 5` 同样使用 `#68ffd8`，但背景明显偏紫色。
- `rank = 0`、缺失或范围外值使用中性降级样式。

所有品级背景均使用本地 CSS 生成的拼接三角纹理，不热链或复制第三方站点纹理资产。纹理只在
水平方向重复为一行三角形，同一行内相邻三角形朝向交替且各自跨越徽标高度，不得以徽标垂直
中心为原点形成上下交错的第二行。文字与背景保持可读对比度；徽标不得仅以颜色表达负面语义，
已有负面文字和可访问名称继续保留。

面向玩家的名称和被动筛选只接受本地化名称或图鉴编号，不接受帕鲁、被动等目录稳定英文
内部 ID。内部 ID 继续作为数据库、契约、图片索引和确定性算法的关联键，但不得作为玩家界面
的标签、辅助文字、搜索关键字或未翻译名称回退。目录事实不可用时使用“名称暂不可用”与
“未知被动”等中性降级，不把原始内部 ID 暴露给玩家。

自己的帕鲁显示共享开关；其他玩家帕鲁只显示共享状态。每只帕鲁可“作为配种起点”。
公会所有的基地工作帕鲁显示在“全部”和“公会共享”，所有者显示公会名，不显示个人共享开关。
头目个体显示“头目”徽标。位置使用一致的诚实降级：基地显示基地名或“未命名据点”及工作位；
普通帕鲁终端和次元帕鲁仓库显示第几页、第几格；无法证明精确位置时仅显示位置类型或
“位置未解析”，不得展示原始容器 GUID。

库存页 Hero 使用玩家能直接理解的配种与共享库存语言，不出现“边界”“安全”“实例”等实现
术语。四张库存指标卡使用紧凑间距且不显示底部辅助说明；“帕鲁总数”固定表示当前用户完整
可用库存，不随范围与其他筛选变化，筛选后的数量在列表工具栏单独显示。卡片/表格视图切换
只显示图标按钮，但必须保留可访问名称、键盘焦点和 Tooltip。

库存列表存在多个页面时，列表进入视口后在视口底部居中显示浮动分页；接近列表末端时由同
样式的正常流分页接替，列表与分页均离开视口后隐藏。分页只动画 opacity/transform，遵循
reduced-motion、移动端安全区和 44px 最小点击区域，不得遮挡最后一行内容。卡片使用统一的
shadcn 层级阴影，基础阴影贴合底部，Hover 提升一层，避免大幅下偏移造成阴影断层。

### 17.6 配种器

原“AI 配种”统一更名为“配种器”。路由：

```text
/breeder
/breeder/jobs/[jobId]
```

创建页使用单页分区，包含：

- 目标帕鲁选择器。
- 最多四个期望被动。
- 优化模式。
- 是否允许使用公会共享。
- 最大代数。
- 当前库存快照与游戏数据版本。

选择器支持名称、编号、属性、最近选择、已拥有标记和公会拥有数量。
目标帕鲁与被动选择器不得显示或搜索目录稳定英文内部 ID；未翻译事实使用中性名称降级。

创建页 Hero 标题使用“配种工作台”，Hero 后不重复显示步骤眉题、创建标题或实现说明，流程条后
直接进入核心表单。目标设置、期望被动和路线偏好使用一致的卡片层级、字体层级、圆角、Hover、
选中和键盘焦点状态；面向玩家的说明只描述可完成的操作和结果，不使用“目录”“版本”“边界”
等实现术语。必须保留的可复现事实收纳为次要的“本次计算依据”，使用“库存数据”“游戏数据”
“计算方式”“推荐方式”等玩家可理解标签，不改变实际固定值。

创建页 Hero 右侧不显示目标、被动或路线等纯装饰图标组，正文区域使用完整可读宽度。

目标帕鲁字段标签只显示“目标帕鲁”。选中后，选择框本身同时展示头像、本地化名称和图鉴编号，
不得再渲染重复的目标摘要卡。弹出候选继续支持按本地化名称和图鉴编号搜索，并保持键盘选择、
清晰焦点和移动端最小点击尺寸。已选目标的头像使用明显大于候选列表的 72 像素尺寸，选择框同步
提升名称层级和高度以突出当前培育目标；候选列表继续保持紧凑密度。

期望被动卡片不在主标题下重复显示“期望被动（最多 4 个）”字段标题，也不提供一键清空操作。
已选择区域使用紧凑的两列两行布局，按阅读顺序放置最多四个被动；每列与下方候选徽标一致，
最大宽度固定为 20rem，整体左对齐，可用宽度不足时两列与徽标同步收缩，不得产生横向滚动。
徽标始终保持单行固定高度，被动名称超长时省略但保留完整名称提示；逐项移除保持至少 44 像素
点击区域、键盘焦点和可访问名称。

下方被动候选列表中的品级徽标使用约一个手机内容区宽度的固定 20rem 宽度，不随名称长度变化；
可用宽度小于 20rem 时收缩到 100%，不得造成横向滚动。效果说明继续在徽标下方独立换行。

期望被动候选使用固定游戏数据中的本地化效果文本替代可见的“正面”“负面”分类标签；名称继续
使用全局品级徽标，`rank` 与 `is_negative` 事实保持不变。效果文本缺失时显示“效果说明暂不可用”，
不得回退到内部 ID。表单上下文通过共享 Schema 投影可空的 `effect_text`，数据库从同一固定版本、
同一 locale 的 `description_key` 本地化读取，不改变游戏事实或配种算法。

计算过程使用真实阶段，不显示虚假百分比：

```text
已锁定库存快照
已加载固定游戏数据
正在搜索合法路线
正在综合评分
正在生成说明
```

AI 失败但算法成功时，任务仍成功并显示模板说明。

最大代数只允许 1 至 5。浏览器输入、共享请求契约、Agent 搜索输入和管理员运行设置必须使用相同
上限；数据库对新任务和新设置执行同一写入保护。历史上已物化的六至八代任务和路线继续只读
兼容，不因收紧新请求边界而失去可读性。

### 17.7 结果页

布局：目标摘要 + 路线列表 + 路线详情。

默认突出：

- 推荐方案。
- 最快方案。
- 最高成功率方案。
- 最少借用方案。

路线详情必须显示：

- 真实父母实例。
- 所有者和位置。
- 性别和被动。
- 中间帕鲁。
- 代数。
- 借用数量。
- 库存覆盖率。
- 难度与估算尝试次数。
- 推荐理由。
- 库存、游戏数据、算法和 AI 版本。
- 每一步按性别区分的父本与母本，以及来源是自有、借用、中间产物还是缺失。
- 缺失父母汇总，包括帕鲁、数量、所需性别、所需被动和使用步骤。

桌面配种路线树中，同一步骤的两个亲本连接必须先汇合到子代箭头左侧的同一锚点，再由唯一的
水平末段和箭头指向子代；曲线末端、水平末段与箭头基线使用同一组几何常量，不得出现断缝或
重叠箭头。普通与特殊配方只改变颜色和虚线样式，不改变连接几何。亲本节点只展示真实库存被动，
不重复显示“本步骤需保留”；中间产物和最终目标继续展示路线所需被动。

`needs_inventory` 路线显示“补齐库存后重新计算”。`ready` 和 `needs_inventory` 路线均可“保存到我的计划”；保存不会创建执行步骤或锁定库存。

允许最多三条路线横向比较。移动端使用纵向卡片。

### 17.8 我的计划

`/plans` 是已收藏路线列表，不提供进度状态筛选。每项显示目标帕鲁、期望被动、可行性、代数、步骤数、借用数、预计尝试次数、保存时间和路线链摘要。

页面不显示“当前页已收藏多少条计划”的独立摘要卡。计划卡片在移动端使用可用全宽，在桌面端
最大宽度为 32rem；列表参考帕鲁列表使用紧凑的自动适配网格并整体左对齐，同一行的相邻卡片只
保留统一紧凑间距，不把列内剩余宽度堆积到卡片之间。想要的被动固定使用两列两行布局；零至
两个被动同样预留第二行空间，三个至四个徽标自然填入第二行，不绘制虚假徽标。卡片内容撑满
所在网格行，底部“查看计划”入口保持对齐。

页面文案使用玩家能直接理解的“保存的配种路线”“想要的被动”“还需准备”“开始规划”等语言，
不在标题、说明、卡片指标或按钮中使用“需求”“版本”“确定性”“任务”等实现术语。

### 17.9 计划详情

页面只读展示收藏路线的完整配种树、真实库存亲本、仍需准备的帕鲁、推荐依据和本次计算依据。
玩家可移除收藏、查看原配种结果或基于当前库存重新规划，不提供手工推进操作。

计划详情不显示 Hero。返回入口后直接使用紧凑目标摘要作为页面开头，目标帕鲁名称是页面唯一
一级标题，并同时展示保存时间、收藏状态与当前路线是否已具备所需库存。路线树与配种工作台使用
相同紧凑布局、标题和节点密度，不显示英文眉题或重复说明。

面向玩家的标题和操作使用“配种路线”“想要的被动”“推荐依据”“查看原配种结果”等语言。
库存、游戏数据、算法、评分和内容哈希仍完整保留在可折叠的“本次计算依据”中，但可见标签使用
“库存数据”“游戏数据”“计算方式”“推荐方式”“校验信息”，不得以“固定版本”“目录版本”
“算法版本”“评分版本”等术语作为玩家界面标签。

### 17.10 数据状态

左侧底部固定显示：

```text
● 数据正常
```

异常状态包括：

- 数据已过期。
- 存档解析异常。
- 当前使用上一份有效库存。
- 游戏数据有待审核版本。

普通玩家可查看同步时间、快照版本、游戏数据和算法版本。管理员额外查看 Agent 心跳、Parser 版本、失败记录、待处理任务和手动同步入口。

全局库存与游戏数据状态提示集中在桌面/移动导航状态入口和 `/data-status` 详情页。
其他业务页面不得重复渲染同一状态告警；页面自身可操作的局部错误、权限错误、查询失败和
会改变当前功能能力的降级说明不受此限制。管理员页面中的 Agent/Worker 心跳诊断属于独立
运维事实，不视为重复的全局数据状态提示。

### 17.11 关键状态

所有核心页面必须覆盖：

- 加载中。
- 空状态。
- 数据过期与解析异常，由导航状态入口和数据状态详情统一覆盖。
- 方案失效。
- AI 降级。
- 没有合法路线。
- 权限不足。
- 账号未绑定游戏角色。

账号未绑定游戏角色时，概览、帕鲁列表、配种器、配种结果、我的计划、计划详情和数据状态页不显示
`PLAYER_BINDING_REQUIRED` 错误框，而是复用账号页的完整“存档同步”卡片，并在其下方紧邻展示同一
FAQ 卡片。同步卡片必须让用户可直接完成安装、设备配对、前台启动同步与角色匹配；FAQ 至少解释
角色匹配步骤、Palworld 世界存档目录选择和存档数据安全。账号页无论是否已经绑定都保留同步卡片
与 FAQ，方便管理同步设备和复查说明。

没有合法路线时提供可操作建议，例如放宽最大代数、减少期望被动或查看缺失帕鲁。

### 17.12 路由

普通玩家：

```text
/login
/overview
/pals
/breeder
/breeder/jobs/[jobId]
/plans
/plans/[planId]
/data-status
/account
```

管理员：

```text
/admin
/admin/bindings
/admin/save-parser
/admin/breeding-data
/admin/jobs
/admin/settings
```

### 17.13 中英文国际化与语言路由

所有浏览器页面使用 Next.js App Router 顶层动态语言段，公开 URL 固定带语言前缀：

```text
/zh/login
/zh/overview
/zh/pals
/zh/breeder
/zh/plans
/zh/admin

/en/login
/en/overview
/en/pals
/en/breeder
/en/plans
/en/admin
```

`zh` 与 `en` 是 URL 语言标识；读取固定游戏目录时分别映射为 `zh-CN` 与 `en-US`。页面路径中的
显式语言优先，其次使用已保存的语言 Cookie 与浏览器 `Accept-Language`，最终默认中文。旧的无
前缀页面 URL 必须保留查询参数并重定向到对应语言地址；`/api`、Next.js 内部资源与静态资产不增加
语言前缀。未知语言返回本地化 404，不得静默映射到不相关语言。

应用 UI 文案与游戏内容本地化分层管理：

1. 导航、表单、状态、错误、空状态、可访问名称、Tooltip、Metadata、日期、数字和复数来自按功能
   命名空间组织的中英文应用消息，不在 React 组件中散落玩家可见硬编码文案。
2. 帕鲁、被动、主动技能、伙伴技能及后续游戏内容继续只从任务或世界固定的
   `catalog_localizations` 读取；应用消息文件不得复制这些版本化事实。
3. 内部 ID、状态码、算法/评分字段与关系保持稳定英文值。翻译缺失时使用当前语言的中性降级，
   不显示内部 ID、不混用另一语言，也不改变配种合法性或评分。
4. 新目录发布必须校验面向玩家的已声明名称/描述键在 `zh-CN` 与 `en-US` 中的覆盖。历史固定版本
   保持不可变，缺失内容按中性降级只读展示。
5. 数据库浏览器投影显式接收受支持的 locale，并在响应中回传实际 locale；现有 RPC 保留兼容，
   新 Web 使用前向版本化 RPC。API 路径保持无前缀，由经过校验的请求字段传递 locale。
6. AI 解释与本地模板同样声明语言。自由文本只在请求语言匹配时展示；历史解释语言不匹配时，
   使用相同确定性路线事实生成当前语言模板，禁止中英混排。AI 仍不得创造事实或修改分数。

语言选择器使用 shadcn/Radix Dropdown Menu 的单选语义与 Lucide 语言图标。桌面端位于用户头像
左侧，移动端位于菜单按钮左侧；登录页因没有用户头像，在卡片右上角提供同款紧凑入口。切换必须
保留当前页面、动态参数和查询参数，更新语言 Cookie，并具备键盘导航、清晰焦点、当前值、可访问
名称和至少 44 像素点击区域，不使用国旗代表语言。

## 18. 服务器进程与部署

同一 Python 镜像运行三种命令：

```text
api
job-worker
save-worker
```

服务器目录：

```text
/opt/services/palworld-manager/
├── docker-compose.yml
├── .env
├── data/
│   ├── snapshots/
│   ├── parser-cache/
│   ├── game-catalog/
│   └── runtime/
└── logs/
```

资源默认限制：

- Save Worker 并发 1。
- 配种算法任务并发 1。
- AI 并发 1。
- Parser 内存上限 1.5 GB。
- Agent 整体内存目标不超过约 2 GB。

资源紧张时延迟存档解析和 AI 任务，优先保证游戏服务器。

健康/readiness 响应增加不泄密的 `game_catalog` 摘要，只报告 `not_configured/configured/error`、活动版本 ID 和 `empty/warm/error` 缓存状态。目录未配置不会让 Phase 2 的 API、Job Worker 或 Save Worker 边界整体不可用；只有明确依赖目录版本的命令失败。响应禁止包含 Service Role、签名 URL、本地绝对路径和异常堆栈。

## 19. 错误处理

| 异常 | 行为 |
|---|---|
| Supabase 暂时不可用 | 指数退避重试，不丢本地状态 |
| mihomo 不可用 | AI 降级，算法继续 |
| 外部 AI 超时 | 切换 Codex CLI 或模板 |
| Codex CLI 未登录 | 使用模板，记录 Provider 不可用 |
| Parser 崩溃或超时 | 保留上一份有效库存 |
| 存档持续变化 | 跳过本轮，下一周期重试 |
| 磁盘空间不足 | 停止创建快照并告警 |
| 游戏目录校验失败 | 保持 staging，不影响线上版本 |
| Agent 重启 | 回收超时任务继续执行 |
| 帕鲁容器停止 | 仅告警，不自动启动或修改 |

## 20. 测试要求

### 20.1 后端

1. ParserAdapter 契约测试。
2. 脱敏存档样例解析测试。
3. 复制期间源文件变化测试。
4. 相同哈希跳过解析测试。
5. 异常库存下降保护测试。
6. 游戏目录导入、校验、发布和回滚测试。
7. 特殊配方优先级测试。
8. 多代路线搜索测试。
9. 性别不满足时替代路线测试。
10. 被动组合和评分测试。
11. 共享关闭后的排除测试。
12. 缺失父本/母本、同种异性数量和库存覆盖率测试。
13. 已有目标不产生零步路线测试。
14. 搜索硬上限保留已验证候选与软剪枝诊断测试。
15. 任务重复领取与锁超时测试。
16. AI 三级降级测试。
17. 我的计划保存/移除幂等、跨用户隔离、物化路线只读和过期库存不被重新加载测试。
18. 24 小时边界、最新快照保护、分批清理、相同哈希重新发布和并发发布互斥测试。
19. 2048 个以上库存实例、重复个体状态压缩、语义路线去重和默认硬预算不超限压力测试。
20. Boss 前缀库存 ID 标准化、`IsBoss`/前缀头目标志合并、公会所有基地帕鲁解析、列表展示和配种可用性测试。
21. 基地 UID/工作槽位、普通终端页槽、次元帕鲁仓库页槽、私人/公会/未知访问范围、
    DPS 实例 UID 稳定性、跨公会隔离和 Parser 输出上限测试。

### 20.2 数据库与权限

1. 普通玩家无法查看他人完整库存。
2. 普通玩家只能修改自己的共享设置。
3. 普通玩家不能发布游戏数据。
4. 管理员具备全服管理权限。
5. 任务创建 RPC 固定当前可用快照和游戏数据版本。
6. 原子领取函数不会重复领取任务。
7. 普通用户和管理员不能直接执行库存保留清理；只有 Service Role 可调用受控 RPC。
8. 清理不会删除最新库存、配种任务与路线、“我的计划”收藏或共享偏好。

### 20.3 前端

1. 登录与未绑定角色状态。
2. 帕鲁列表三种范围和筛选。
3. 共享开关和批量操作。
4. 配种器创建任务。
5. 异步任务刷新后恢复。
6. 至少三条路线比较。
7. 保存和移除“我的计划”。
8. 我的计划列表和只读路线详情。
9. 基于当前库存重新计算入口。
11. AI 降级提示。
12. iPhone Safari、Android Chrome 和微信浏览器基础流程。

Phase 5 的每次提交浏览器验收只保留登录、未绑定引导、移动端关键流程、库存筛选/共享、权限与
隐私隔离、配种任务、路线收藏和管理员操作等第一版核心闭环。公开 Landing、SEO 与静态内容继续由
Server Component/Vitest、metadata、sitemap、robots、middleware 和生产构建测试覆盖；链接数量、
精确几何、轮播排版、窄屏文案换行及逐页公开导航等低价值 UI 断言不进入 Phase 5 Playwright，避免
与快速测试重复并阻塞无关改动。Landing 专项改版需要时再执行有针对性的浏览器或人工视觉验收。

## 21. 第一版验收标准

1. Agent 能从确认后的宿主机路径创建只读安全副本。
2. 原存档在任何失败场景下均不被修改。
3. 成功解析后可在 Supabase 中看到玩家、公会和帕鲁实例。
4. 新帕鲁默认可共享，玩家可以关闭自己的共享状态。
5. 普通玩家无法读取其他玩家完整库存。
6. 玩家可以创建目标帕鲁和最多四个被动的任务。
7. 任务使用固定库存、游戏数据、算法和评分版本。
8. 算法只输出固定游戏数据版本中可验证的合法路线。
9. 至少返回三条具有评分明细的候选路线；不足三条时返回全部合法路线并解释原因；库存不足的合法路线明确显示缺失父本/母本需求。
10. AI 不可用时仍能显示完整算法结果。
11. 玩家可以把 `ready` 或 `needs_inventory` 路线保存到“我的计划”，重复保存不产生重复记录。
12. “我的计划”只读展示收藏路线并允许移除，不出现人工进度或候选子代功能。
15. 游戏数据可暂存、校验、发布和回滚。
16. 旧方案仍可按原版本查看和解释。
17. 手机端可以完成登录、创建任务、查看结果、保存和查看“我的计划”。
19. 服务器不新增公网业务端口。
20. 新系统异常不会自动修改或重启帕鲁服务器。
21. 已被取代的数据库库存明细在写入 24 小时后可被分批清理，最新有效库存始终可用。
22. 快照明细清理后，已物化路线和“我的计划”收藏仍可读取。
23. 新快照保留头目标志；基地工作帕鲁可定位到基地与工作位，普通终端和次元帕鲁仓库可在
    数据可证明时定位到页格；未知次元仓库共享状态不会误进入公会库存。

## 22. 后续扩展方向

### 第二阶段

- 一次性角色认领码。
- 更完整的管理员监控。
- RCON 手动安全保存后立即同步。
- 可配置共享和计划占用策略。
- 游戏数据可信来源自动发布策略。

### 第三阶段

- 每日自动推荐值得培育的战斗和工作帕鲁。
- 个体值、闪光、Boss 体型和更多遗传维度。
- 公会协作确认和借用流程。
- 服务器运行状态、备份和告警总看板。

## 23. 设计一致性结论

本设计保持以下边界一致：

1. 前端公开访问，服务器 Agent 私有运行。
2. Supabase 是身份、数据库和任务控制面，不保存完整原始存档。
3. 配种算法由版本化规则和确定性搜索保证正确性。
4. AI 是可降级的解释层，不是事实来源。
5. 库存、统一游戏数据、算法和评分均版本化；库存载荷在 24 小时内支持精确计算，
   过期后保留不可变的物化结果和版本审计而不保留全量库存。
6. 公会协作以默认共享为基础，但玩家保留主动关闭权限。
7. 第一版围绕“配种器”闭环，不提前建设通用监控平台。

## 24. 普通用户存档同步安装体验

公共存档同步客户端面向自行运行 Palworld 服务器的普通用户提供最短前台流程：

```text
npm install -g palbeacon-cli
palbeacon init
palbeacon run
```

账户页与所有未绑定引导中的 npm 包名固定为 `palbeacon-cli`，可执行 CLI 名固定为 `palbeacon`。
三步卡片的命令块均放在对应说明文字上方，形成一致的“标题 → 命令 → 说明”阅读顺序。

1. 第一版支持 Linux x64、Windows x64 和 Node.js 22 或更高版本。两个平台使用同一个
   `palbeacon-cli` npm 包与 `palbeacon` 命令；CLI 从包内自动选择对应的自包含 Parser，
   不在安装或运行时下载、编译 Parser，也不要求 Python、编译器或额外运行库。`init` 默认连接
   `https://www.palbeacon.app`，交互流程只询问一次性配对码与 Palworld 存档目录；
   `--url`、`--interval` 和 `--device-name` 仅作为高级覆盖参数。
2. `init` 检查平台、定位唯一世界存档、完成设备配对并以当前用户保存配置，不执行首次同步、
   不启动常驻进程，也不安装系统服务。Linux 配置继续位于
   `~/.config/palbeacon/config.json`，目录权限为 `0700`、文件权限为 `0600`；Windows 配置位于
   `%APPDATA%\PalBeacon\config.json`，不依赖 POSIX mode、管理员权限、注册表或系统服务。
3. 已有有效配置不得静默覆盖。交互终端必须明确说明会替换当前设备配置并取得确认；
   非交互调用必须显式传入 `--force`，否则返回稳定错误码。
4. `run` 是前台持续运行命令。启动后立即执行一次同步，随后按默认 300 秒间隔检查；
   存档未变化时发送 heartbeat，变化时继续使用既有只读快照、受控 Parser、脱敏、
   鉴权与上传链路。临时网络或解析失败只影响本轮，设备授权失效则停止并提示重新配对；
   `SIGINT` 与 `SIGTERM` 均应优雅退出。
5. 默认 CLI 帮助和账户页只突出安装、配对、运行、状态与退出。账户页独立展示并可复制
   配对码，高级非交互示例默认折叠；普通入口不展示 Parser 参数、哈希协议、systemd、ACL、
   专用用户、Service Role、迁移或发布流程。
6. `inspect`、单次同步、systemd 模板、Save Worker 切换、迁移、验证与回滚工具继续保留为
   开发和受控运维能力，但不进入普通用户 README、默认帮助或账户页主流程。
7. npm 包同时包含 `dist/bin/linux-x64/palworld-save-parser` 与
   `dist/bin/win32-x64/palworld-save-parser.exe`，以及各自的平台 manifest、SHA-256、许可证、
   第三方通知和同一源码 commit 说明。运行时必须校验平台、普通文件、非符号链接、名称、版本和
   SHA-256；Linux 还校验执行位。不得在安装脚本中提权、
   创建系统用户、写入 systemd、修改真实存档或控制 Palworld/mihomo。
10. Parser 始终只接收复制到当前用户临时目录的稳定快照，绝不接收原始存档路径。快照哈希中的
    逻辑相对路径固定使用 `/` 且按二进制字符串顺序排列，使同一输入在 Linux 与 Windows 得到同一
    `source_save_hash`。Windows 路径发现支持盘符、空格与 Unicode，只在用户给定目录下按受控深度
    搜索，跳过符号链接、junction 与不安全 reparse 路径；发现多个世界时不猜测默认世界。
11. Linux Parser 超时继续终止独立进程组；Windows Parser 使用隐藏窗口的直接子进程并且不发送负
    PID。两个 Parser 共享 decode-only palooz/ooz 源码、命令参数和 CanonicalSnapshot 语义，不联网、
    不启动子进程、不编码或写回 SAV。Windows artifact 静态链接 MinGW GCC/C++ 运行库，npm 包不得
    携带 MinGW DLL，也不得要求 Visual C++ Redistributable。
8. npm README 默认使用英文，并在开头提供同包简体中文版跳转。CLI 的帮助、交互提示、状态、
   运行日志和错误信息支持英文与简体中文；默认依次根据 `LC_ALL`、`LC_MESSAGES`、`LANG` 和
   Node.js locale 判断系统语言，无法判断或不受支持时使用英文。用户可在命令前或后通过
   `--locale en|en-US|zh|zh-CN` 显式覆盖；无效显式值返回稳定错误，不静默猜测。
9. 工作区左上角用户入口优先显示当前账号已绑定 Steam 身份的头像；头像不存在、不可加载或账号
   未绑定 Steam 时才显示当前显示名称的首字母。头像替代文本、下拉触发器可访问名称和首字母
   降级均使用当前界面语言与现有用户显示名称。

## 25. 顶部品牌、数据徽标与 GitHub 入口

1. Logo 组合只显示 PalBeacon 图形与英文 Wordmark，不再附加“帕鲁配种协作工作台”或
   “Pal Breeding Workspace”；Logo 图片替代文本同样只使用 `PalBeacon`。
2. workspace 浏览器页面标题继续使用 `PalBeacon`，不拼接配种工作台副标题；公开语言首页使用
   对应语言的准确 SEO 标题与描述，登录页使用本地化“登录/Sign in | PalBeacon”标题。页面描述、
   功能标题和配种器产品语义保持不变。
3. 数据状态徽标不再作为用户菜单外的独立 Header 入口。桌面用户下拉菜单与移动导航中的
   “数据状态”选项右侧展示紧凑徽标：未绑定角色为“未绑定”，有效最新库存为“最新”，其余
   已绑定但非最新状态为“已过期”；英文分别为 `Unbound`、`Latest`、`Expired`。
4. GitHub 图标入口位于每个语言切换器左侧，链接固定为
   `https://github.com/MetalLee/PalHatchHelper`，新标签页打开并使用安全的外链关系属性。入口使用
    适配 Header 的 18 像素 GitHub 标记、至少 44 像素点击区域、当前语言可访问名称和清晰焦点。
5. 网站 Logo 与浏览器图标使用同一份居中方形灯塔品牌图：母版为 1024×1024，应用图标为
   512×512，Apple 图标为 180×180，favicon 内含 16、32、48 像素版本。灯塔、左右光束和水波作为
   完整图案水平、垂直居中并保留安全边距，外部背景完全透明且不得残留色键或暗色底；manifest 的
   512×512 项引用 `/icon.png`。

## 26. 公开双语首页与搜索收录

1. `/zh` 与 `/en` 是无需登录、可静态生成且可索引的产品首页，不再重定向到 `/overview`；根路径
   继续由 next-intl 按显式语言、语言 Cookie、`Accept-Language` 与默认中文顺序重定向。
2. 首页只说明当前已实现的存档同步设备、角色认领、权限内库存、公会共享、确定性多代路线、候选
   比较、路线收藏与数据状态；不得宣传执行进度、候选子代确认或其他已从第一版移除的计划执行能力。
3. 普通同步流程固定为 `npm install -g palbeacon-cli`、`palbeacon init`、`palbeacon run`。当前 CLI
   支持 Linux x64、Windows x64 与 Node.js 22+；多个世界必须由用户把路径缩小到目标世界目录，CLI
   不替用户猜测，也不让用户手工选择与实际系统不一致的平台。
4. 正式 SEO host 固定为 `https://www.palbeacon.app`。两个首页使用 self-canonical、完整双向 hreflang、
   本地化 Open Graph/Twitter 图片和与可见 FAQ 一致的 WebSite、SoftwareApplication、FAQPage JSON-LD。
5. sitemap 只列出 `/zh` 与 `/en`。登录、workspace、管理员与动态任务/计划页面通过 metadata 和
   middleware `X-Robots-Tag` 双重 noindex；鉴权、Session Cookie、locale 与 `next` 返回地址保持不变。
6. 首页不查询 Session、Supabase 私有数据或 Service Role，不依赖客户端 hydration 显示正文。robots
   允许公开页面、可禁止 `/api/`，但不代替私有 HTML 响应的 noindex。
7. Hero 以 `Keep your Palworld visible` 为唯一主标题，把 PalBeacon 定位为汇总服务器存档、库存、
   数据状态和配种方案的清晰控制台；首屏不重复罗列只读、公会共享或脱敏上传等下方已有说明，
   也不提供重复的 GitHub CTA。
8. Hero 右侧使用公会库存、配种路线树和收藏计划三屏自动轮播，视觉与现有工作台一致但只使用
   固定展示数据，不查询 Session 或真实用户库存。轮播必须提供手动切换和暂停，并在 reduced-motion
   环境停止自动播放；轮播以外的首页正文继续由 Server Component 输出。
9. 可见文案面向玩家表达，删除实现校验、公开页面不会生成数据、Service Role 名称等开发者说明；
   同一卖点只在最合适的区块完整解释。中英文标题使用平衡换行，正文使用优化换行并在窄屏避免
   单字孤行和横向溢出。
10. 轮播页签是三个画面的唯一标题，画面内部不再重复 PalBeacon 控制台名称或页签标题。路线画面
    按“初始亲本 → 第 1 代 → 第 2 代”从左到右展开，同代的两个亲本上下排列并以曲线汇合到下一代
    子代。所有轮播 Pal 必须使用与本地头像 Stable ID 对应的真实 `en-US` / `zh-CN` 目录名称，不得
    使用“目标 A”“亲本”或猜测名称代替种类名。固定路线示例必须来自已验收目录关系，当前展示
    `carbunclo + sheepball -> bastet`、`bastet + naughtycat -> jellyfishghost`；它仍是与用户库存无关的
    固定预览，不查询 Session、业务 API 或生产数据库，也不得由 AI 生成或修改配种事实。
11. 核心能力区增加面向玩家的通信示意：Palworld 服务器存档由同机同步工具在本地读取，工具仅
    主动向 PalBeacon 云端同步必要数据，玩家浏览器再按账号与公会权限访问；图中不得暗示云端主动
    连接游戏服务器、开放新入站端口或上传完整存档。
12. Footer 品牌句统一为 `Keep your Palworld Visible.`，保留游戏名 `Palworld` 的正确拼写。
13. 三个轮播画面共享接近一致的内容高度。路线树保留节点所有者与位置信息，但使用紧凑间距减少
    整体高度；其中至少一个库存亲本展示为公会成员，库存亲本使用具体终端页码而不是“位置已记录”
    占位。路线下方代数和目标被动数必须与可见树一致；最终目标汇总两组亲本展示的四个被动。
    公会库存卡按“身份 → 所有者与位置 → 被动”排列，身份与详情之间不增加多余分割线，并适当
    增加卡片信息密度；收藏计划画面同时展示两张紧凑收藏卡，不用空白填充单卡区域。
    Landing 中的被动技能必须复用全局 `PassiveBadge` 和目录 rank 视觉规则；示例中的“认真、工匠精神、
    稀有、灵活”分别按 rank 1、3、4、1 展示，不手写猜测颜色；库存中的皮皮鸡示例使用“稀有”。
14. 公开首页顶部导航固定覆盖在 Hero 上方：页面位于顶端时背景、边框和阴影完全透明，向下滚动时
    白色背景、毛玻璃模糊、饱和度、边框和阴影按同一条平滑缓动曲线连续显现，不得在单一阈值突变。顶部 GitHub 入口只显示
    图标但保留可访问名称；语言切换必须复用控制台的弹出式单选菜单，桌面显示当前语言，移动端使用
    紧凑图标触发器，不再维护直接跳转到另一语言的第二套顶部控件。
15. “规划多代路线”能力卡只保留标题和主体说明，不额外展示“先找到集齐全部目标被动亲本”的提示。
    Footer 提供开发者邮件 `ghsy950525@gmail.com` 的可点击联系入口。浏览器图标由 Next.js 文件约定
    生成 metadata，避免以布局 metadata 固定无内容指纹的图标 URL，使本地图标更新可被浏览器识别。
16. Footer 不再重复提供 GitHub、登录/控制台和语言切换入口，只保留品牌信息、开发者邮件与版权。
    英文路线轮播中的状态与性别必须保持同一行，状态可在空间不足时省略，但性别和被动不得被挤出
    卡片；路线提示使用可在轮播宽度内单行展示的精简文案。

## 27. P0 搜索入口与首页产品定位

本节覆盖第 26 节第 7、16 项中关于首页 H1、CTA 数量与 Footer 链接的旧约束，其余公开首页边界继续有效。

1. `/zh` 与 `/en` 的唯一 H1 分别固定为“幻兽帕鲁服务器控制台”和
   `Palworld Server Console`；`Keep your world visible.` 作为 H1 上方品牌短句保留。首屏副标题先说明
   只读存档同步、个人与公会库存及多代配种协作，不查询 Session 或私有数据。
2. 新增四组可静态生成、无需登录、正文存在于服务端 HTML 的双语公开页：
   `/palworld-save-sync`、`/save-breeding-planner`、`/passive-breeding-route` 和
   `/guild-pal-inventory`。页面复用公开 Header、语言切换、Breadcrumb、FAQ、CTA、相关链接和 Footer，
   不继承 workspace noindex metadata。
3. 存档同步页只描述当前 `palbeacon-cli` 事实：Linux x64、Windows x64、Node.js 22+，以及
   `npm install -g palbeacon-cli`、`palbeacon init`、`palbeacon run`。源存档只读检查，稳定后复制到
   当前用户临时目录解析；不修改存档、不执行服务器控制、不上传完整存档，只上传库存与配种所需的
   脱敏投影。多世界时要求用户把路径缩小到含 `Level.sav` 与 `Players/` 的目标世界目录。
4. 配种与公会页面只说明当前已实现的真实库存、允许共享的公会候选、确定性合法路线、路线比较和
   只读收藏。不得宣称审批、聊天、自动借用、人工进度或候选子代识别；新同步只更新当前库存，玩家
   可据此重新计算，不改写已收藏路线。
5. 十个公开 URL 使用唯一标题与描述、self-canonical、`zh-CN`/`en`/`x-default` hreflang、正确的
   Open Graph locale、可索引 robots 和安全 JSON-LD。新内容页至少输出 `WebPage`、
   `BreadcrumbList`、与可见内容一致的 `FAQPage`。
6. sitemap 恰好列出两个首页和八个新语言页面，每项只引用对应的中英文 alternate，不写构建时间。
   首页内容卡、正文相关链接与 Footer 形成同语言的可抓取链接图；语言切换保持当前 slug。
7. 公开请求在 middleware 中不得为判断登录态访问 Supabase；登录页与 workspace/admin 的鉴权、
   `X-Robots-Tag`、noindex 和私有缓存策略保持不变。
8. 所有公开页必须包含独立玩家工具免责声明，不使用官方角色素材，不新增 SEO 第三方依赖，也不
   修改数据库、同步协议、CLI 命令、认证流程或配种算法。

## 28. 登录页公开首页返回入口

1. 登录页桌面端左侧品牌说明区增加本地化的“了解 PalBeacon”入口；英文使用
   `Explore PalBeacon`。入口使用语义化链接和现有按钮视觉，保持清晰焦点与至少 44 像素点击高度。
2. 入口通过 locale-aware 导航返回当前语言的公开首页，不查询 Session、不改变登录表单、Steam
   登录、`next` 返回地址、私有 noindex 或鉴权行为。

## 29. 首页 Hero CTA 收口

本节覆盖第 27 节中首页第三个存档同步 CTA 的旧要求。首页 Hero 只保留“开始使用”和“打开控制台”
两个按钮；删除“了解存档同步 / Learn about save sync”。存档同步公开页仍通过首页四张内容卡、
Footer 和正文内部链接提供可抓取入口。

## 30. 公共 Sync 世界身份、存档发现与公会有效性

1. `init` 选定真实世界目录后，必须从该目录名读取、校验并规范化 32 位十六进制世界 UID，
   与设备凭据一同持久化；既有配置在加载时从已保存的真实世界目录迁移该字段。`run` 与
   `inspect` 必须把此显式 UID 传给受控 Parser，不依赖调用者临时设置进程环境变量。
2. 当用户直接选择包含普通文件 `Level.sav` 的世界目录时，该目录优先成立，目录内的备份不得
    造成多世界误报；从上级目录发现时跳过 `backup`/`backups` 等非活动备份目录，但两个或以上
    独立活动世界仍返回 `MULTIPLE_WORLD_SAVES_FOUND`。符号链接不得用于绕过只读发现边界。
3. Parser 无法取得非空真实名称而标记为 `Unknown guild` 的公会不属于有效同步公会：公共上传
    不包含该公会记录，并清除玩家和帕鲁对它的公会引用。相关玩家及其个人帕鲁仍可按个人库存
    同步；仅依赖该未知公会的基地帕鲁保持 unresolved，且所有相关帕鲁均不得进入公会共享库存。
4. 世界 UID 缺失、格式无效或与存档不匹配必须保留稳定错误码并提供可执行的中英文提示，不能
    降级为无细节的通用同步错误。

## 31. Catalog 2.0、物品库存与递归配方

本节是第 2 节“基地布局和生产效率分析”及第 23 节“不提前建设通用监控平台”的窄范围例外，
只交付公会基地物品库存、趋势和确定性手工制作/烹饪配方计算，不扩展为服务器运行状态、自动化生产、
基地布局或生产效率监控平台。静态游戏事实继续来自固定游戏构建和确定性提取器，AI 不生成物品、
被动技能效果、配方或产量事实。

### 31.1 Catalog 2.0 版本边界

1. `game_data_version` 从七类目录升级为九类目录：`pals`、`passive_skills`、`active_skills`、
   `pal_active_skills`、`partner_skills`、`breeding_recipes`、`items`、`item_recipes` 和
   `localizations`。`breeding_recipes` 只表示帕鲁配种，物品制作配方不得混入该类别。
2. 新文件固定为 `items.jsonl` 与 `item-recipes.jsonl`。manifest、逐文件哈希、规范 content hash、
   source evidence、排除记录、未解析记录、验证报告、打包、发布与回滚和既有七类使用同一原子边界。
3. 文件集合和被动技能记录语义发生破坏性变化，schema version 固定升级为 `2.0.0`。Agent 必须继续
   读取历史 `1.1.0` 版本；已发布版本不可原地改写，世界切换和回滚仍只切换不可变版本指针。
4. `items` 提取当前游戏构建中的全部合法物品，而不是只提取素材与食物，以保证递归配方引用闭合。
   玩家库存界面只展示经过审计的 `TypeA`/`TypeB` 素材与食物分组，不按本地化名称猜测类型。
5. `item_recipes` 至少固定产品、批量产出数、最多五个有序材料及数量、工作量、工作属性、能量类型、
   解锁物品和 `DenyRecipeChain`。第一版产量计算只接受确认的手工制作和烹饪配方；牧场、采集、采矿、
   掉落和地图对象自动生产不计入可制作数量。
6. 旧物品 ID 通过游戏的静态重定向表规范化；无法映射的物品和配方保留稳定错误码与 source evidence，
   不静默丢弃、不以显示名称建立关系。

### 31.2 被动技能完整效果说明

1. `passive_skills` 增加 `description_template_key` 与结构化 `effects`。每个效果固定记录原始槽位、
   `target_type`、`effect_type`、`value` 和可选元素；`description_key` 继续指向玩家可直接显示的完整文本。
2. 描述由提取器按 locale 确定性生成：替换 `{EffectValue1}` 至 `{EffectValue4}`、展开已确认的
   `uiCommon` 本地化引用、移除仅用于表现的已知标签并统一换行。数值使用固定文化和固定精度格式，
   相同输入不得因运行主机 locale 改变 content hash。
3. 没有描述模板的可显示被动根据结构化效果和游戏 Common Text 生成说明。任何未知效果类型、未知标签、
   缺少的 Common Text 或残留模板变量都使验证失败；不得向玩家暴露原始枚举，也不得由 AI 补写事实。
4. 当前支持的三个 locale 中，每个可显示被动都必须有非空完整说明。原始模板和所有效果字段继续进入
   traceability；现有 Web/Supabase 通过 `description_key` 读取说明的接口保持兼容。

### 31.3 动态物品库存边界

1. Parser 始终从只读稳定副本解析基地、公会、物品容器和槽位；不得把真实存档路径交给 Parser，
   不得修改、修复或写回存档。CanonicalSnapshot 新版本增加 `bases` 与 `item_stacks`，堆栈至少包含
   容器稳定 ID、物品 ID、数量、容器类型、可选基地 ID、公会 ID和解析状态。
2. 公会库存只统计能够确定归属该公会基地的物理容器：箱子、冰箱、饲料箱和已完成生产输出。
   成员个人背包、世界掉落物、进行中的制作预留和无法归属基地的容器不进入公会或分基地总量。
   同一容器必须按稳定 ID 去重；无法归属的数据进入 `unresolved` 计数，绝不猜测基地。
3. 物品库存使用独立的 `item_inventory_snapshots` 和最新有效指针，并固定源存档哈希、捕获时间、
   `game_data_version_id`、解析器版本与质量状态。物品解析失败保留上一份有效物品快照，不阻断现有
   帕鲁库存发布；所有时间使用 UTC 和带时区 ISO 8601。
4. 浏览器和普通 RPC 只读取按世界、公会、基地、物品聚合的数据，不返回原始容器 ID。授权用户只能
   查看自身公会聚合，管理员保持受审计访问；Service Role 写入和现有 RLS 边界不放宽。
5. 被更新的堆栈级明细最多保留 24 小时；小时聚合保留 90 天；日聚合保留 1 年。最新有效快照始终
   保留。趋势查询返回总库存、各基地库存、相邻采样增减量、采样区间和数据新鲜度。

### 31.4 确定性递归产量

1. 产量查询以单个目标物品独立计算，使用当前有效物品快照的虚拟副本，不修改库存。返回
   `on_hand`、`craftable_additional`、`obtainable_total`、确定性 `recipe_plan` 和
   `limiting_materials`。
2. 第一版只以物料为硬约束，不因科技等级、工作台、帕鲁工作适应性、时间或电力降低数量；这些条件
   可以作为说明展示。替代配方分别返回，并以稳定配方 ID 和稳定排序标记最大方案。
3. 计算必须正确处理批量产出、已有中间产物抵扣、共享原料消费、替代配方、`DenyRecipeChain`、
   不可制作叶子和循环检测。共享库存使用单一消费账本，不得按节点独立缓存后重复使用同一原料。
4. 算法通过目标数量可行性检查和有界确定性搜索计算最大新增数量；超出复杂度限制时返回稳定错误码，
   不调用 AI，不给出未经验证的近似数量。所有结果固定物品快照与游戏目录版本以支持审计。

### 31.5 发布、兼容与验收

1. 先更新共享 JSON Schema，再生成 TypeScript/Python 契约；Extractor、Agent SQLite cache、Supabase
   staging/finalize、数据库目录表、查询 RPC、Web 和管理员计数必须在同一变更中支持九类目录。
2. 动态物品快照独立于静态 Catalog 发布。Catalog 2.0 可在没有生产物品快照时先验证和发布；功能
   开关关闭或物品快照缺失时，现有配种与帕鲁库存行为保持不变。
3. 验收至少覆盖：被动模板与缺省说明、三 locale、确定性哈希、物品重定向、配方引用闭合、Schema
   1.1.0/2.0.0 兼容、容器去重、基地归属、RLS、24 小时/90 天/1 年清理边界、趋势分桶、共享原料、
   替代配方、批量产出、禁止递归和配方环。
4. 真实验收只使用原始存档的只读复制件和受控本地 Supabase。不得部署生产、修改 `/opt/palworld`、
   开放新公网端口、控制 Palworld/mihomo 容器或推送远程仓库，除非另行取得阶段批准。
