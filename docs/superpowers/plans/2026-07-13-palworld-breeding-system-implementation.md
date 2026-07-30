# PalHatch Helper 分阶段实施计划

- 2026-07-31 Catalog 2.0、物品库存与递归配方修订：design=approved、implementation=in_progress、production_deploy=not_started
- 修订状态：2026-07-31 公共 Sync 世界身份、存档发现与公会有效性修订 design=approved、implementation=completed、affected_automated_gates=passed、production_deploy=not_started
- 日期：2026-07-13
- 状态：2026-07-30 Landing 轮播真实名称与配方修订 design=approved、implementation=completed、affected_automated_gates=passed、browser_acceptance=passed、production_deploy=not_started；2026-07-30 公开双语首页与搜索引擎收录修订 design=approved、implementation=completed、affected_automated_gates=passed、browser_acceptance=passed、production_deploy=not_started；2026-07-29 顶部品牌、数据徽标与 GitHub 入口修订 design=approved、implementation=completed、affected_automated_gates=passed、browser_acceptance=passed、production_deploy=not_started；2026-07-29 未绑定引导、Steam 头像与导航收口修订 design=approved、implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-28 中英文 i18n 与语言路由修订 design=approved、implementation=in_progress、production_deploy=not_started；2026-07-28 全局被动单排交替三角纹理修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-28 已选被动定宽与计划卡片左对齐修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-28 计划网格与配种被动布局修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-28 配种工作台目标与被动布局、五代上限和 Phase 5 验收提速修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-28 我的计划与配种路线视觉收口修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-27 配种工作台创建页聚焦与被动效果说明修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-27 全局被动品级视觉与库存被动多选修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-27 帕鲁库存用户体验收口修订 implementation=completed、affected_automated_gates=passed、production_deploy=not_started；2026-07-27 路线语义去重、2000+ 库存容量与“我的计划”收藏化修订 implementation=completed、automated_gates=passed、production_deploy=completed；2026-07-24 库存快照 24 小时保留修订 implementation=completed、automated_gates=passed、production_deploy=not_started；Boss/公会库存修订 implementation=completed、automated_gates=passed；库存位置/次元帕鲁仓库修订 implementation=completed、automated_gates=passed、production_deploy=completed；Phase 4 implementation=completed、automated_gates=passed、real_data_acceptance=completed、local_test_publish=completed、production_publish=not_started；Phase 5 implementation=completed、automated_gates=passed；Phase 6 implementation=completed、automated_gates=passed、local_integration=completed、production_deploy=completed
- 唯一需求来源：`docs/superpowers/specs/2026-07-13-palworld-breeding-system-design.md`
- 交付原则：每个阶段独立验收；数据库、契约、算法与部署均保持可回滚；任何阶段都不修改 `/opt/palworld` 或帕鲁原始存档。

## Phase 0：Harness、单仓骨架与 CI

### 阶段目标

建立可运行、可测试、可持续集成的 pnpm + uv 单仓基线，并固化安全边界、契约优先原则和后续实施路径。

### 前置依赖

- 正式设计规格已存在并完成阅读。
- 本地可使用 Git；Node.js 22 或更高版本、pnpm、Python 3.12、uv 和 Docker 分别按验证项使用。

### 明确范围

- Next.js App Router 最小首页和健康接口。
- FastAPI 本地健康与 readiness 接口、配置校验和 Pydantic 示例模型。
- contracts、pal-catalog、ui 包的最小实现和测试。
- Supabase、Docker Compose、Vercel、文档、环境变量和 CI 骨架。
- 根级 lint、format、typecheck、test、build、check 入口与秘密扫描。

### 明确不实现的内容

- Supabase 业务表、RLS、RPC、认证和真实项目连接。
- 存档读取、复制、解析、Worker、配种数据导入和配种算法。
- 正式产品页面、完整 shadcn/ui 组件集、生产部署与公网端口。

### 预计新增或修改的文件

- 根目录：`AGENTS.md`、`README.md`、`package.json`、workspace/格式化/环境配置。
- `apps/web/**`、`apps/agent/**`、`packages/{contracts,pal-catalog,ui}/**`。
- `supabase/**`、`infra/**`、`data/**`、`.github/workflows/ci.yml`。
- `docs/architecture/**`、`docs/operations/**`、`docs/decisions/0001-0003-*.md`。

### 数据库迁移

仅建立 `supabase/migrations` 规范说明；不创建业务表、策略或函数。

### API 和契约

- Web：`GET /api/health`。
- Agent：`GET /healthz` 与 `GET /readyz`。
- 示例契约：`system-status.schema.json`，字段为 `status`、`service`、`version`、`timestamp`。

### 测试要求

- Web 首页、Web 健康接口、共享 UI、catalog fixture、契约校验测试。
- Agent 健康接口、开发/生产 readiness、模型和无效配置测试。
- ESLint、Prettier、TypeScript、Ruff、mypy、pytest 和构建全部实际执行。

### 验收标准

- `pnpm check` 通过，Agent 的五条 uv 验证命令通过。
- Next.js 构建成功；Agent 镜像在 Docker 可用时构建成功。
- CI 无需生产密钥且不访问生产环境。
- Git diff 不含密钥、生产数据或 Phase 1 业务实现。

### 风险

- 本地工具版本与 CI 不一致；通过版本文件、lockfile 和 CI 显式版本降低风险。
- Next.js 与 workspace 包的模块解析差异；通过 workspace 依赖和构建验证控制。
- JSON Schema 的 TS/Python 模型漂移；本阶段以共享 fixture 做双端验证，Phase 1 引入生成检查。

### 回滚方式

删除本阶段新增的未提交文件并恢复本阶段修改的 README；不涉及数据库或生产状态回滚。执行前先用 `git diff` 确认仅包含 Phase 0 文件。

### 可独立执行的任务列表

1. 编写计划、AGENTS、ADR 与开发文档。
   - 验证：`rg -n "Phase [0-8]|/opt/palworld|共享契约" AGENTS.md docs README.md`
2. 建立根 workspace、格式化、lint 和秘密扫描配置。
   - 验证：`pnpm install --frozen-lockfile && pnpm format:check`
3. 先编写 Web 与共享包测试，确认在实现前失败，再添加最小实现。
   - 验证：`pnpm --filter @palhatch/web test && pnpm --filter @palhatch/ui test && pnpm --filter @palhatch/contracts test`
4. 先编写 Agent 测试，确认在实现前失败，再添加最小实现。
   - 验证：`cd apps/agent && uv run pytest`
5. 建立 Supabase、Docker、Vercel 和 CI 骨架。
   - 验证：`pnpm check:structure && docker compose -f infra/agent/docker-compose.yml config`
6. 执行全量验证并检查差异。
   - 验证：`pnpm check && (cd apps/agent && uv run ruff check . && uv run ruff format --check . && uv run mypy src && uv run pytest) && git diff --check`

## Phase 1：Supabase 数据模型、RLS、RPC 和共享契约

### 阶段目标

用可审计迁移实现设计规格的数据模型、行级权限和原子数据库操作，并从统一 Schema/OpenAPI 产出前后端契约。

### 前置依赖

- Phase 0 CI 通过。
- 本地 Supabase CLI 环境可启动，测试只使用本地实例。

### 明确范围

- profiles、绑定、世界、公会、玩家、不可变库存快照、共享偏好、配种版本、任务与计划相关表。
- 管理员、普通玩家和 Agent 权限；任务创建、原子领取、心跳/回收、共享设置 RPC。
- 枚举、约束、索引、UTC 时间和稳定错误码。

### 明确不实现的内容

- Agent 轮询进程、真实存档解析、算法执行、正式前端页面。
- 自动创建生产项目或写入生产凭证。

### 预计新增或修改的文件

- `supabase/migrations/*.sql`、`supabase/tests/*.sql`、本地 seed fixture。
- `packages/contracts/schemas/**`、生成脚本、生成的 TypeScript 与 Python 模型。
- 数据模型和权限文档。

### 数据库迁移

按依赖顺序拆分基础枚举与身份、世界与库存、共享、配种版本、任务/路线/步骤、RLS、RPC；每个迁移只前向追加且在本地空库和已有库升级路径验证。

### API 和契约

- Auth 用户上下文和角色声明契约。
- 创建任务、领取任务、刷新心跳、完成/失败任务、切换共享和查询可用库存 RPC。
- 所有 JSON 返回值具有 Schema 和稳定错误码。

### 测试要求

- pgTAP 覆盖规格中的六项数据库与权限要求。
- 迁移重放、约束、幂等键、并发领取与契约生成无漂移测试。

### 验收标准

- 本地数据库从空状态完整迁移；普通用户无法越权，管理员和 Agent 权限符合规格。
- 同一任务不会被两个 Worker 领取；RPC 固定快照、数据和算法版本。
- TS 与 Pydantic 模型来自同一契约源且 CI 检查生成差异。

### 风险

- RLS 递归或 service role 误用；使用 security definer 函数的固定 search_path 与最小授权。
- 迁移不可逆数据变更；此阶段无生产数据，仍使用补偿迁移而非修改历史迁移。

### 回滚方式

本地重置数据库；已共享环境用新增补偿迁移撤销对象或策略，并将应用切回上一兼容契约版本。

### 可独立执行的任务列表

1. 建表、约束和索引。
   - 验证：`supabase db reset && supabase db lint`
2. 实现角色与库存 RLS。
   - 验证：`supabase test db --file supabase/tests/rls.sql`
3. 实现任务与共享 RPC。
   - 验证：`supabase test db --file supabase/tests/rpc.sql`
4. 建立契约生成和漂移检查。
   - 验证：`pnpm contracts:generate && git diff --exit-code -- packages/contracts apps/agent/src/pal_hatch_helper/generated`
5. 运行阶段回归。
   - 验证：`pnpm check && supabase test db`

## Phase 2：Python Agent、任务轮询与数据库访问

### 阶段目标

实现私有 Agent 的进程入口、Supabase 出站轮询、数据库 Adapter、任务租约和可靠恢复，不提供公网任务 API。

### 前置依赖

- Phase 1 数据库、RPC 与契约稳定。
- 仅测试环境的 Supabase URL 和凭证可用。

### 明确范围

- `api`、`job-worker`、`save-worker` 命令入口和配置分层。
- SupabaseRepository Adapter、原子领取、心跳、退避、幂等完成、结构化日志和状态指标。
- FastAPI 保持本地健康/readiness，不暴露创建或领取任务接口。

### 明确不实现的内容

- 真实 Parser、存档复制、配种算法和 AI 调用。
- 修改或控制 Palworld/mihomo 容器。

### 预计新增或修改的文件

- `apps/agent/src/pal_hatch_helper/{cli,workers,repositories,models,observability}/**`。
- Agent 单元/集成测试、Compose 命令和运行手册。

### 数据库迁移

仅在测试证明缺少必要约束或观测字段时新增向前兼容迁移，不改变 Phase 1 的权限边界。

### API 和契约

- 内部 Repository Protocol 与任务租约 Pydantic 模型。
- 健康接口增加不泄密的 Worker/Supabase 状态摘要。

### 测试要求

- 暂时不可用重试、重复领取、锁超时、心跳、取消、进程重启和无凭证 readiness。
- 使用 fake repository 做单元测试，使用本地 Supabase 做集成测试。

### 验收标准

- Worker 只主动出站轮询；故障时指数退避且不丢任务。
- 两个测试 Worker 不重复执行同一任务；日志不含 service role。
- 三种命令可由同一镜像运行，API 仍只绑定回环地址。

### 风险

