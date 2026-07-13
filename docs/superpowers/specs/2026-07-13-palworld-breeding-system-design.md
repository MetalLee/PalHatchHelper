# PalHatch Helper 第一版系统设计

- 文档状态：已完成设计评审，待用户审阅正式规格
- 日期：2026-07-13
- 代码仓库：`https://github.com/MetalLee/PalHatchHelper.git`
- 服务器端部署目录：`/opt/services/palworld-manager`
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
5. 解析玩家、公会、帕鲁实例、所有者、性别、被动和位置。
6. 公会帕鲁默认可共享，玩家可以主动关闭自己帕鲁的共享状态。
7. 玩家选择目标帕鲁和最多四个期望被动。
8. 确定性算法使用版本化配种表计算合法路线。
9. 支持综合推荐、最快路线、最高成功率、最少借用四种评分模式。
10. 至少返回三条可比较的候选路线。
11. 路线可以转为可执行步骤清单。
12. 玩家可以手动管理步骤状态。
13. 新存档出现疑似子代时，系统仅提示候选，由玩家确认真实实例。
14. 配种数据支持远程拉取暂存、校验、管理员发布、手动上传和回滚。
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
| 配种表更新 | 定时拉取暂存 + 管理员发布 + 手动上传 + 回滚 |
| 前后端部署 | Vercel 前端 + Supabase 控制面 + 服务器私有 Agent |
| 服务器通信 | Agent 主动轮询 Supabase，不接受公网入站任务 |
| 存档同步 | 每 5 分钟检查，稳定后复制副本并解析 |
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
→ 固定库存快照、配种表和算法版本
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

#### `pal_snapshot_items`

- `id uuid primary key`
- `snapshot_id uuid`
- `world_id uuid`
- `pal_instance_uid text`
- `pal_id text`
- `owner_player_id uuid nullable`
- `guild_id uuid nullable`
- `gender text`
- `level integer nullable`
- `passive_skill_ids text[]`
- `location_type text`
- `location_name text nullable`
- `raw_metadata jsonb`
- 唯一约束：`snapshot_id + pal_instance_uid`

快照不可修改。`raw_metadata` 只保存经过筛选的扩展字段，不保存完整原始存档。

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

### 6.5 配种数据版本

#### `breeding_data_sources`

- `id uuid primary key`
- `name text`
- `source_type text check in ('github','url','upload')`
- `source_url text nullable`
- `enabled boolean`
- `fetch_schedule text nullable`

#### `breeding_data_versions`

- `id uuid primary key`
- `source_id uuid nullable`
- `external_version text nullable`
- `content_hash text unique`
- `status text check in ('staging','validated','published','rejected')`
- `validation_report jsonb`
- `imported_at timestamptz`
- `published_at timestamptz nullable`
- `published_by uuid nullable`

#### `breeding_recipes`

- `version_id uuid`
- `parent_a_pal_id text`
- `parent_b_pal_id text`
- `child_pal_id text`
- `recipe_type text check in ('normal','special')`
- `metadata jsonb`

父母顺序必须归一化，`A × B` 与 `B × A` 为同一组合。

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
- `breeding_data_version_id uuid`
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
- `score_breakdown jsonb`

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
5. 发布或回滚配种数据。
6. 创建或修改其他玩家的计划。

### 7.2 管理员

可以：

