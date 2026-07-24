# PalHatch Helper 第一版系统设计

- 文档状态：已完成设计评审；2026-07-24 库存快照 24 小时保留修订、Boss/公会库存修订和库存位置/次元帕鲁仓库修订已批准；Phase 4 implementation=completed、automated_gates=passed、real_data_acceptance=completed、local_test_publish=completed、production_publish=not_started；Phase 5 implementation=completed、automated_gates=passed；Phase 6 implementation=completed、automated_gates=passed、local_integration=completed、production_deploy=not_started
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
→ 比较并采用方案
→ 按步骤执行
→ 从新存档中提示候选子代
→ 玩家确认真实子代
→ 推进到最终目标
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
10. 至少返回三条可比较的候选路线；库存不足时仍返回合法的缺口路线并明确所缺父本、母本、性别和被动要求。
11. 库存完整的路线可以转为可执行步骤清单；含缺失父母的路线只能比较和提示补充库存，不能直接采用。
12. 玩家可以手动管理步骤状态。
13. 新存档出现疑似子代时，系统仅提示候选，由玩家确认真实实例。
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
| 计划进度 | 玩家管理任务清单，存档提供候选子代提示 |
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
它用于在历史快照明细清理后继续判断候选子代是否为新实例。

#### `execution_plan_dependencies`

- `plan_id uuid`
- `pal_instance_uid text`
- `owner_player_id_at_adoption uuid nullable`
- `guild_id_at_adoption uuid nullable`
- `gender_at_adoption text`
- 主键：`plan_id + pal_instance_uid`

采用路线时只固化执行计划所依赖库存父母的最小状态。计划失效检查以该表和最新库存比较，
不依赖已经过期的原库存快照明细。

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

路线载荷中的每个父母来源为 `inventory`、`intermediate` 或 `missing`。`missing` 只表达确定性的需求占位，必须包含帕鲁稳定 ID、所需性别和所需被动，不得伪造实例 UID、所有者、位置或已拥有被动。路线同时保存按 `pal_id + gender + required_passive_ids` 聚合的 `missing_requirements` 与 `adoptable`；只有 `ready` 路线可采用。

#### `breeding_steps`

- `id uuid primary key`
- `route_id uuid`
- `step_index integer`
- `parent_a_instance_uid text nullable`
- `parent_b_instance_uid text nullable`
- `expected_child_pal_id text`
- `required_passive_ids text[]`
- `selected_child_instance_uid text nullable`
- `status text`
- `completed_at timestamptz nullable`

#### `step_offspring_candidates`

- `step_id uuid`
- `pal_instance_uid text`
- `detected_snapshot_id uuid`
- `match_score numeric`
- `matched_passive_ids text[]`
- `first_detected_at timestamptz`
- `confirmed boolean default false`

## 7. 权限与 RLS

### 7.1 普通玩家

可以：

1. 查看绑定角色的完整库存。
2. 修改自己帕鲁的共享设置。
3. 查看同公会可共享帕鲁的最小必要信息。
4. 创建和查看自己的配种任务。
5. 查看并更新自己计划的执行状态。
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
- `execution_candidate_detection_runs` 随对应过期快照清理。候选、任务、路线、计划、
  步骤、事件、玩家、公会和共享偏好是业务历史或跨快照状态，不随快照级联删除。
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
6. 被同一执行计划锁定且配置不允许复用。
7. 属于其他玩家且位于次元帕鲁仓库，但访问范围为 `player` 或 `unresolved`。

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

## 15. 执行计划与候选子代

步骤状态：

- `not_started`
- `breeding`
- `candidate_detected`
- `completed`
- `retrying`
- `skipped`
- `invalidated`

发布快照时幂等更新 `pal_instance_lifecycle`。新快照中发现满足种类、实例
`first_seen_at` 晚于当前步骤候选检测起点且符合被动要求的实例时，写入候选表。
候选保存用于历史展示和确认的脱敏物化字段，不依赖快照明细长期存在。系统不自动完成步骤，
由玩家选择实际使用的子代。

确认后：

1. 保存真实 `pal_instance_uid`。
2. 完成当前步骤。
3. 重新校验下一步的性别与可行性。
4. 不满足时提供替代组合或重新计算。

## 16. 方案可复现与失效

每个方案在计算时固定：

```text
库存快照版本
+ 游戏数据版本
+ 算法版本
+ 评分版本
+ AI Provider 记录
```

以下情况标记方案可能失效：

1. 依赖帕鲁关闭共享。
2. 帕鲁转移所有者。
3. 帕鲁从最新快照消失。
4. 游戏数据发布新版本。
5. 玩家确认了与原路线不同的中间子代。
6. 所需性别不再满足。

历史方案不删除，已物化的路线、评分明细、版本和解释保持不变并可查看。库存快照明细过期后，
不再保证使用原库存重新运行算法；游戏数据、算法和评分版本仍保持精确版本边界。
前端显示失效原因，并提供“基于最新库存重新计算”。

## 17. 前端产品设计

### 17.1 产品定位

第一版前端是“帕鲁配种协作工作台”，不是通用服务器管理后台。配种创建、方案比较、执行步骤和子代确认是绝对主线。