- 租约边界出现重复执行；以数据库原子领取和幂等写入保证最终一致。
- 网络故障造成紧密重试；使用有上限的指数退避和抖动。

### 回滚方式

停止测试 Worker，切回 Phase 1 无 Worker 状态；数据库中的 pending/retry_pending 任务保留，过期锁由 RPC 回收。

### 可独立执行的任务列表

1. 实现 CLI 与配置。
   - 验证：`cd apps/agent && uv run pal-hatch-helper --help && uv run pytest tests/test_cli.py`
2. 实现 Repository Adapter。
   - 验证：`cd apps/agent && uv run pytest tests/repositories`
3. 实现轮询、心跳和恢复。
   - 验证：`cd apps/agent && uv run pytest tests/workers`
4. 本地 Supabase 集成验证。
   - 验证：`supabase start && supabase db reset && eval "$(supabase status -o env)" && (cd apps/agent && TEST_SUPABASE_URL="${API_URL}" TEST_SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY} uv run pytest -m integration)`
5. 阶段回归。
   - 验证：`pnpm check && cd apps/agent && uv run ruff check . && uv run mypy src && uv run pytest`

## Phase 2.5：游戏静态目录数据基础设施

### 阶段目标

在 Phase 2 私有 Agent 与 Supabase 基础上，建立“原始提取结果 → 标准化不可变目录包 → PostgreSQL 查询投影”的统一游戏数据版本能力，为目录搜索和后续确定性配种算法提供可发布、可回滚、可精确复现的数据事实源。

### 前置依赖

- Phase 2 Agent、Repository、租约恢复和数据库权限回归通过。
- 仅使用明确标注为虚构数据的目录 fixture；不连接生产 Supabase 或真实游戏安装目录。

### 明确范围

- 帕鲁、被动、主动技能、帕鲁技能、伙伴技能、本地化与普通/特殊配种关系的共享 JSON Schema，以及生成的 TypeScript/Pydantic 模型。
- 规范 JSONL、逐文件 SHA-256、稳定 `content_hash`、manifest、validation report、确定性 `tar.gz` 和原子本地目录。
- `game_data_sources`/`game_data_versions`、七类关系投影、批次 staging/finalize、私有 Storage bucket、发布/回滚和只读目录 RPC。
- 旧 `breeding_data_*` 与旧 world/job 字段的 UUID 复用、回填和兼容双写；新任务以 `game_data_version_id` 为权威。
- Agent Local/Supabase ArtifactStore、进程内/SQLite 缓存、精确版本 Repository、CLI 与不泄密健康摘要。

### 明确不实现的内容

- `.pak`、`.utoc`、`.ucas` 真实解析和任何第三方游戏包工具集成。
- 真实目录导入、游戏二进制资产、完整存档、Phase 3 安全快照、Phase 4 路线搜索、前端正式目录页面和生产部署。

### 主要文件

- `packages/contracts/schema/game-catalog.schema.json` 与两端生成模型。
- `packages/pal-catalog/src/**`、`apps/agent/src/pal_hatch_helper/game_catalog/**`。
- `supabase/migrations/20260714020000_versioned_game_catalog.sql` 与 `supabase/tests/game_catalog.sql`。
- `data/catalog-fixtures/**`、ADR 0004 和游戏目录操作文档。

### 数据库迁移

只追加 Phase 2.5 前向迁移。导入使用可重试批次；finalize 事务性写关系投影并只将完整版本标记为 validated。发布和回滚只切换指定世界指针，不删除旧版本。authenticated 用户不能访问 staging、修改目录事实或直接下载私有制品。

### API 和契约

- `GameCatalogManifest`、`GameDataVersion` 和七类目录记录/校验/文件校验和 Schema。
- Service Role RPC：`begin_game_data_import`、`stage_catalog_batch`、`finalize_catalog_import`、精确版本元数据/投影读取。
- 管理 RPC：`publish_game_data_version`、`rollback_game_data_version`。
- 浏览器只读 RPC：`search_catalog_pals`、`search_catalog_passive_skills`、`get_game_data_status`。

### 测试要求

- TS：Schema、生成漂移、规范 JSONL、排序和 hash 输入稳定性。
- Python：非法 JSON/重复/外键、manifest/hash、bundle、原子目录、SQLite、制品 Adapter、CLI 和精确版本不回退。
- pgTAP：升级回填、批次幂等、finalize 原子性、父母归一化、发布/回滚权限、任务固定、私有 Bucket 和 RLS。

### 验收标准

- 相同规范内容不受文件顺序、修改时间或绝对路径影响，稳定产生相同 `content_hash`。
- 虚构最小 fixture 可完成 validate → stage → finalize → publish → exact load → SQLite cache → rollback。
- 历史任务请求版本缺失或损坏时返回稳定错误，不自动回退当前/最新/最近版本。
- Phase 2 三个命令边界与已有测试保持兼容；目录未配置不使健康接口整体失败。

### 风险

- 大目录一次性 JSON/RPC 导致内存和事务压力；使用 JSONL 流读取和幂等分批 staging。
- 新旧版本指针短期并存产生漂移；发布与任务创建在数据库事务中双写并验证 UUID 对应关系。
- 缓存损坏掩盖事实错误；SQLite 只作为可重建缓存，manifest/hash/外键损坏立即停止精确版本加载。

### 回滚方式

应用回退到 Phase 2 代码仍可读取保留的旧字段；数据库不删除新表或历史版本。活动游戏数据通过 `rollback_game_data_version` 切回旧 published UUID。共享环境若需撤销能力，追加补偿迁移按“revoke RPC → policy → staging/投影 → 新指针”的顺序处理，不修改已应用迁移。

### 可独立执行的任务列表

1. 共享契约、生成器和 `pal-catalog` 规范化工具。
   - 验证：`pnpm contracts:generate && pnpm contracts:check && pnpm --filter @palhatch/pal-catalog test`
2. Agent 本地版本包、制品、缓存、精确版本仓库和 CLI。
   - 验证：`cd apps/agent && uv run pytest tests/game_catalog tests/test_cli.py`
3. 数据库兼容迁移、staging、发布/回滚、查询 RPC、RLS 和 Bucket。
   - 验证：`supabase db reset && supabase test db supabase/tests/game_catalog.sql`
4. 全量回归与文档收口。
   - 验证：`pnpm check && supabase db lint && supabase test db && git diff --check`

## Phase 3：安全快照、ParserAdapter 与库存标准化

### 阶段目标

在只读边界内复制稳定存档快照，通过受控 ParserAdapter 生成 CanonicalSnapshot，并安全发布标准化库存。

### 前置依赖

- Phase 2 Worker 与 Repository 可用。
- 仅使用脱敏 fixture；实际宿主机路径须由部署人员明确确认后才可配置。

### 明确范围

- 路径配置校验、双次稳定性检查、临时复制、复制后复核、原子改名、哈希和保留策略。
- ParserAdapter、子进程超时/资源边界、CanonicalSnapshot 验证、异常库存下降保护。
- 成功快照不可变，失败不替换上一有效库存。
- Supabase 中已被更新快照取代的库存明细保留 24 小时，最新有效库存始终保留；
  清理保留小型审计存根并维护实例生命周期。

### 明确不实现的内容

- 写入、修复或编辑任何原始存档。
- 完整存档上传 Supabase、自动重启 Palworld、配种算法。

### 预计新增或修改的文件

- `apps/agent/src/pal_hatch_helper/{save_sync,parsers,normalization}/**`。
- `data/parser-fixtures/**`、测试与操作文档。

### 数据库迁移

只使用前向迁移增加快照载荷清理状态、实例生命周期、受控分批清理 RPC 和必要索引；
不修改历史迁移，不存原始存档。

### API 和契约

- ParserAdapter Protocol、CompatibilityResult、ParserResult、CanonicalSnapshot Schema。
- 快照发布 Repository 方法和稳定错误码。

### 测试要求

- 脱敏样例、源文件变化、相同哈希、解析崩溃/超时/非法 JSON、UID 唯一性、未知值、
  库存骤降、24 小时边界、最新快照保护、同哈希重新发布和分批保留清理。
- 测试断言源 fixture 的哈希与权限未变化。

### 验收标准

- 只读 fixture 在复制成功与所有失败路径均保持字节不变。
- 只有完整合法快照能原子成为 latest；异常下降进入审核。
- Agent 未配置唯一确认路径时 not ready，不猜测目录。
- 被取代的数据库库存明细在 24 小时后可清理；最新库存、共享偏好和历史方案不被删除。

### 风险

- 复制期间文件变化产生不一致；三次清单比较和临时目录隔离。
- 第三方解析器资源失控；独立子进程、超时、内存/CPU 限制与无网络默认值。

### 回滚方式

停止 save-worker，保留上一有效 snapshot ID；删除 Agent 自有数据目录内失败临时副本，不触碰源目录。

### 可独立执行的任务列表

1. 实现稳定性与只读复制。
   - 验证：`cd apps/agent && uv run pytest tests/save_sync/test_snapshot_copy.py`
2. 实现 ParserAdapter 沙箱调用。
   - 验证：`cd apps/agent && uv run pytest tests/parsers/test_adapter_contract.py`
3. 实现 CanonicalSnapshot 校验。
   - 验证：`cd apps/agent && uv run pytest tests/normalization`
4. 实现异常下降与原子发布。
   - 验证：`cd apps/agent && uv run pytest tests/save_sync/test_publish_guard.py`
5. 运行只读与全量回归。
   - 验证：`sha256sum data/parser-fixtures/**/* && pnpm check && cd apps/agent && uv run pytest`

## Phase 4：配种数据版本和确定性配种算法

### 当前进度（2026-07-16）

- Phase 4A/4B 仅作为实现检查点，不改变本节的统一验收范围。
- 已完成受审计来源入口、精确基础目录/provenance 绑定、六类非配种事实发布门禁、确定性两层搜索、实例分配、候选物理去重、四模式全候选池排名和完整评分明细。
- 数据库已启用与引擎一致的四套 v2 评分配置；真实本地 Claim 必须经精确 published 目录、content hash、world 和固定库存快照校验后才能进入引擎。
- Build `24181105` 的真实七类目录已完成人工批准、本地测试 world 发布、回滚与恢复演练；Phase 4 的 `real_data_acceptance`、`local_test_publish` 和后续 Phase 8 生产发布均已完成。
- 2026-07-20 追加库存感知修订：目标路线必须支持 `ready/needs_inventory` 分层、缺失父母需求、真实库存覆盖率、禁止目标零步完成、增量保留有界搜索候选，并升级算法与评分版本；历史固定结果保持不变。

### 阶段目标

建立可验证、可发布、可回滚的版本化配种数据，并用确定性两层搜索输出可复现合法路线和评分明细。

### 前置依赖

- Phase 1 版本表和 Phase 3 标准化库存可用。
- 配种来源的许可、版本和真实性经过人工确认。

### 明确范围

- GitHub/URL/Upload DataSource Adapter、staging 校验、发布/回滚。
- 父母无序归一化、特殊配方优先、最大代数/节点/时间限制。
- 种类路线搜索、实例/缺口分配、性别/共享/被动约束、可行性分层和四种版本化评分模式。

### 明确不实现的内容

- AI 创造或修改配方；未经验证的完整数据导入。
- 个体值、体型、主动技能和自动操作游戏。

### 预计新增或修改的文件

- `apps/agent/src/pal_hatch_helper/{breeding,data_sources}/**`。
- `packages/pal-catalog/**`、`data/breeding-fixtures/**`、算法与数据格式文档。

### 数据库迁移