1. 查看全服玩家、公会、库存和任务。
2. 管理用户与玩家绑定。
3. 批量修改共享设置。
4. 审核、发布和回滚配种数据。
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
- 标准化元数据长期保存在 Supabase。
- 完整存档不上传 Supabase。

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
├── gender
├── level
├── passive_skill_ids[]
├── location_type
└── location_name
```

### 9.4 校验规则

1. `world_uid` 必须存在并匹配当前世界。
2. 玩家 UID 不得出现冲突映射。
3. 帕鲁实例 UID 在快照内唯一。
4. 帕鲁种类必须能映射到目录数据；未知值记录告警。
5. 性别只接受受支持枚举或 `unknown`。
6. 未识别被动保留原值并标记，不丢弃整只帕鲁。
7. 无法确认公会或所有者的帕鲁标记为 `unresolved`，不进入共享池。
8. 库存数量异常下降时进入待审核状态。

默认异常下降阈值：新快照帕鲁总数低于上一有效快照的 50%，且绝对减少超过 50 只时，不自动发布。

## 10. 配种数据更新

数据源适配器包括：

- `GitHubDataSource`
- `UrlDataSource`
- `UploadDataSource`

定时任务只拉取到 staging，不自动覆盖线上版本：

```text
下载原始数据
→ 计算哈希
→ 转换为统一配方格式
→ 结构校验
→ 关系校验
→ 回归测试
→ staging/validated
→ 管理员审核发布
```

校验内容：

1. 帕鲁 ID 合法性。
2. 父母和子代字段完整性。
3. 普通配方与特殊配方格式。
4. 父母无序组合归一化。
5. 重复、冲突和自相矛盾配方。
6. 特殊配方优先级。
7. 仓库内已知配方回归用例。
8. 目标帕鲁路径可达性用例。

发布和回滚只切换 `worlds.active_breeding_version_id`。历史版本不删除，运行中的任务继续使用领取时固定的版本。

## 11. 确定性配种算法

### 11.1 输入

- 目标帕鲁。
- 0 到 4 个期望被动。
- 固定库存快照。
- 公会共享偏好。
- 固定配种表版本。
- 优化模式。
- 最大代数，默认 5。

### 11.2 候选库存

包含：

1. 玩家自己的全部可用帕鲁。
2. 同公会 `share_enabled=true` 的帕鲁。

排除：

1. 所有者或公会无法确认。
2. 已从当前快照消失。
3. 已关闭共享且不属于请求玩家。
4. 管理员禁用或标记不可配种。
5. 性别不满足当前步骤。
6. 被同一执行计划锁定且配置不允许复用。

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
+ breeding_data_version
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

新快照中发现满足种类、首次出现时间和被动要求的实例时，写入候选表。系统不自动完成步骤，由玩家选择实际使用的子代。

确认后：

1. 保存真实 `pal_instance_uid`。
2. 完成当前步骤。
3. 重新校验下一步的性别与可行性。
4. 不满足时提供替代组合或重新计算。

## 16. 方案可复现与失效

每个方案固定：

```text
库存快照版本
+ 配种数据版本
+ 算法版本
+ 评分版本
+ AI Provider 记录
```

以下情况标记方案可能失效：

1. 依赖帕鲁关闭共享。
2. 帕鲁转移所有者。
3. 帕鲁从最新快照消失。
4. 配种表发布新版本。
5. 玩家确认了与原路线不同的中间子代。
6. 所需性别不再满足。

历史方案不删除，前端显示失效原因，并提供“基于最新库存重新计算”。

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
├── 配种数据
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
- 所有者。
- 性别。
- 被动。
- 位置。
- 共享状态。
- 计划占用状态。
- 稀有被动。

自己的帕鲁显示共享开关；其他玩家帕鲁只显示共享状态。每只帕鲁可“作为配种起点”。

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
- 当前库存快照与配种表版本。

选择器支持名称、编号、属性、最近选择、已拥有标记和公会拥有数量。

计算过程使用真实阶段，不显示虚假百分比：

```text
已锁定库存快照
已加载配种数据
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
- 库存、配种表、算法和 AI 版本。

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
- 配种数据有待审核版本。

普通玩家可查看同步时间、快照版本、配种表和算法版本。管理员额外查看 Agent 心跳、Parser 版本、失败记录、待处理任务和手动同步入口。

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
│   ├── breeding-data/
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
| 配种表校验失败 | 保持 staging，不影响线上版本 |
| Agent 重启 | 回收超时任务继续执行 |
| 帕鲁容器停止 | 仅告警，不自动启动或修改 |

## 20. 测试要求

### 20.1 后端

1. ParserAdapter 契约测试。
2. 脱敏存档样例解析测试。
3. 复制期间源文件变化测试。
4. 相同哈希跳过解析测试。
5. 异常库存下降保护测试。
6. 配种表导入、校验、发布和回滚测试。
7. 特殊配方优先级测试。
8. 多代路线搜索测试。
9. 性别不满足时替代路线测试。
10. 被动组合和评分测试。
11. 共享关闭后的排除测试。
12. 任务重复领取与锁超时测试。
13. AI 三级降级测试。
14. 历史方案可复现测试。

### 20.2 数据库与权限

1. 普通玩家无法查看他人完整库存。
2. 普通玩家只能修改自己的共享设置。
3. 普通玩家不能发布配种数据。
4. 管理员具备全服管理权限。
5. 任务创建 RPC 固定当前可用快照和配种表版本。
6. 原子领取函数不会重复领取任务。

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
7. 任务使用固定库存、配种表、算法和评分版本。
8. 算法只输出配种表中可验证的合法路线。
9. 至少返回三条具有评分明细的候选路线；不足三条时返回全部合法路线并解释原因。
10. AI 不可用时仍能显示完整算法结果。
11. 玩家可以采用路线并生成执行步骤。
12. 玩家可以手动推进步骤。
13. 新快照可以提示候选子代，但不会自动确认。
14. 确认子代后后续步骤使用真实实例重新校验。
15. 配种表可暂存、校验、发布和回滚。
16. 旧方案仍可按原版本查看和解释。
17. 依赖帕鲁不可用时方案显示失效原因并可重新计算。
18. 手机端可以完成登录、创建任务、查看结果、推进步骤和确认子代。
19. 服务器不新增公网业务端口。
20. 新系统异常不会自动修改或重启帕鲁服务器。

## 22. 后续扩展方向

### 第二阶段

- 一次性角色认领码。
- 更完整的管理员监控。
- RCON 手动安全保存后立即同步。
- 可配置共享和计划占用策略。
- 配种数据可信来源自动发布策略。

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
5. 存档、配种数据、算法和评分均版本化，结果可复现。
6. 公会协作以默认共享为基础，但玩家保留主动关闭权限。
7. 第一版围绕“配种器”闭环，不提前建设通用监控平台。
