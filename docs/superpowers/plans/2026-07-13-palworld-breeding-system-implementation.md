# PalHatch Helper 分阶段实施计划

- 修订状态：截至 2026-08-03，全部修订 design=approved 且自动化门禁通过。implementation 除 2026-07-31 Catalog 2.0、物品库存与递归配方（in_progress，见文末对应章节）外均 completed；production_deploy 除 2026-07-27 路线语义去重、2026-07-24 库存位置/次元帕鲁仓库、2026-08-01 存档载荷保留/公会箱/请求时产量/五分钟行内趋势、Phase 6 已完成外，其余（含 2026-08-02/08-03 全部修订）not_started。已完成修订在本计划中只保留一行索引，内容已并入正式规格；正式规格是唯一需求来源。
- 日期：2026-07-13
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
- Supabase 中已被更新快照取代的库存明细保留 30 分钟，最新有效库存始终保留；
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
  库存骤降、30 分钟边界、最新快照保护、同哈希重新发布和分批保留清理。
- 测试断言源 fixture 的哈希与权限未变化。

### 验收标准

- 只读 fixture 在复制成功与所有失败路径均保持字节不变。
- 只有完整合法快照能原子成为 latest；异常下降进入审核。
- Agent 未配置唯一确认路径时 not ready，不猜测目录。
- 被取代的数据库库存明细在 30 分钟后可清理；最新库存、共享偏好和历史方案不被删除。

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

### 当前进度

- Phase 4A/4B 仅作为实现检查点，不改变本节的统一验收范围。已完成受审计来源入口、确定性两层搜索、实例分配、候选物理去重、四模式全候选池排名与完整评分明细；Build `24181105` 真实七类目录已完成人工批准、本地测试 world 发布与回滚/恢复演练，`real_data_acceptance`、`local_test_publish` 与后续 Phase 8 生产发布均已完成。2026-07-20 追加库存感知修订（`ready/needs_inventory` 分层、缺失父母需求、真实库存覆盖率、禁止目标零步完成、增量保留有界候选）已并入规格 §11；历史固定结果保持不变。

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

### 当前进度

- `implementation=completed`、`automated_gates=passed`；并行交付边界已由 `docs/decisions/0005-phase5-parallel-delivery-boundary.md` 批准。独立使用 Phase 1 RLS/RPC、Phase 3 脱敏库存与本地/预览 Supabase，不得绕过 Phase 4 真实数据人工验收和生产发布门禁。2026-07-27 起概览、导航、数据状态与库存页修订已并入规格 §17，按文末修订索引交付。

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

### 当前状态

- Phase 6 `implementation=completed`、`automated_gates=passed`、`local_integration=completed`、`production_deploy=completed`（生产发布由 Phase 8 受控流程完成）；依赖的 Phase 4 `real_data_acceptance=completed`、`local_test_publish=completed`。

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

- 已完成；内容并入正式规格 §17.13、§26。唯一新增生产依赖 `next-intl`（已批准）。

## 2026-07-28 跨阶段修订：全局被动单排交替三角纹理

- 已完成；内容并入正式规格 §17.5。

## 2026-07-28 跨阶段修订：已选被动定宽与计划卡片左对齐

- 已完成；内容并入正式规格 §17.6、§17.8。

## 2026-07-28 跨阶段修订：计划网格与配种被动布局

- 已完成；内容并入正式规格 §17.8。

## 2026-07-28 跨阶段修订：配种工作台目标与被动布局、五代上限和 Phase 5 验收提速

- 已完成；新请求五代上限与历史八代结果只读兼容已并入正式规格 §17.6，Phase 5 浏览器验收精简见规格 §20.3。

## 2026-07-28 跨阶段修订：我的计划与配种路线视觉收口

- 已完成；内容并入正式规格 §17.8、§17.9。

## 2026-07-27 跨阶段修订：配种工作台创建页聚焦与被动效果说明

- 已完成；内容并入正式规格 §17.6。

## 2026-07-27 跨阶段修订：全局被动品级视觉与库存被动多选

- 已完成；内容并入正式规格 §17.5。

## 2026-07-27 跨阶段修订：帕鲁库存用户体验收口

- 已完成；内容并入正式规格 §17.5。