补充来源审计、发布函数和算法/评分版本约束；发布只原子切换 active version，历史版本不删除。

### API 和契约

- 统一配方、校验报告、算法输入、候选路线、缺失父母、可采用状态和 score_breakdown Schema。
- Algorithm Protocol 以固定快照、数据、算法和评分版本为必填输入。

### 测试要求

- 导入/冲突/回滚、特殊配方、多代、性别替代、被动、共享排除、缺失父母、禁止零步、资源上限、部分候选保留、排序稳定性和历史复现。
- 属性测试验证父母交换不改变结果、相同输入序列化结果一致。

### 验收标准

- 算法只使用发布版本中的配方；相同固定输入结果一致。
- 至少三条合法路线时返回三条以上，不足时返回全部并给稳定原因码。
- 每条路线含版本、约束和完整评分明细，AI 无权改分。
- 完整库存路线优先；缺库存路线精确显示父本/母本需求且不可采用；已有目标实例不产生零步完成路线。

### 风险

- 数据源错误污染结果；staging、结构/关系/回归校验和人工发布阻断。
- 搜索空间爆炸；代数、节点、候选数和时间上限配置化。

### 回滚方式

将 world active version 切回上一 published 版本；保留历史任务固定版本；算法包可切回上一版本标签。

### 可独立执行的任务列表

1. 定义配方格式与导入 Adapter。
   - 验证：`cd apps/agent && uv run pytest tests/breeding/test_import.py`
2. 实现校验、发布和回滚。
   - 验证：`supabase test db --file supabase/tests/breeding_versions.sql`
3. 实现种类路线搜索。
   - 验证：`cd apps/agent && uv run pytest tests/breeding/test_route_search.py`
4. 实现实例分配与评分。
   - 验证：`cd apps/agent && uv run pytest tests/breeding/test_assignment.py tests/breeding/test_scoring.py`
5. 实现缺失父母路线、增量候选与硬/软预算语义。
   - 验证：`cd apps/agent && uv run pytest tests/breeding/test_missing_inventory.py tests/breeding/test_limits.py`
6. 运行确定性回归。
   - 验证：`cd apps/agent && uv run pytest tests/breeding -q && uv run python scripts/verify_reproducibility.py`

## Phase 5：登录、概览和帕鲁列表

### 当前进度（2026-07-15）

- `implementation=completed`、`automated_gates=passed`；并行交付边界已由 `docs/decisions/0005-phase5-parallel-delivery-boundary.md` 批准。
- 独立使用 Phase 1 RLS/RPC、Phase 3 脱敏库存以及本地或预览 Supabase。
- 不要求也不得绕过 Phase 4 的真实数据人工验收和生产发布门禁。
- 2026-07-27 概览页信息层级精简为 Hero、最近收藏与数据状态；库存统计保留在帕鲁列表页，概览不再为已删除卡片发起库存分页 RPC。
- 2026-07-27 全局数据状态提示收敛到桌面/移动导航入口和 `/data-status` 详情；概览、库存与配种器只保留中性快照/版本事实，不重复展示过期或解析异常告警。
- 2026-07-27 桌面导航改为固定选中框与独立水平滑动 Hover 框，统一无边框强调色和果冻反馈；库存入口统一使用爪印图标，首页收藏项目补充 Hover/焦点反馈。
- 2026-07-27 帕鲁库存用户语言、目录内部 ID 隐藏、紧凑指标卡、统一卡片阴影和视口分页修订已批准，按本计划末尾跨阶段修订顺序交付。

### 阶段目标

实现 Supabase 登录、角色绑定状态、概览和统一帕鲁列表，使用户只能看到权限允许的真实库存范围。

### 前置依赖

- Phase 1 RLS/RPC 和共享契约通过权限测试。
- Phase 3 可提供脱敏测试库存；Vercel 预览环境使用非生产 Supabase。

### 明确范围

- `/login`、`/overview`、`/pals`、`/data-status`、`/account`。
- 桌面/移动导航、深色基础主题、Tailwind 和按需最小 shadcn/ui。
- 全部/我的/公会共享筛选、自己的共享开关、加载/空/未绑定/无权状态；过期与解析异常由导航状态入口和数据状态详情统一呈现。

### 明确不实现的内容

- 配种任务创建、路线比较、执行计划和管理员管理动作。
- 前端持有 service role 或访问原始存档字段。

### 预计新增或修改的文件

- `apps/web/app/{login,overview,pals,data-status,account}/**`。
- `apps/web/features/{auth,overview,pals,data-status}/**`、Supabase browser/server Adapter、UI 组件与测试。

### 数据库迁移

原则上无；若查询性能测试证明需要索引，则新增独立并发友好的索引迁移并记录查询计划。

### API 和契约

- 用户会话、绑定摘要、概览统计、可用库存列表、共享切换 RPC 契约。
- BFF 只转发用户 JWT，不接收 service role。

### 测试要求

- 登录、未绑定、三种范围、筛选、共享切换、越权错误、关键状态和移动端可访问性。
- Playwright 使用本地/预览测试用户，不使用生产账号。

### 验收标准

- 普通玩家无法从 UI 或网络响应读取他人完整库存。
- 自有帕鲁共享切换成功且他人帕鲁不可编辑。
- 手机宽度可完成登录和库存筛选，状态明确。

### 风险

- Server/Client session 混用导致越权缓存；按用户请求动态读取并禁用跨用户缓存。
- 列表过大；服务端分页、稳定游标和索引。

### 回滚方式

Vercel 回滚上一预览/生产构建；数据库无破坏性变化，功能路由可通过配置关闭。

### 可独立执行的任务列表

1. 实现 Auth Adapter 与路由保护。
   - 验证：`pnpm --filter @palhatch/web test -- auth`
2. 实现概览与数据状态。
   - 验证：`pnpm --filter @palhatch/web test -- overview data-status`
3. 实现库存列表和筛选。
   - 验证：`pnpm --filter @palhatch/web test -- pals`
4. 实现共享开关与权限错误。
   - 验证：`pnpm --filter @palhatch/web test -- sharing`
5. 运行浏览器与构建回归。
   - 验证：`pnpm --filter @palhatch/web test:e2e && pnpm check`

## Phase 6：配种器、异步任务和路线比较

### 当前状态（2026-07-16）

- Phase 4 `real_data_acceptance=completed` 且 `local_test_publish=completed`；Phase 6 `implementation=completed`、`automated_gates=passed`、`local_integration=completed`、`production_deploy=completed`。生产发布由 Phase 8 受控流程完成。

### 阶段目标

实现目标驱动配种任务闭环：创建、异步恢复、确定性计算、AI 可降级解释和至少三条合法路线比较。

### 前置依赖

- Phase 2 任务 Worker、Phase 4 算法、Phase 5 登录和权限均通过。
- 测试环境具有发布配种版本与库存快照。

### 明确范围

- `/breeder`、`/breeder/jobs/[jobId]`。
- 目标、0 至 4 被动、模式、共享、最大代数输入；幂等创建与真实阶段状态。
- 四类排序标签、最多三条横向比较、移动端卡片、版本与评分明细。
- AIProvider 三级降级，只接收脱敏路线并只能生成解释/辅助排序记录。

### 明确不实现的内容

- 执行步骤、候选子代确认、管理员数据发布页面。
- AI 新增配方、修改合法性或基础评分。

### 预计新增或修改的文件

- `apps/web/app/breeder/**`、`features/breeder/**`。
- `apps/agent/src/pal_hatch_helper/ai/**` 和 job handler、相应测试与契约。

### 数据库迁移

必要时补充 AI 调用审计、脱敏摘要和稳定阶段字段；不保存发送给 Provider 的敏感原始输入。

### API 和契约

- CreateBreedingJob、JobProgress、BreedingPlan、RouteComparison、AIExplanation Schema。
- 创建 RPC 负责固定版本和幂等；查询受 RLS 保护。

### 测试要求

- 输入边界、重复点击、刷新恢复、Worker 失败/重试、无路线、少于三条、四模式、AI 三层降级和数据最小化。
- 浏览器测试覆盖创建到结果比较。

### 验收标准

- 同一幂等输入只有一个活跃任务；刷新后可恢复状态。
- AI 全部不可用时算法结果仍完成并显示模板说明。
- UI 展示固定版本、真实实例、合法步骤和 score_breakdown。
- UI 按性别展示父本/母本并汇总缺失需求；缺库存路线不可采用，完整路线始终优先推荐。

### 风险

- AI 输出被误认为事实；视觉与契约明确标注解释层，程序忽略其中配方字段。
- 长任务前端超时；任务异步化，以 Realtime 或有上限轮询恢复。

### 回滚方式

关闭任务创建入口，Worker 完成或安全释放已领取任务；保留历史结果；回滚 Web 与 Agent 到上一兼容版本。

### 可独立执行的任务列表

1. 实现创建 RPC 客户端和表单。
   - 验证：`pnpm --filter @palhatch/web test -- breeder-form`
2. 接通算法 job handler。
   - 验证：`cd apps/agent && uv run pytest tests/workers/test_breeding_job.py`
3. 实现 AIProvider 降级。
   - 验证：`cd apps/agent && uv run pytest tests/ai`
4. 实现进度与路线比较。
   - 验证：`pnpm --filter @palhatch/web test -- job-progress route-comparison`
5. 运行端到端回归。
   - 验证：`pnpm --filter @palhatch/web test:e2e --grep "breeding job" && pnpm check`

## Phase 7：“我的计划”路线收藏

### 阶段目标

把计算结果中的任意路线保存到“我的计划”，提供只读路线列表和详情，并可幂等移除收藏。

### 前置依赖

- Phase 6 路线结果和用户权限可用。

### 明确范围

- `/plans`、`/plans/[routeId]`，保持前后端“我的计划”语义。
- 在配种结果页保存或移除 `ready`、`needs_inventory` 路线。
- 列表展示目标、被动、可行性、路线指标和保存时间；详情复用完整配种路线展示。
- 收藏只关联已物化路线，不复制或改写固定快照/游戏数据/算法/评分/AI 版本。

### 明确不实现的内容

- 执行步骤、状态推进、实例锁定、候选子代检测与确认。
- 自动操作游戏或修改存档、个体值和非规格遗传维度优化。

### 预计新增或修改的文件

- `apps/web/app/plans/**`、`features/plans/**`、配种结果页收藏入口。
- 简化后的共享计划契约、前向数据库迁移和权限测试。

### 数据库迁移

追加前向迁移，删除无需保留的旧执行计划、步骤进度、候选和事件数据，移除旧执行 RPC；旧表只为
库存快照保留外键兼容而保留。建立
`saved_breeding_plans(requester_user_id, route_id, saved_at)`，保存、移除、列表和详情 RPC 使用当前
用户身份并受 RLS/所有权校验保护。

### API 和契约

- SavePlan、RemovePlan、PlanSummary、PlanDetail Schema。
- 重复保存和重复移除保持幂等；错误使用稳定错误码。

### 测试要求

- 保存/移除幂等、跨用户隔离、非本人路线不可收藏、`ready`/`needs_inventory` 均可收藏、
  快照明细清理后物化路线仍可读取。
- 浏览器覆盖保存、列表、详情、移除和返回原任务。

### 验收标准

- “我的计划”不显示人工进度、候选确认或执行状态操作。
- 同一路线重复保存只有一条收藏，移除不删除原任务和路线。
- 列表和详情只返回当前用户收藏，路线版本与物化结果不因新数据发布而改变。
- 原库存明细过期后不支持按旧库存精确重算，但收藏路线保持可读。

### 风险