技术栈：

- Next.js + TypeScript。
- shadcn/ui。
- Tailwind CSS。
- Supabase Auth 与浏览器客户端。
- 深色优先、现代游戏工具风格。

### 17.2 左侧导航

普通玩家桌面端导航固定为：

```text
概览
帕鲁列表
配种器
历史计划

数据状态（固定在底部）
```

管理员入口放入用户头像菜单：

```text
管理后台
├── 玩家绑定
├── 存档与解析
├── 游戏数据
├── 任务与 AI
└── 系统设置
```

### 17.3 移动端导航

底部导航：

```text
概览 | 帕鲁 | 配种器 | 计划
```

数据状态在顶部状态入口或用户菜单中展示。

### 17.4 概览页

展示：

- 当前进行中的计划。
- 待确认子代。
- 最近完成计划。
- 我的帕鲁数量。
- 公会可共享帕鲁数量。
- 最新库存同步时间。
- 打开配种器的快捷入口。

没有计划时显示明确空状态；有计划时优先展示当前步骤和候选子代。

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
- 计划占用状态。
- 稀有被动。

自己的帕鲁显示共享开关；其他玩家帕鲁只显示共享状态。每只帕鲁可“作为配种起点”。
公会所有的基地工作帕鲁显示在“全部”和“公会共享”，所有者显示公会名，不显示个人共享开关。
头目个体显示“头目”徽标。位置使用一致的诚实降级：基地显示基地名或稳定短 ID及工作位；
普通帕鲁终端和次元帕鲁仓库显示第几页、第几格；无法证明精确位置时仅显示位置类型或
“位置未解析”，不得展示原始容器 GUID。

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

计算过程使用真实阶段，不显示虚假百分比：

```text
已锁定库存快照
已加载固定游戏数据
正在搜索合法路线
正在综合评分
正在生成说明
```

AI 失败但算法成功时，任务仍成功并显示模板说明。

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

`needs_inventory` 路线显示“补齐库存后重新计算”，禁用采用操作；不得把缺失占位写入执行步骤。`ready` 路线才显示采用入口。

允许最多三条路线横向比较。移动端使用纵向卡片。

### 17.8 历史计划

`/plans` 是统一计划中心，不只存放已完成记录。状态筛选：

```text
全部 | 进行中 | 待确认 | 已完成 | 已暂停 | 已失效
```

包含：

- 正在执行的计划。
- 待选择路线的计算结果。
- 待确认子代。
- 已完成、暂停和失效计划。

### 17.9 计划详情

页面优先展开当前步骤。已完成和未开始步骤折叠。

玩家可执行：

- 标记为配种中。
- 查看候选子代。
- 确认真实子代。
- 继续尝试。
- 选择已有帕鲁作为步骤结果。
- 跳过步骤。
- 暂停计划。
- 基于最新库存重新计算。

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

### 17.11 关键状态

所有核心页面必须覆盖：

- 加载中。
- 空状态。
- 数据过期。
- 解析异常。
- 方案失效。
- AI 降级。
- 没有合法路线。
- 权限不足。
- 账号未绑定游戏角色。

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
17. 历史方案物化结果不可变、过期库存不被重新加载测试。
18. 24 小时边界、最新快照保护、分批清理、相同哈希重新发布和并发发布互斥测试。
19. 实例生命周期、执行计划依赖和清理后候选检测/失效检查测试。
20. Boss 前缀库存 ID 标准化、`IsBoss`/前缀头目标志合并、公会所有基地帕鲁解析、列表展示、
    配种可用性和计划生命周期测试。
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
8. 清理不会删除最新库存、历史方案、共享偏好或候选物化历史。

### 20.3 前端

1. 登录与未绑定角色状态。
2. 帕鲁列表三种范围和筛选。
3. 共享开关和批量操作。
4. 配种器创建任务。
5. 异步任务刷新后恢复。
6. 至少三条路线比较。
7. 创建执行计划。
8. 步骤状态更新。
9. 候选子代确认。
10. 方案失效和重新计算。
11. AI 降级提示。
12. iPhone Safari、Android Chrome 和微信浏览器基础流程。

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
11. 玩家只能采用库存完整的 `ready` 路线并生成执行步骤；缺库存路线不可采用且可在补齐库存后重新计算。
12. 玩家可以手动推进步骤。
13. 新快照可以提示候选子代，但不会自动确认。
14. 确认子代后后续步骤使用真实实例重新校验。
15. 游戏数据可暂存、校验、发布和回滚。
16. 旧方案仍可按原版本查看和解释。
17. 依赖帕鲁不可用时方案显示失效原因并可重新计算。
18. 手机端可以完成登录、创建任务、查看结果、推进步骤和确认子代。
19. 服务器不新增公网业务端口。
20. 新系统异常不会自动修改或重启帕鲁服务器。
21. 已被取代的数据库库存明细在写入 24 小时后可被分批清理，最新有效库存始终可用。
22. 快照明细清理后，候选子代检测和执行计划依赖失效检查仍基于轻量持久状态正确运行。
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