## 2026-07-27 跨阶段修订：路线语义去重与 2000+ 库存容量

- 已完成并完成生产部署；内容并入正式规格 §11.3。

## 2026-07-24 跨阶段修订：数据库库存快照 24 小时保留

- 已完成；最终保留语义由正式规格 §8.2 取代（成功载荷 30 分钟、审计存根、受控分批清理 RPC）。

## 2026-07-24 跨阶段修订：Boss ID 与公会所有库存

- 已完成；内容并入正式规格 §6.3、§9.4、§11.2。

## 2026-07-24 跨阶段修订：头目标志、精确位置与次元帕鲁仓库

- 已完成并完成生产部署；内容并入正式规格 §6.3、§9.4。

## 2026-07-29 跨阶段修订：普通用户公共 Sync 安装流程

- 已完成；内容并入正式规格 §24。

## 2026-07-29 跨阶段修订：公共 Sync 文档与 CLI 本地化

- 已完成；内容并入正式规格 §24 第 8 项。

## 2026-07-29 跨阶段修订：未绑定引导、Steam 头像与导航收口

- 已完成；内容并入正式规格 §17.11。

## 2026-07-29 跨阶段修订：顶部品牌、数据徽标与 GitHub 入口

- 已完成；内容并入正式规格 §25。

## 2026-07-30 跨阶段修订：公开双语首页与搜索引擎收录

- 已完成；内容并入正式规格 §26。

## 2026-07-30 跨阶段修订：公开首页信息收口与工作台轮播

- 已完成；内容并入正式规格 §26。

## 2026-07-30 跨阶段修订：轮播层级与首页通信示意

- 已完成；内容并入正式规格 §26。

## 2026-07-30 跨阶段修订：路线轮播代际布局

- 已完成；内容并入正式规格 §26 第 10 项。

## 2026-07-30 跨阶段修订：轮播内容密度与被动品级

- 已完成；内容并入正式规格 §26 第 13 项。

## 2026-07-30 跨阶段修订：Landing 轮播真实名称与配方

- 已完成；内容并入正式规格 §26 第 10 项。

## 2026-07-30 跨阶段修订：P0 SEO 首页定位与四个公开搜索入口

- 已完成；内容并入正式规格 §27。

## 2026-07-30 跨阶段修订：登录页返回公开首页入口

- 已完成；内容并入正式规格 §28。

## 2026-07-30 跨阶段修订：Landing Hero CTA 收口

- 已完成；内容并入正式规格 §29。

## 2026-07-31 跨阶段修订：公共 Sync 世界身份、存档发现与公会有效性

- 已完成（production_deploy=not_started）；内容并入正式规格 §30。

## 2026-07-31 跨阶段修订：Phase 5 浏览器验收再精简

- 已完成；内容并入正式规格 §20.3。
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

## 2026-08-03 跨阶段修订：账号邮箱、活动服务器成员与邀请绑定

- 已完成（production_deploy=not_started）；内容并入正式规格 §37。

## 2026-08-03 跨阶段修订：物品库存列顺序与周期变化边界

- 已完成（production_deploy=not_started）；内容并入正式规格 §36。

## 2026-08-02 跨阶段修订：Landing 物品监控紧凑单行布局

- 已完成（production_deploy=not_started）；内容并入正式规格 §35。

## 2026-08-02 跨阶段修订：Landing 轮播改为公会帕鲁与物品监控

- 已完成（production_deploy=not_started）；内容并入正式规格 §34。

## 2026-08-02 跨阶段修订：Landing 物品库存趋势与基地数量介绍

- 已完成（production_deploy=not_started）；内容并入正式规格 §33。

## 2026-08-03 跨阶段修订：次元仓库帕鲁 ID 大小写兼容

- 已完成（production_deploy=not_started）；内容并入正式规格 §9.4 第 11 项。

## 2026-08-02 跨阶段修订：unchanged 心跳新鲜度与物品制作文案

- 已完成（production_deploy=not_started）；内容并入正式规格 §32。

## 2026-08-01 跨阶段修订：存档载荷保留、公会箱、请求时产量与五分钟行内趋势

- 已完成并完成生产部署；内容并入正式规格 §8.2、§31.3、§31.4。

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