- 路线载荷较大；列表使用摘要投影，详情按单路线读取。
- 重复点击产生重复收藏；复合主键和幂等 RPC 消除竞态。

### 回滚方式

应用回滚可保留收藏表；旧执行计划数据已明确无需保留，不提供恢复或迁移。

### 可独立执行的任务列表

1. 先写数据库和契约失败测试，覆盖收藏权限与幂等语义。
   - 验证：`supabase test db supabase/tests/phase7_saved_plans.sql`
2. 追加前向迁移并生成两端共享类型，删除旧执行计划运行链。
   - 验证：`pnpm --filter @palhatch/contracts test -- phase7`
3. 实现配种结果页保存入口、计划列表和只读详情。
   - 验证：`pnpm --filter @palhatch/web test -- plans breeder`
4. 运行收藏端到端回归。
   - 验证：`pnpm --filter @palhatch/web test:e2e --grep "我的计划"`

## 2026-07-28 跨阶段修订：中英文 i18n 与语言路由

### 交付顺序

1. 更新正式规格、本计划与 ADR，固定 `/zh`、`/en` 顶层动态语言段、UI/游戏内容分层、历史结果
   回退和语言选择器交互。
2. 增加失败测试，覆盖无前缀地址重定向、locale 鉴权、查询参数保留、API/静态资源排除、消息键
   完整性、语言切换器位置与键盘语义；确认失败来自当前无语言段和硬编码中文行为。
3. 引入 `next-intl`，建立 locale 配置、请求消息与导航封装；将所有页面迁入 `app/[locale]`，组合
   现有 Supabase middleware，保留 API 无前缀和私有缓存边界。
4. 按 Auth、Shell、Overview、Pals、Breeder、Plans、Data Status、Account、Admin 命名空间迁移
   全部 UI、Metadata、ARIA、日期、数字和状态文案；页面链接、表单 action、客户端导航和动态 URL
   统一保留 locale。
5. 追加前向数据库迁移，为库存分页、任务详情和收藏列表增加显式 locale 的新版本 RPC；已有
   `get_breeder_form_context` 传入映射后的目录 locale。共享 Schema 更新后重新生成 TS/Python 与
   Database 类型，不在两端复制 DTO。
6. 新目录发布门禁校验中英文玩家可见键覆盖；历史版本不修改，当前语言缺失时使用中性降级且
   不泄露稳定内部 ID。搜索只匹配当前语言名称和图鉴编号。
7. AI 请求、模板和展示记录语言；标签使用稳定代码。历史自由文本语言不匹配时用相同路线事实
   生成当前语言模板，不重复运行算法、不改变配方或评分。
8. 开发中每层只运行一次失败基线与一次局部验证；最终状态运行一次根 `pnpm check`、完整
   Supabase 测试、受影响中英文桌面/移动浏览器流程和 `git diff --check`，聚合命令覆盖的检查
   不再单独重复。

### 回滚与生产约束

- 数据库只追加新 RPC/列/约束，旧 RPC 与历史物化任务保持可读；Web 回滚继续使用旧无 locale
  接口。目录、算法、评分、库存快照、真实存档和 `/opt/palworld` 不修改。
- 新增的唯一生产依赖是经本修订批准的 `next-intl`；不新增公网端口，不访问生产凭证，不执行
  生产部署或远程推送。生产发布仍需单独明确批准。
- 部署时顺序为向前数据库迁移、兼容 Agent、Web；任一门禁失败停止，不让新 Web 调用尚未存在的
  locale-aware RPC。

## 2026-07-28 跨阶段修订：全局被动单排交替三角纹理

### 交付顺序

1. 更新正式规格与本计划，明确所有全局被动徽标只使用一排跨越完整徽标高度、朝向交替的三角
   纹理；rank 色板、文字对比、负面语义和业务事实保持不变。
2. 增加失败测试，锁定纹理由顶边与底边交替锚定、水平重复且不再使用徽标垂直中心作为共同原点。
3. 最小修改全局 `.passive-badge::before` CSS；不修改 `PassiveBadge` 组件、调用方、外部资产或
   数据契约。
4. 开发中只运行一次失败基线和一次受影响局部验证；最终状态运行一次 Web 格式、lint、typecheck、
   完整 test、build、Phase 6 浏览器纹理验证和 `git diff --check`。

### 回滚与生产约束

- 本修订只修改规格、计划、全局 Web CSS 和测试，不修改数据库、共享 Schema、算法、评分、库存、
  真实存档或 `/opt/palworld`，不新增依赖、公网端口、远程推送或生产部署。
- 应用回滚恢复上一 Web 构建即可；所有被动事实和已有物化路线不受影响。

### 完成验证

- 失败基线：纹理相关 2 项测试中 1 项按预期失败，锁定旧 `50% 50%` 中心原点产生的上下两排；
  另一项既有 Tailwind source 检查通过。
- 局部验证：同一组 2 项全部通过。
- 最终 Web 验证：Prettier、ESLint、TypeScript、17 个测试文件共 112 项测试和 Next.js 生产构建
  全部通过；Phase 6 浏览器纹理流程 1 项通过。
- 当前环境使用 Node.js 26.3.0，仓库声明为 Node.js 22.x；命令只产生 engine warning。浏览器
  fixture 缺少测试帕鲁图片并使用既有降级展示，不影响纹理断言。

## 2026-07-28 跨阶段修订：已选被动定宽与计划卡片左对齐

### 交付顺序

1. 更新正式规格与本计划，固定已选被动每列 20rem 上限和窄屏收缩、计划卡片紧凑左对齐网格、
   零至两个目标被动预留第二行以及底部入口对齐；数据库、共享契约、配种事实和算法保持不变。
2. 增加失败测试，覆盖已选被动列宽规则、计划网格左对齐与紧凑间距、被动区两行预留和卡片底部
   入口布局；失败必须来自现有等分拉伸、居中网格和内容高度随被动数量变化的真实行为。
3. 最小修改 `PassiveSkillPicker` 与 `PlanList`；复用帕鲁列表的紧凑网格间距，保留 32rem 卡片
   上限、被动品级视觉、44 像素移除点击区和移动端无横向滚动行为。
4. 开发中只运行一次失败基线和一次受影响局部验证；最终状态运行一次 Web 格式、lint、typecheck、
   完整 test、build、受影响 Phase 6/7 浏览器验证和 `git diff --check`，不重复聚合命令已覆盖的检查。

### 回滚与生产约束

- 本修订只修改规格、计划和 Web 展示，不修改数据库迁移、共享 Schema、算法、评分、库存快照、
  真实存档或 `/opt/palworld`，不新增依赖、公网端口、远程推送或生产部署。
- 应用回滚恢复上一 Web 构建即可；收藏关系、任务、物化路线和版本审计不受影响。

### 完成验证

- 失败基线：计划与配种器相关 43 项测试中 2 项按预期失败，分别锁定旧的等分拉伸已选被动列和
  居中计划网格；其余 41 项通过。
- 局部验证：同一组 43 项全部通过；随后补充零、一、两个被动统一预留两行的边界覆盖。
- 最终 Web 验证：Prettier、ESLint、TypeScript、17 个测试文件共 111 项测试和 Next.js 生产构建
  全部通过；受影响 Phase 6/7 浏览器流程 2 项通过。
- 当前环境使用 Node.js 26.3.0，仓库声明为 Node.js 22.x；命令只产生 engine warning。浏览器
  fixture 缺少测试帕鲁图片并使用既有降级展示，不影响流程与布局断言。

## 2026-07-28 跨阶段修订：计划网格与配种被动布局

### 交付顺序

1. 更新正式规格与本计划，固定计划卡片紧凑居中网格、已选被动等分自适应宽度、候选徽标固定
   20rem 宽度和删除一键清空操作；数据库、共享契约、配种事实和算法保持不变。
2. 增加失败测试，覆盖计划卡片使用自动适配的 32rem 网格、配种页不存在清空按钮、已选徽标
   两列等宽且高度固定、候选徽标不随名称长度变化，以及逐项移除图标保持清晰对比。
3. 最小修改 `PlanList`、`PassiveSkillPicker` 和局部徽标样式；已选徽标在窄屏随网格列收缩，候选
   徽标在可用宽度不足 20rem 时降为 100%，不改变全局 rank 品级视觉。
4. 开发中只运行一次失败基线和一次受影响局部验证；最终状态运行一次 Web 格式、lint、typecheck、
   完整 test、build、受影响浏览器验证和 `git diff --check`，不重复聚合命令已覆盖的检查。

### 回滚与生产约束

- 本修订只修改规格、计划和 Web 展示，不修改数据库迁移、共享 Schema、算法、评分、库存快照、
  真实存档或 `/opt/palworld`，不新增依赖、公网端口或生产部署。
- 应用回滚恢复上一 Web 构建即可；收藏关系、任务和物化路线不受影响。

### 完成验证

- 失败基线：计划与配种器相关 43 项测试中 2 项按预期失败，分别锁定旧两列分散网格和旧被动
  定宽/清空行为；修正一次无效 ARIA 定位后，被动测试由缺少候选固定宽度类真实失败。
- 局部验证：同一组 43 项测试全部通过。
- 最终 Web 验证：Prettier、ESLint、TypeScript、17 个测试文件共 110 项测试和 Next.js 生产构建
  全部通过；首次并行 typecheck 与 build 因 `.next/types` 重建竞态失败，构建完成后只重跑该失败
  检查并通过。
- 浏览器验证：首次全套运行因已有进程占用 3000、开发服务器切换到 3001 而访问了错误端口；改用
  独立端口后，受影响 Phase 6/7 共 2 项通过，覆盖候选徽标等宽/320px 上限、已选徽标填满网格列、
  28px 固定高度、无清空按钮及收藏路线流程。

## 2026-07-28 跨阶段修订：配种工作台目标与被动布局、五代上限和 Phase 5 验收提速

### 交付顺序

1. 更新正式规格与本计划，固定已选目标层级、被动两列布局、十字宽度、一行三角纹理、新请求
   五代上限、历史结果兼容和 Phase 5 浏览器验收的最小关键闭环。
2. 增加一次失败测试，覆盖 72 像素已选目标头像、重复被动标题消失、已选被动两列且不拉伸、
   配种页徽标固定宽度、六代新请求/新设置被 Web、共享契约和数据库拒绝。
3. 最小修改配种器组件与全局被动纹理；不改变 rank、负面事实、配方、算法评分或历史路线载荷。
4. 请求 Schema 与 Agent 搜索输入上限改为五，结果投影继续接受历史八代数据；追加前向数据库
   迁移保护新任务和新运行设置，不编辑已应用迁移。
5. Phase 5 浏览器验收删除纯样式与已有单元/pgTAP 覆盖的重复场景，把库存范围、被动 AND、
   分页和共享合并为一个玩家主流程；保留登录错误、未绑定、移动端无横向滚动、隐私边界、
   Phase 6–8 核心流程。运行前保留一次数据库重置，删除验收结束后的重复全库重置。
6. 开发中只运行一次失败基线和一次受影响局部验证；最终状态运行一次根 `pnpm check`、完整
   Supabase 测试、精简后的 Phase 5 browser acceptance 与 `git diff --check`，不重复聚合命令
   已覆盖的检查。

### 回滚与生产约束

- Web 与验收脚本可随应用回滚；数据库只追加写入保护，历史任务、路线和设置版本不原地修改。
- 不修改真实存档、配种关系、评分、`/opt/palworld`、Palworld/mihomo 容器或公网端口。
- 提交、PR、合并与远程推送按本次用户明确授权执行；不执行 Vercel、Supabase 或 Agent 生产部署。

### 完成验证

- 失败基线以单个 Web 用例确认重复标题仍存在；实现后 Web 受影响 43 项与契约受影响 9 项通过。
- 本地 Supabase 从空库重放全部迁移，schema lint 无错误，18 个 pgTAP 文件共 400 项通过。
- 根聚合检查的格式、lint、类型、110 项 Web 测试、30 项契约测试和生产构建通过；Agent 相关
  运行设置测试修正后 2 项通过。当前机器缺少 `gcc`，3 个既有 Oodle ABI 临时 shim 测试无法
  建立；其余 236 项 Agent 测试通过、4 项跳过，该环境限制交由 GitHub CI 覆盖。
- 精简后的 browser acceptance 从 16 个场景减少为 12 个；首次运行 10 项通过、1 项因合并流程
  缺少清除筛选而失败、1 项跳过，只修正并重跑该失败场景后通过。Phase 6 的 72 像素头像、
  两列徽标、单行纹理和五代输入浏览器断言已在首次运行通过。

## 2026-07-28 跨阶段修订：我的计划与配种路线视觉收口

### 交付顺序

1. 先更新正式规格和本计划，固定玩家语言、计划卡片密度、Hero/登录背景精简、计划详情层级和
   路线树连接几何；数据库、共享契约、配方、算法和评分事实保持不变。
2. 增加一次失败测试，覆盖收藏数量摘要卡消失、计划详情无 Hero、登录与 Hero 背景无白云、
   “我的计划”与配种工作台 Hero 无右侧装饰图标、计划卡片 32rem 上限、被动两列且不拉伸、
   亲本无“本步骤需保留”，以及每个子代只有一个箭头且分支终点与箭头左侧锚点重合。
3. 精简 `/plans`：使用玩家语言重写 Hero、卡片和空状态，删除整张收藏数量摘要卡；计划卡片在
   移动端全宽、桌面端最大 32rem 并居中，想要的被动使用两列最小内容行高。
4. 删除 `/plans/[routeId]` 的整个 Hero，把紧凑目标摘要提升为页面开头和唯一一级标题；保存时间、
   收藏/库存状态并入摘要。计划详情使用“配种路线”“想要的被动”“推荐依据”“查看原配种结果”
   等玩家语言，技术事实保留在“本次计算依据”折叠区并改用玩家可理解标签。
5. 移除 `/plans` 与 `/breeder` Hero 右侧纯装饰图标及预留空间；从共享 CSS 风景中删除登录页和
   所有业务 Hero 上方白云，不改变其他山丘、树叶和焦点/交互状态。
6. 计划详情与配种工作台复用相同的紧凑 `BreedingRouteTree` 配置；亲本节点只展示库存被动，
   被动网格不使用固定最小高度。桌面连接按子代分组，两条亲本分支汇合到共享锚点，再由唯一
   水平末段和 marker 指向子代，普通/特殊配方共用几何。
7. 开发中只运行一次最小失败测试和一次受影响局部验证；最终状态运行一次 Web 格式、lint、
   typecheck、完整 test、build、受影响 Phase 6/7 浏览器验证和 `git diff --check`。聚合命令已经
   覆盖的检查不再单独重复执行。

### 回滚与生产约束

- 本修订只修改规格、计划和 Web 展示；不修改数据库迁移、共享 Schema、算法、评分、库存快照、
  真实存档或 `/opt/palworld`，不新增依赖或公网端口。
- 应用回滚恢复上一 Web 构建即可，收藏关系、物化路线和版本审计事实不受影响。
- 代码提交、PR 与合并按用户明确授权执行；不执行 Vercel、Supabase 或 Agent 生产部署。

### 完成验证

- 失败基线：3 个相关测试文件共 51 个用例中 5 个按预期失败，分别锁定摘要卡、详情 Hero、白云、
  计算依据文案和路线连接几何。
- 局部验证：同一组 51 个用例全部通过。
- 最终 Web 验证：Prettier、ESLint、TypeScript、17 个测试文件共 110 个用例和 Next.js 生产构建
  全部通过。
- 浏览器验证：Phase 7 通过；Phase 6 首次在隔离服务冷启动登录阶段超时，服务预热后仅重跑该
  失败用例并通过。未重跑已通过的 Phase 7。
- 运行环境使用 Node.js 26.3.0，仓库声明为 Node.js 22.x；所有命令均仅产生 engine warning，
  未影响验证结果。

## 2026-07-27 跨阶段修订：配种工作台创建页聚焦与被动效果说明

### 交付顺序

1. 先更新正式规格和本计划，固定页面层级、玩家语言、目标选择器收口和被动效果文本投影。
2. 增加失败测试：Hero 使用“配种工作台”且重复标题消失；目标选择框选中后直接包含头像、名称和
   图鉴编号且不再出现摘要卡；被动候选显示效果文本而不显示“正面”“负面”；表单上下文从同一
   游戏数据和 locale 返回效果文本。
3. 追加前向迁移替换 `get_breeder_form_context`，通过 `description_key` 关联本地化效果文本；旧迁移
   不修改，缺失效果保持 null。
4. 扩展 Phase 6 共享 Schema 的 `BreederPassiveOption.effect_text` 并重新生成 TypeScript/Pydantic
   模型，不复制 DTO，不改变 `rank`、`is_negative`、任务输入或算法。
5. 精简创建页重复标题，统一三个核心区块的字体、圆角和交互状态；目标选择框内联头像、名称和编号；
   被动列表使用效果说明并提供诚实降级；技术事实以“本次计算依据”收纳并使用玩家语言。
6. 开发中运行一次最小失败验证和一次受影响局部验证；最终状态运行一次根 `pnpm check`、完整
   Supabase 测试、Phase 6 Web E2E 与 `git diff --check`，不重复聚合命令已覆盖的检查。

### 回滚与生产约束

- 数据库只追加函数定义迁移；应用回滚可忽略新增 JSON 字段，旧任务和路线不变。
- 不修改配种关系、算法、评分、库存快照、真实存档或 `/opt/palworld`，不新增生产依赖或端口。
- 本修订只发布代码与 PR，不执行生产部署；生产发布仍需单独批准。

### 完成状态

- Web 格式、lint、类型检查、109 项单元测试与生产构建通过；共享契约 28 项测试通过。
- 完整 Supabase 套件 18 个文件、400 项断言通过；Phase 6 iPhone 浏览器全流程通过。
- 根聚合检查在 Agent 段因当前环境缺少 `gcc`，3 项临时 Oodle ABI 测试桩无法建立；其余 237 项
  Agent 测试通过、4 项跳过。该既有环境限制不影响本修订的 Web、契约、数据库与浏览器验收。

## 2026-07-27 跨阶段修订：全局被动品级视觉与库存被动多选

### 交付顺序

1. 先更新正式规格和本计划，固定 rank 视觉映射、三角纹理、AND 语义和四项上限。
2. 增加失败测试：重复 `passive` URL 参数去重并限制四项；库存 RPC 只返回同时拥有全部所选
   被动的帕鲁；筛选选项投影 rank/负面事实；多选、取消、清空及分页保留全部选择。
3. 追加前向 `list_available_pals_page_v3` 迁移，保留 v2 兼容和已有头目、公会所有权、位置、
   图鉴排序与目录 ID 隐藏语义；v3 接受被动数组并为被动 facet 返回 rank/负面事实。
4. 更新共享 Phase 5 Schema 与生成类型；库存页从同一固定版本 facet 构造全页被动事实，避免
   额外 rank 查询。
5. 全局 `PassiveBadge` 使用本地 CSS 三角拼接纹理和 rank 颜色；库存筛选 Popover 使用同一
   badge，标题使用“被动技能”，选项按配种工作台的 rank 降序和稳定 ID 顺序排列；保留 Radix
   Command 键盘导航、清晰焦点、可访问选择状态和移动端可用尺寸。
6. 开发中只运行一次最小失败验证和一次受影响局部验证；最终状态运行一次根 `pnpm check`、
   完整 Supabase 测试、Phase 5 Web E2E 与 `git diff --check`，不重复聚合命令已覆盖的检查。

### 回滚与生产约束

- 数据库只新增 v3 RPC，不修改或删除 v2；应用回滚继续使用 v2 单选接口。
- 不改变目录 rank、`is_negative`、库存快照、配种算法或评分，不读取生产数据库或真实存档。
- 不热链或复制 PalDB 纹理资产，不新增生产依赖、生产部署或远程推送。

## 2026-07-27 跨阶段修订：帕鲁库存用户体验收口

### 交付顺序

1. 先更新正式规格和本计划，固定玩家语言、目录内部 ID 隐藏、总数语义、卡片层级与视口分页
   行为；内部契约、确定性算法和版本审计 ID 不变。
2. 只为功能行为增加失败测试：库存 RPC 不再接受帕鲁内部 ID 查询，名称/图鉴编号保持可用；
   配种目标和被动不再由内部 ID 命中；浮动分页只在库存区域可见且正常流分页未接管时启用。
   纯文案、间距、阴影和图标外观不新增失败测试。
3. 追加前向数据库迁移，从两个库存分页 RPC 中删除 `pal_id` 查询分支；不得修改已应用迁移。
4. 收口库存与配种器玩家界面中的帕鲁/被动内部 ID，使用本地化名称、图鉴编号和中性未知降级；
   内部 ID 继续用于数据库关联、契约、React key、图片索引和任务提交。
5. 压缩库存指标卡，固定“帕鲁总数”为当前用户完整可用库存；视图切换改为带可访问名称和
   Tooltip 的 44px 图标按钮；Card 类表面统一为贴合底部的 shadcn 阴影层级。
6. 使用 IntersectionObserver 实现正常流/浮动分页交接，保留服务器分页与快照上下文，处理
   safe-area、键盘焦点、reduced-motion 和最后一行内容避让。
7. 开发中每个失败检查和受影响局部检查只运行一次；最终状态运行一次根 `pnpm check`、完整
   Supabase 测试、受影响 Web E2E 和 `git diff --check`，聚合命令已覆盖的检查不重复执行。

### 回滚与生产约束

- 数据库变更只追加函数定义迁移；应用回滚可保留“不支持内部 ID 搜索”的更严格用户查询语义。
- 不修改算法、目录事实、库存快照或真实存档，不访问生产密钥，不执行生产部署或远程推送。
- 浮动分页只增加浏览器端视口观察，不改变页码、快照上下文和 RLS 权限边界。

### 完成状态

- Web 格式、lint、类型检查、相关单元测试与生产构建通过；完整 Supabase 套件的 393 项断言通过，
  Phase 5 库存流程与 Phase 6 配种流程浏览器验证通过。
- 根聚合检查的受影响 Web/契约部分通过；Agent 测试段因当前环境缺少 `gcc`，有 3 项临时 Oodle
  ABI 测试桩无法建立（其余 237 项通过、4 项跳过），不影响本修订的 Web 与数据库验收结论。

## 2026-07-27 跨阶段修订：路线语义去重与 2000+ 库存容量

### 交付顺序

1. 先更新正式规格和本计划，固定最终路线等价关系、代表选择顺序和容量门槛。
2. 增加失败测试：同种不同实例/性别朝向只返回一条路线，优先额外被动更少的实例；软目标按语义路线计数；2048 个以上库存不触发默认节点或时间上限。
3. 在库存叶子入队和中间状态组合前按固定长度语义签名压缩；最终序列化后再执行一次路线级语义去重作为边界保护。
4. 语义重复代表先比较可行性与缺口，再比较非目标被动数量、借用、尝试成本、模式评分和稳定物理签名；不改变配方合法性与基础评分公式。
5. 得到至少三条 `ready` 语义路线后停止缺库存补充搜索；保留默认 200,000 节点和 30 秒硬限制并升级算法/评分版本。
6. 开发中只运行一次最小失败测试和一次受影响局部验证；最终状态运行一次根 `pnpm check`、完整 Supabase 测试及 `git diff --check`，不重复聚合命令已覆盖的检查。

### 回滚与生产约束

- 算法与评分版本前向新增，历史任务继续固定旧版本；应用回滚不会重写历史结果。
- 压力测试只使用合成库存和本地目录，不读取生产数据库、真实存档或凭证。
- 本修订不修改 `/opt/palworld`、不推送远程仓库；生产部署须单独明确批准，已于 2026-07-27
  获批并完成。

## 2026-07-24 跨阶段修订：数据库库存快照 24 小时保留

### 交付顺序

1. 更新正式规格、Phase 3 与 Phase 7 计划语义。
2. 先增加 pgTAP 与 Agent 失败测试，覆盖权限、边界、最新保护、业务历史和调度调用。
3. 追加前向迁移，实现审计存根、实例生命周期、执行计划依赖和受控分批清理。
4. Save Worker 每轮同步后调用清理 RPC；清理失败只告警，不回滚已经成功发布的最新库存。
5. 运行局部数据库/Agent 测试，再以根目录 `pnpm check` 和完整 Supabase 测试覆盖最终状态。

### 回滚与生产约束

- 应用回滚时停止调用清理 RPC；已清理的库存载荷不自动恢复，历史物化方案仍可读。
- 数据库迁移只前向追加；需要撤销能力时追加补偿迁移，不能编辑已应用迁移。
- 首次生产启用前记录快照与明细表体积、死元组和 autovacuum 状态。常规清理只释放可复用空间，
  不自动执行 `VACUUM FULL`、`CLUSTER` 或其他高锁维护。
- 生产部署仍必须遵守 Phase 8 审批、备份、秘密和端口边界。

## 2026-07-24 跨阶段修订：Boss ID 与公会所有库存

### 交付顺序

1. 更新正式规格中的库存稳定 ID、所有权类型、共享池和列表展示语义。
2. 先增加 Parser/Agent/pgTAP/Web 失败测试，覆盖 Boss 前缀、公会基地所有权、跨公会隔离和
   nullable owner 的计划生命周期。
3. 在 CanonicalSnapshot 标准化边界去除一层 `boss_` 及仅用于头目随从角色的 `_otomo`
   后缀，保留原始内部名；库存校验同时接受当前版本 `catalog_pals` 和受审计
   `pal_name.PAL_NAME_*` 本地化事实，但配种计算仍只接受 `catalog_pals`。新增
   `player/guild/unresolved` 所有权契约并追加数据库迁移。
4. 统一库存列表、配种运行事实和路线展示；历史不可变快照不原地修改，旧 Boss 映射继续作为
   兼容保护。
5. 升级 Parser 身份并对 Agent 自有只读快照执行 reparse，生成新的不可变 latest 快照。
6. 局部验证后仅对最终状态运行一次根目录聚合检查、完整 Supabase 测试和部署前检查。

### 回滚与生产约束

- 应用回滚保留新增所有权列和不可变快照；旧版本把未知所有权安全视为 `unresolved`。
- 数据库只追加迁移，不修改已应用迁移或历史 `pal_snapshot_items`。
- 生产重解析只读取 Agent 自有快照，不直接解析或修改真实源存档。
- 生产部署继续遵守 Phase 8 的备份、不可变镜像、回滚和端口约束。

## 2026-07-24 跨阶段修订：头目标志、精确位置与次元帕鲁仓库

### 交付顺序

1. 先更新正式规格，明确 `is_boss`、位置事实、访问范围和次元帕鲁仓库的保守共享规则。
2. 增加 Parser/Agent/契约/pgTAP/Web 失败测试，覆盖显式 `IsBoss` 与 `boss_` 前缀合并、
   Base UID/工作位、普通终端页格、DPS 页格、私人/公会/未知访问范围和跨公会隔离。
3. 扩展 CanonicalSnapshot 与生成模型；数据库只追加新迁移，旧不可变快照不回填，新字段对
   历史 Parser 版本保持安全的 null/unknown 兼容。
4. Parser 读取同一 Agent 快照中显式声明的 `_dps.sav`，不直接扫描源存档；原始容器 GUID
   只用于内部关联。无法由受控 fixture 证明共享设置时输出 `unresolved`，不得猜测。
5. 统一库存列表、配种运行事实、路线与计划位置投影；页码和格号只由绝对槽位派生。
6. 提升 Parser 身份，对 Agent 自有只读快照 reparse；检查 DPS 带来的输出体积、实例 UID
   冲突和库存骤降/增长保护。
7. 开发中只运行最小相关测试；最终状态运行一次根 `pnpm check`、完整 Supabase 测试和
   `git diff --check`，聚合命令已覆盖的检查不重复执行。

### 回滚与生产约束

- 应用回滚保留追加列和历史快照；旧应用把新位置或访问范围安全降级为未知。
- 数据库迁移只前向追加，不修改已应用迁移或历史 `pal_snapshot_items`。
- 生产 Parser 只读取 Agent 自有不可变快照；任何 DPS 解码、实例 UID 或共享语义异常均保留
  上一有效库存。
- 首次生产启用前完成备份和 dry-run，镜像使用 Git SHA 与 digest；只重启 PalHatchHelper
  服务，不操作 Palworld 或 mihomo。

## 2026-07-29 跨阶段修订：普通用户公共 Sync 安装流程

### 交付顺序

1. 在正式规格中固定 `npm install -g`、无参数 `init` 与前台 `run` 的最短流程，同时保留
   只读快照、Parser、脱敏、鉴权、设备配对和生产运维边界。
2. 增加失败测试，覆盖默认 PalBeacon 地址、仅两个交互问题、成功提示、高级覆盖参数、
   移除 `--sync-now`、已有配置确认/`--force`、首轮立即同步、信号退出、精简帮助与 README。
3. 最小调整 Sync CLI：默认 URL 固定为 `https://www.palbeacon.app`，`init` 只配对并保存，
   已有配置必须确认或显式强制；`run` 继续在首轮完成后才进入 300 秒等待。
4. 把 npm README 收敛为约 30 至 40 行的普通用户文档；许可证、Parser 源码说明和第三方通知
   继续由 npm 文件清单与包验证脚本保证，不放入普通用户主文档。
5. 账户页使用中英文三步响应式卡片展示安装、配对和启动，配对码独立复制，高级非交互命令
   默认折叠；普通界面不展示 URL、systemd、ACL、Parser 或迁移流程。
6. 更新受影响的高级运维示例以移除失效参数，但不删除 systemd、Save Worker 切换、迁移、
   验证或回滚能力。局部验证后执行 Sync/Web 全套检查、根聚合检查、npm dry-run 打包、精确 tgz
   验证、秘密/真实存档检查与 `git diff --check`。

### 回滚与生产约束

- 应用回滚可恢复上一 CLI 与 Web；本修订不修改数据库、共享契约、存档事实、Parser、配种关系、
  算法、评分或生产运行状态。
- 不执行 npm publish、生产 migration、Vercel/Agent 部署、远程推送、Palworld/mihomo 操作或
  Save Worker 切换；不在 postinstall 中执行系统级命令。

## 2026-07-29 跨阶段修订：公共 Sync 文档与 CLI 本地化

### 交付顺序

1. 正式规格固定 npm README 英文默认、同包简体中文跳转、CLI 系统语言检测顺序、英文回退与
   `--locale` 显式覆盖语义。
2. 增加一次失败测试，覆盖英文默认帮助、中文显式/系统 locale、无法识别时英文回退、无效显式
   locale、命令前后覆盖以及 README 双语入口。
3. 集中定义 CLI 英文与简体中文消息；帮助、初始化、持续同步、状态、离线检查、退出和错误共享
   同一 locale。配置中的新同步结果保存稳定代码，展示时兼容既有中文结果。
4. 把 npm README 改为英文并新增随包发布的简体中文版；包校验确认两个文档和默认英文帮助均可用。
5. 只对最终状态执行一次 Sync 的 format、lint、typecheck、完整 test、build、npm dry-run/包验证和
   `git diff --check`；聚合命令已覆盖的检查不重复执行。

### 回滚与生产约束

- 本修订只修改 Sync 文档、CLI 展示与测试，不修改数据库、共享契约、Parser、存档事实、配种算法、
  `/opt/palworld` 或生产运行状态。
- 不执行 npm publish、生产部署、远程推送或现有 tgz 覆盖；应用回滚可恢复上一 CLI，已有设备配置
  与配对凭据保持兼容。

## 2026-07-29 跨阶段修订：未绑定引导、Steam 头像与导航收口

### 交付顺序

1. 正式规格固定 Steam 头像优先、数据状态只保留用户菜单入口、未绑定页面复用同步卡片与 FAQ，
   并固定 `palbeacon-cli` 包名、`palbeacon` CLI 名及三步命令在说明上方的顺序。
2. 增加一次失败测试，覆盖头像图片与首字母降级、桌面主导航不再出现数据状态、同步安装第一步
   命令顺序、FAQ 三类说明，以及各未绑定页面不再渲染 `PLAYER_BINDING_REQUIRED` 错误组件。
3. 工作区布局只读查询当前用户 Steam 身份头像并传给共享 Header；复用现有 Radix AvatarImage，
   保留加载失败后的 AvatarFallback、下拉键盘语义和现有 CSP 白名单。
4. 提取可复用的未绑定同步引导，组合现有 `SyncDeviceCard` 与新 FAQ 卡片；概览、库存、配种器、
   配种结果、计划列表/详情和数据状态页在无绑定时直接返回该引导，账号页也在同步卡片后展示 FAQ。
5. 开发中只运行一次受影响失败基线与一次局部验证；最终状态运行一次 Web format、lint、typecheck、
   完整 test、build 和 `git diff --check`，聚合命令已覆盖的检查不重复执行。

### 回滚与生产约束

- 本修订只修改规格、计划与 Web 展示/只读 Steam 头像查询，不修改数据库、共享契约、Sync CLI、
  存档事实、Parser、配种算法、`/opt/palworld` 或生产运行状态。
- 不新增依赖、公网端口，不执行 npm publish、生产部署、远程推送或现有 tgz 覆盖。

## 2026-07-29 跨阶段修订：顶部品牌、数据徽标与 GitHub 入口

### 交付顺序

1. 正式规格固定 Logo 与页面标题只保留 PalBeacon、数据徽标的三态短文案和 GitHub 外链位置、
   点击区与可访问语义。
2. 增加一次失败测试，覆盖中英文 Metadata、Logo 替代文本/副标题移除、未绑定/最新/已过期映射、
   桌面徽标只位于数据状态菜单项右侧，以及 GitHub 入口位于语言切换器左侧。
3. 提取可复用 GitHub 图标入口并放入桌面、移动与登录页语言控件组；复用现有 Button、内联 GitHub
   标记和焦点样式，不新增依赖。
4. 工作区布局根据角色绑定与库存状态生成三态菜单徽标；Header 删除菜单外的独立状态入口，移动
   菜单保持同一行右侧徽标。
5. 更新中英文消息与受影响浏览器品牌验收；局部验证后对最终状态运行一次 Web format、lint、
   typecheck、完整 test、build 和 `git diff --check`，不重复聚合命令已覆盖的检查。

### 回滚与生产约束

- 本修订只修改规格、计划和 Web 展示，不修改数据库、共享契约、Sync CLI、存档事实、Parser、
  配种算法、`/opt/palworld` 或生产运行状态。
- 不新增依赖、公网端口，不执行生产部署、远程推送或现有 tgz 覆盖；应用回滚恢复上一 Web 构建。

### 完成验证

- 失败基线：品牌、登录与 Header 的 3 个测试文件中 5 项按预期失败，分别锁定旧 Metadata、Logo
  替代文本/副标题、菜单外状态入口和缺少 GitHub 入口。
- 局部验证：同一组 3 个测试文件共 19 项通过。
- 最终 Web 验证：受影响文件 Prettier 检查、ESLint、TypeScript、28 个测试文件共 155 项测试和
  Next.js 生产构建全部通过。
- Phase 5 本地浏览器验收在隔离端口与仓库本地 Supabase fixture 上完成：11 项通过、1 项按健康
  状态条件预期跳过；覆盖页面标题、Logo、GitHub 外链、未绑定同步引导、三态徽标、移动菜单及
  Phase 5–8 核心流程。

## 2026-07-30 跨阶段修订：公开双语首页与搜索引擎收录

本次修订不改变 Phase 1–7 的业务协议、数据库结构、认证流程或确定性配种算法，仅在现有能力之上补齐公开产品入口和搜索引擎边界。

交付顺序：

1. 先将 `/zh` 与 `/en` 从工作台重定向改为无需登录的静态 Server Component 首页，并保持 `/` 的 next-intl 语言跳转。
2. 首页文案只呈现当前代码已实现的只读同步、角色认领、库存、公会共享、多代路线、只读计划保存和数据状态能力；不宣称计划执行进度或候选子代确认已经实现。
3. 以统一站点配置生成 canonical、hreflang、Open Graph、JSON-LD、sitemap 和 robots，正式域名固定为 `https://www.palbeacon.app`。
4. 登录页、workspace、管理员页和动态私有页同时使用页面 metadata 与 middleware `X-Robots-Tag` 阻止索引，不改变既有 Session Cookie、Steam 回调和 `next` 参数。
5. 使用现有 Vitest、Playwright 和生产构建验证公开页面、私有路由保护、SEO 输出与无 JavaScript 首屏正文。

回滚边界：公开首页、SEO 路由、翻译与 noindex 响应头均可独立回滚；不得回滚或修改同步协议、上传载荷、角色认领、认证、数据库 migration 或配种算法。

## 2026-07-30 跨阶段修订：公开首页信息收口与工作台轮播

1. 先增加失败测试，锁定 `Keep your Palworld visible` 主标题、服务器控制台短说明、Hero 仅两个 CTA、
   三个工作台轮播画面以及开发者式提示移除。
2. 将轮播实现为最小局部 Client Component，固定展示公会库存、抽象合法性无关的路线树布局和收藏
   计划界面；不接入认证、用户查询或业务 API，不新增轮播依赖。
3. 自动轮播提供上一张、下一张、页签和暂停控制；悬停/聚焦时暂停，reduced-motion 下默认不自动
   播放。所有画面在初始 HTML 中保留，避免主要产品信息依赖 hydration 才出现。
4. 收短中英文工作流、功能、安全和 FAQ 文案，移除重复特性及实现校验口吻；标题使用平衡换行、
   正文使用优化换行，并在 320、390、768、1024 和 1440 像素视口检查孤字与溢出。
5. 最终运行受影响单元测试、Web lint、typecheck、完整测试、生产构建、Playwright 桌面/移动验收和
   `git diff --check`，不改变 SEO URL、认证、同步协议、数据库或配种算法。

## 2026-07-30 跨阶段修订：轮播层级与首页通信示意

1. 增加失败测试，锁定轮播标题只出现于页签、路线画面具有五个抽象树节点、核心能力区具有四个
   通信节点，并统一 Footer 品牌句。
2. 删除三个轮播画面的 PalBeacon 控制台眉题和重复页标题，把空间让给库存、路线树和收藏计划本身。
3. 使用响应式 HTML/CSS 与装饰性 SVG 连线绘制简化路线依赖树；节点只使用目标、中间亲本和库存
   亲本角色，不构造新的配种事实。
4. 在核心能力区绘制 Palworld 服务器、同机同步工具、PalBeacon 云端和玩家浏览器的数据流，准确
   标注本地读取、HTTPS 主动同步和权限内查看，不改变任何真实通信协议。
5. 完成中英文、320–1440 像素、reduced-motion、单元测试、Playwright 与生产构建验证。

## 2026-07-30 跨阶段修订：路线轮播代际布局

1. 依据产品参考图增加失败测试，固定“初始亲本、第 1 代、第 2 代”三列、五张节点卡和四条汇合连线。
2. 初始亲本与第 1 代亲本分别上下排列，曲线箭头把两个亲本汇合到同列顶部的下一代子代；最终目标
   位于第 2 代顶部，阅读方向固定从左到右。
3. 节点压缩复用真实路线卡的头像、角色、库存状态、性别和被动视觉；展示名称保持抽象，不新增或
   暗示任何配种事实。
4. 320–420 像素保留三列结构但隐藏次要所有者/位置信息，桌面显示完整摘要；不得产生横向溢出。
5. 只修改 Landing 展示、翻译、测试和对应设计记录，不修改配种算法、配方、库存或计划数据。

## 2026-07-30 跨阶段修订：轮播内容密度与被动品级

1. 增加失败测试，锁定公会库存四张卡均展示所有者、路线节点继续保留所有者与位置、收藏计划同时
   展示两张卡，并校验示例被动对应的真实 rank。
2. 压缩路线树节点间距、头像和重复标签，不删除所有者、位置、状态、性别或被动；同步缩短树画布，
   避免路线画面单独撑高整个轮播。
3. 公会库存卡使用明确的所有者行并调整卡片高度；收藏计划改为两张纵向排列的紧凑收藏卡，让三个
   slide 的有效内容高度接近，不用固定空白占位。
4. Landing 复用全局 `PassiveBadge`。根据当前目录与 PalDB 品级，认真、工匠精神、稀有、灵活分别
   使用 rank 1、3、4、1；不复制外部纹理、不新增另一套颜色映射。
5. 在 320、390 与 1440 像素检查三个画面的内容高度、换行和横向溢出，再运行 Web 单元测试、格式、
   lint、typecheck、生产构建、Landing Playwright 与 `git diff --check`。
6. 依据真实库存卡参考，把公会库存卡固定为头像/名称、所有者/位置、被动三层，移除身份与详情间的
   多余分割线，并把皮皮鸡示例改为 rank 4 的“稀有”。路线树至少一个亲本使用公会成员所有者，
   库存位置展示具体终端页码；当前两步路线显示 2 代，最终目标汇总四个亲本被动并显示目标被动数 4。
7. 增加失败测试锁定公开顶部导航的顶端透明态、滚动毛玻璃态、纯图标 GitHub 入口和弹出式语言菜单；
   将 Header 提取为最小 Client Component，只监听滚动位置，不读取 Session。桌面与移动端复用现有
   `GitHubLink` 和 `LocaleSwitcher`，完成键盘、reduced-motion、320–1440 像素和生产构建验证。
8. 顶栏滚动视觉使用单一 smoothstep 曲线连续驱动背景透明度、blur、saturate、边框与阴影，在较长
   滚动区间内慢入慢出；测试分别采样顶端、前段、中段和稳定态，禁止恢复为阈值式整段模糊切换。
9. 以用户提供的灯塔图为编辑目标生成透明、居中的方形母版，再用高质量预乘 Alpha 缩放统一派生
   512px、180px 与 16/32/48px 图标；用 SHA-256 与 PNG RGBA 测试锁定四份交付资产，浏览器分别
   在浅色和深色背景检查 Header、manifest 和 favicon，禁止残留色键或暗色底。
10. 收口 Landing 能力卡文案，Footer 增加开发者邮件入口；移除语言布局中固定的图标 metadata，
    让 Next.js 从本地图标文件生成带内容指纹的应用图标 URL，并以单元测试和生产构建 HTML 校验。
11. 删除 Footer 中重复的 GitHub、控制台和语言入口；在英文路线轮播中固定状态/性别同排、完整
    被动可见和精简提示单行展示，并以 620px 浏览器几何断言覆盖截图中的换行与裁切问题。

## 2026-07-30 跨阶段修订：Landing 轮播真实名称与配方

本修订覆盖此前“抽象名称、合法性无关”的轮播展示约束，但不改变任何业务配方、确定性算法或用户
数据。交付顺序：

1. 先更新正式规格，再增加失败测试，逐一锁定库存、路线与收藏卡头像 Stable ID 对应的英文和中文
   目录名称，并拒绝 `Parent A`、`Target Pal A`、`亲本 A`、`目标帕鲁 A` 等抽象种类名。
2. 固定路线使用已验收目录中的两步关系：`carbunclo + sheepball -> bastet`，再由
   `bastet + naughtycat -> jellyfishghost`；测试同时锁定五个节点顺序、Pal ID 与本地化名称。
3. 同一 Pal 在库存、路线和收藏画面复用同一本地化名称键，头像继续来自当前 content hash 的本地
   资产；不由 AI 猜名字或配方，不运行生产查询，也不把固定示例描述成当前用户库存。
4. 最小修改 Landing 组件、英中翻译和相关测试；完成 Web format、lint、strict typecheck、受影响
   单元测试、production build 与 `git diff --check` 后单独提交。

## 2026-07-30 跨阶段修订：P0 SEO 首页定位与四个公开搜索入口

1. 锁定最新 `main`、现有首页 H1、sitemap 数量及 Sync CLI 的平台、命令、世界发现、只读快照和
   脱敏上传事实；公开文案遇到需求与实现冲突时以实际实现和正式规格为准并明确限制。
2. 先增加失败测试，覆盖首页双语 H1/副标题/三 CTA/四入口、八个公开路由、唯一 H1、CLI 命令、
   同语言内部链接、十组 metadata、十项 sitemap、JSON-LD、语言切换和公开 middleware 不查 Session。
3. 提取最小共享公开 Header/Footer、Breadcrumb、内容布局、FAQ、CTA、metadata 与结构化数据；
   四类页面保持 Server Component 和静态生成，正文不查询 Supabase 或用户数据。
4. 首页使用短产品 H1，并把品牌句降为 eyebrow；新增四张 locale-aware 内容卡和第三个存档同步 CTA，
   保留现有轮播及登录/控制台目标。
5. 更新 sitemap 为十个公开 URL，保留 robots 与全部私有 noindex/鉴权边界。公开 middleware 仅对已知
   公开路由直接继续，不改变登录、workspace 或 admin 的 Session 刷新和跳转逻辑。
6. 局部测试通过后，对最终状态执行 Web format、lint、typecheck、完整单元测试、相关 Playwright、
   production build、十个 URL 的本地生产服务 curl/HTML/JSON-LD 检查与 `git diff --check`。

### 回滚与生产约束

- 本修订只修改公开 Web 展示、消息、SEO 配置、测试与文档，不修改数据库、Sync 协议、CLI、认证
  流程、配种关系、算法、真实存档、`/opt/palworld`、容器或公网端口。
- 不执行 Vercel/Supabase/Agent 生产部署、远程推送、Search Console 或 Bing 提交；这些动作仍需
  独立人工授权和平台凭据。

## 2026-07-30 跨阶段修订：登录页返回公开首页入口

1. 先增加登录页失败测试，锁定桌面左侧品牌区存在本地化“了解 PalBeacon”链接并以根路径交给
   locale-aware 导航生成当前语言首页地址。
2. 复用现有 Button、翻译消息和 next-intl Link 增加入口，保持 44 像素点击区、键盘焦点和登录页
   响应式布局；不复制路由前缀、不使用 JavaScript `onClick`。
3. 运行登录页局部测试、Web lint/typecheck/test/build 与 `git diff --check`；不修改认证、Session、
   `next` 参数、数据库、Sync 协议、配种算法或生产环境。

## 2026-07-30 跨阶段修订：Landing Hero CTA 收口

1. 更新失败测试，将 Hero 的真实链接数量从三个锁定为两个，并拒绝继续显示“了解存档同步”。
2. 删除第三个 locale-aware CTA 及其英中文案；保留“开始使用”“打开控制台”和首页内容卡、Footer
   中的存档同步入口，不改变公开路由、metadata、sitemap 或认证流程。
3. 与登录页入口改动合并执行 Web 最终验证和 `git diff --check`。

## 2026-07-31 跨阶段修订：公共 Sync 世界身份、存档发现与公会有效性

### 交付顺序

1. 正式规格固定显式世界 UID、备份目录过滤、真实多世界错误和未知公会保守同步语义。
2. 增加失败测试，覆盖配置迁移、`init` 持久化、`run`/`inspect` 显式传参、活动世界优先、
   `backup`/`backups` 排除、真实多世界保留以及未知名称公会与共享资格清理。
3. 配置升级为向前兼容的新版本；从最终真实世界目录提取 32 位十六进制 UID，旧配置加载时
   原地安全迁移并保留设备令牌，不增加第三个交互问题。
4. 存档发现优先接受用户直接指定的世界根，并在父目录搜索时跳过已知非活动备份目录；仍拒绝
   符号链接和多个独立活动世界。
5. ParserAdapter 通过显式选项设置世界 UID；公共脱敏边界排除未知名称公会、清理无效引用，
   对关联库存采用个人或 unresolved 保守降级并关闭共享资格。
6. 运行 Sync 局部测试和最终 package 级 format、lint、typecheck、test、build、打包验证及
   `git diff --check`；不访问真实存档、不连接生产 API、不执行上传。

### 回滚与生产约束

- 配置迁移保留既有设备 ID、令牌、服务地址和同步状态；旧 CLI 回滚无法理解新版本配置时需重新
  `init`，不得通过删除或改写真实存档解决。
- 本修订不修改 Parser 事实算法、共享契约、数据库、`/opt/palworld`、Palworld/mihomo 容器或
  生产运行状态；不执行 npm publish、生产部署、远程推送或现有 tgz 覆盖。

## 2026-07-31 跨阶段修订：Phase 5 浏览器验收再精简

1. Phase 5 Playwright 删除公开 Landing 的五个重复场景：双语页面/SEO 聚合断言、窄屏排版、四个
   公开指南逐页导航、英文轮播精确几何和根路径语言协商。
2. Landing 的服务端内容、轮播事实、公开路由、canonical/hreflang、sitemap、robots 与 middleware
   继续由现有快速 Vitest 和生产构建覆盖；不删除这些功能门禁。
3. 保留登录失败与成功、未绑定同步引导、移动端无横向溢出、库存筛选/分享/分页/范围、隐私与
   越权、公会隔离、数据状态、配种任务与路线比较、计划收藏和管理员主流程。
4. 先以 Playwright 测试清单确认旧套件仍包含五个低价值场景，再删除对应文件；最终运行 Web 单元
   测试、精简后的 Phase 5 browser acceptance、格式检查和 `git diff --check`。
5. 本修订只改变测试分层与 CI 时间，不修改公开页面、认证、数据库、Sync 协议、配种算法、生产
   环境或 `/opt/palworld`。

## Phase 8：管理员功能、部署和端到端验收

### 阶段目标

完成管理员绑定、存档/解析、配种数据、任务/AI 和设置界面，在严格私有 Agent 边界下完成测试环境到生产的可回滚部署与第一版验收。

### 前置依赖

- Phase 0 至 7 全部通过 CI、安全和功能验收。
- 生产变更窗口、备份、域名、Vercel/Supabase/服务器权限和人工审批齐备。

### 明确范围

- `/admin/**` 管理功能、数据发布/回滚、绑定、状态和失败记录。
- Vercel 前端、Supabase 迁移、`/opt/services/palworld-manager` Agent 的审批后部署流程。
- 监控、日志轮转、备份、故障演练、移动浏览器和全链路验收。

### 明确不实现的内容

- 新公网 Agent API、修改现有 Palworld Compose、自动重启容器、全局代理。
- 第二/第三阶段扩展功能。

### 预计新增或修改的文件

- `apps/web/app/admin/**`、管理员 feature 与测试。
- `infra/agent` 生产模板和受控脚本、`infra/vercel` 配置、运行/回滚/事件手册。
- 发布检查表与端到端验收记录。

### 数据库迁移

只部署已在空库和升级副本验证的签名迁移；部署前备份并记录迁移版本，失败通过补偿迁移恢复兼容状态。

### API 和契约

- 管理员绑定、解析审核、配种版本发布/回滚、任务诊断 RPC。
- 运维状态响应脱敏，不返回路径、令牌或堆栈。

### 测试要求

- 管理员与玩家权限隔离、发布/回滚、Agent 失联、Parser 失败、AI 降级、任务恢复。
- 完整第一版验收标准、iPhone Safari、Android Chrome、微信浏览器基础流程。
- 部署前秘密扫描、镜像漏洞扫描、容器非 root 和端口检查。

### 验收标准

- 规格第 21 节 20 项验收全部有真实证据。
- 公网扫描不存在 Agent 业务端口；本机仅 `127.0.0.1:18765`。
- `/opt/palworld` 和原始存档部署前后哈希/配置不变；不控制 Palworld 或 mihomo 容器。
- 回滚演练能够恢复 Web、数据库兼容层和 Agent 上一镜像。

### 风险

- 生产迁移或资源竞争影响游戏；低并发/资源限制、变更窗口、先测试环境演练和即时回滚。
- 凭证泄漏；平台 Secret 管理、最小权限、日志脱敏和发布前扫描。

### 回滚方式

Vercel 回滚上一构建；Agent Compose 切回上一不可变镜像并仅重启本项目服务；数据库应用已演练补偿迁移或保持向后兼容；配种数据切回上一 published 版本。任何回滚都不操作 Palworld/mihomo 容器。

### 可独立执行的任务列表

1. 实现管理员绑定与状态页面。
   - 验证：`pnpm --filter @palhatch/web test -- admin`
2. 实现配种数据审核发布/回滚 UI。
   - 验证：`pnpm --filter @palhatch/web test:e2e --grep "breeding data admin"`
3. 演练测试环境部署和回滚。
   - 验证：`./infra/agent/scripts/verify-deployment.sh staging && ./infra/agent/scripts/verify-rollback.sh staging`
4. 执行安全与资源检查。
   - 验证：`pnpm scan:secrets && docker inspect palhatch-agent --format '{{.Config.User}} {{json .HostConfig.PortBindings}} {{json .HostConfig.Resources}}'`
5. 执行全链路验收并归档证据。
   - 验证：`pnpm check && cd apps/agent && uv run pytest && cd ../.. && supabase test db && pnpm --filter @palhatch/web test:e2e`

## 跨阶段变更规则

## 2026-07-31 跨阶段修订：Catalog 2.0、物品库存与递归配方

本修订按规格第 31 节执行，覆盖静态目录、动态物品库存和玩家查询界面，不扩展到通用服务器监控。
固定交付顺序如下：

1. 先增加失败测试，锁定 Catalog Schema `2.0.0` 的九类计数、九个 JSONL 文件、历史 `1.1.0`
   兼容以及所有消费端的精确文件集合；确认测试因当前七类实现真实失败。
2. 为被动技能增加结构化效果和确定性描述渲染测试，覆盖模板值、`uiCommon`、表现标签、换行、
   无模板缺省描述、三 locale、未知效果与残留变量。最小实现完成后用当前目标构建验证 115 个可显示
   被动均有完整说明。
3. 增加 `items`、`item_recipes` Reader 和物品/Common Text 本地化，读取合法物品、静态 ID 重定向、
   产品批量、五个有序材料、工作属性与禁止递归标记；source evidence 与排除/未解析总数必须闭合。
4. 升级共享 Schema、生成契约、Extractor manifest/hash/verifier/packager、Agent validation/cache/gateway、
   Supabase 目录表和 staging/finalize RPC；旧 1.1.0 目录继续可加载，已发布版本不改写。
5. 用 fixture 先锁定 CanonicalSnapshot 的基地/容器/槽位语义、容器去重、无法归属和个人背包排除，
   再最小扩展受控 Parser Adapter。Parser 继续只读取临时稳定副本且不联网、不写回 SAV。
6. 追加 forward-only 数据库迁移，建立独立物品快照、基地聚合、小时/日趋势和最新有效指针；物品失败
   不阻断帕鲁库存，RLS 只允许公会成员读取自身公会数据。增加 24 小时、90 天和 1 年边界测试。
7. 先以失败单元测试覆盖批量产出、中间库存、共享原料、替代配方、`DenyRecipeChain`、叶子物品和
   环检测，再实现带消费账本的确定性可行性检查与有界搜索。每个目标独立计算，不使用 AI。
8. 实现公会物品总览、分基地数量、总量/基地趋势曲线和配方树；无有效快照、过期数据、未解析数量、
   无配方和复杂度限制均提供本地化状态，不显示内部 ID。
9. 开发过程中只运行最小相关检查；最终状态运行根目录 `pnpm check`、Extractor `dotnet test`、相关
   本地 Supabase pgTAP、Parser fixture 与真实 Catalog 2.0 只读验收。聚合检查已经覆盖的命令不重复。
10. 检查 `git diff`、`git diff --check`、秘密与禁止资产；不部署生产、不推送远程、不修改真实存档、
    `/opt/palworld`、Palworld/mihomo 容器或公网端口。

### 公共 Sync Windows x64 扩展交付顺序

1. 先把运行平台收敛为共享的 `linux-x64 | win32-x64` 模型，并用失败测试覆盖平台、Parser 选择、
   Windows 路径、临时快照、配置与跨平台哈希；不改变 Sync 鉴权、脱敏或算法边界。
2. 使用同一 Parser 源码与固定 Go/MinGW 容器分别重复构建 Linux ELF 和 Windows PE，验证 fixture、
   可复现 SHA-256 与动态依赖后再生成独立 manifest。
3. 从 Sync Schema 生成 TypeScript/Python 模型，追加 forward-only 数据库约束迁移与 pgTAP；不得修改
   已应用 migration 或放宽为任意平台字符串。
4. 仅在两个 artifact 的版本、源码 commit 与 upstream commit 一致时组装唯一
   `palbeacon-cli-0.2.1.tgz`，先做平台无关结构检查，再由 Ubuntu/Windows matrix 安装同一 tgz 并
   解析相同 fixture。
5. 最后更新 Web 双语平台说明、普通 README、许可证/源码通知与运维文档。回滚只撤销未发布 npm
   candidate 和 Web/代码变更；不应用生产 migration、不操作 Palworld，也不停止既有同步服务。

6. 正式规格优先于本计划；规格变更必须先更新规格评审状态，再更新本计划和相关 ADR。
7. 已应用迁移不可原地修改，必须追加迁移。
8. 契约源变化后必须重新生成两端模型并通过漂移检查。
9. 所有外部系统通过 Adapter 隔离；测试默认使用本地 fake、fixture 或本地 Supabase。
10. 任一阶段只有在 lint、format、typecheck、test、build 与安全检查提供真实执行结果后才能声明完成。
