# Phase 4B 当前工作区未提交改动审查

- 审查日期：2026-07-15
- 审查分支：`feat/phase-4b-engine`
- 审查范围：当前工作区全部未提交改动，包含未跟踪文件；未修改实现文件
- 需求依据：`AGENTS.md`、正式设计规格、总实施计划中的 Phase 4
- 当前 Phase 判定：工作区自称 Phase 4B，但仓库没有单独获批的 Phase 4B 实施计划，因此进入下一 Phase 的门禁仍是总计划的 Phase 4 验收标准
- 总结（2026-07-15 修复复核）：1 个 BLOCKER 与 4 个 HIGH 已按最小方案关闭；3 个 MEDIUM 中路线键问题随事实绑定修复一并关闭，剩余 2 个保留为后续风险清单。Phase 4 仍以总实施计划和人工真实数据验收为最终门禁。

## 2026-07-15 修复复核

| 原问题                        | 最小修复                                                                                                                               | 回归证据                                                                            | 状态   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ |
| BLOCKER：数据库仍创建 v1 作业 | 前向迁移保留历史 v1、启用四套 `phase4b-deterministic-v1/*-v2` 七项权重；启动 Adapter 逐项核对数据库与代码注册表并 fail closed          | 四模式 create RPC pgTAP；本地 Supabase Claim → Adapter → Engine → Worker 集成通过   | 已关闭 |
| HIGH 1：同种父母镜像重复      | 同种父母只枚举一个性别方向，并在候选上限/评分前按无序物理计划签名去重                                                                  | 单一雄/雌只产生一个物理配对；多实例数量、父母交换和路线键回归                       | 已关闭 |
| HIGH 2：四模式在截断子集排名  | 先对完整已评分候选池计算四模式赢家，返回集合先包含四个模式的唯一赢家，再按请求模式补足                                                 | 构造被综合截断的零借用路线，断言仍为全局 `least_borrowing` 第一且排名都指向返回路线 | 已关闭 |
| HIGH 3：声明版本未绑定事实    | 引擎改为接收带 `version_id/status/content_hash` 的目录事实与带 `snapshot_id/world_id` 的库存 envelope；入口逐项核对并检查 Pal/被动成员 | UUID、状态、content hash、快照与 world 错配均以稳定错误码拒绝                       | 已关闭 |
| HIGH 4：任务 RPC 接受无效 ID  | 共享 StableId 约束下沉到 job 契约和数据库；创建作业时核对固定目录中的目标 Pal 与每个期望被动                                           | pgTAP 覆盖非法、超长、未知和合法成员；TS/Pydantic 契约同步                          | 已关闭 |

修复同时把路线键加入排序后的真实期望被动与目录 content hash，关闭了评审 MEDIUM 2；MEDIUM 1（路线持久化无损映射）和 MEDIUM 3（预处理阶段总 deadline）仍未纳入本次 BLOCKER/HIGH 最小修复范围。

最终共享验证为：根目录 `pnpm check` 完整通过，Agent `149 passed, 1 skipped`；本地 Supabase 空库 reset、lint 和 pgTAP `181/181` 通过；显式回环凭证运行 Claim → Adapter → Engine → Worker 集成 `1 passed`。固定合成基准连续两次的结构计数和摘要一致，摘要为 `b0f2cecc359b4297330e81c54f38b1da5930b3026663f725ec37fa98f5d13efa`。

## BLOCKER

### 1. 数据库创建的任务固定为旧算法/评分版本，新引擎会拒绝全部正常任务

- 文件与位置：
  - `apps/agent/src/pal_hatch_helper/breeding/engine.py:34,195-208`
  - `apps/agent/src/pal_hatch_helper/breeding/scoring.py:27-38`
  - `supabase/seed.sql:462-506`
  - `supabase/migrations/20260714020000_versioned_game_catalog.sql:1410-1415`
  - 当前未提交改动中没有新增 Supabase 迁移
- 触发条件：普通玩家通过 `create_breeding_job` 创建任意优化模式任务，之后由 Worker 把数据库固定的 `algorithm_version/scoring_profile_version` 交给新引擎。
- 实际影响：本地空库 reset 后，真实 RPC 探针创建出的任务为 `phase1-contract-v1/balanced-v1`；新引擎只接受 `phase4b-deterministic-v1` 与对应 `*-v2`，因此一旦接入 Job Handler，每个正常任务都会稳定失败为 `BREEDING_ALGORITHM_VERSION_UNSUPPORTED`，而不是产生路线。数据库保存的 v1 权重也只有四项，和引擎实际使用的七项权重不一致。
- 违反原因：Phase 4 计划明确要求补充算法/评分版本约束；正式规格要求任务在创建事务中固定可执行且可复现的算法和评分版本。当前数据库、JSON/Pydantic 契约和运行时注册表不是同一个可执行版本边界。
- 最小修复建议：追加前向迁移，新增四个不可变 v2 评分配置，保存与代码完全一致的七项权重，并按优化模式原子切换 active 标记；保留 v1 历史记录。随后增加从数据库 Claim 构造并调用引擎的 Adapter，启动时校验数据库版本/权重与代码注册表一致，不能静默回退。
- 应新增的回归测试：
  - pgTAP 对四种模式调用 `create_breeding_job`，断言固定的算法和评分版本均被当前引擎支持。
  - Python 集成测试从本地 Supabase 领取真实任务并进入引擎版本校验，不能使用测试工厂直接注入 v2 绕过数据库。
  - 数据库中的七项权重、代码注册表和输出 `score_breakdown` 必须逐项一致。

## HIGH

### 1. 同种父母的一公一母被镜像枚举成两条相同物理路线

- 文件与位置：
  - `apps/agent/src/pal_hatch_helper/breeding/assignment.py:113-149`
  - `apps/agent/tests/breeding/test_assignment.py:157-172`
  - `docs/architecture/deterministic-breeding-engine.md:74-79`
- 触发条件：有效配方为 `pal-same + pal-same -> pal-target`，库存中只有一个雄性实例和一个雌性实例。
- 实际影响：分配器依次生成 `(male, female)` 和 `(female, male)` 两个 orientation，签名中的左右顺序不同，因此得到两个不同 `route_key`。实测一个真实父母组合返回了 2 条候选。库存中有两个物理组合时，还可能被膨胀为 4 条，从而错误越过“至少三条合法路线”的门槛、重复展示和保存同一计划。
- 违反原因：规格要求父母无序归一化并返回可比较的合法路线；镜像顺序不是新的配种事实或新的可执行组合。当前测试只检查第一条路线用了两个不同 UID，没有断言候选唯一性或数量。
- 最小修复建议：同种父母节点应按完整 AssignedRoute/实例稳定键归一化左右父源，跳过镜像 orientation；在候选上限和评分之前再按与父槽位无关的物理计划键去重，并记录真实的候选去重计数。
- 应新增的回归测试：
  - 一个雄性 UID 加一个雌性 UID 只能得到一条路线，并返回 `FEWER_THAN_THREE_LEGAL_ROUTES`。
  - 多个雄/雌实例时，候选数量等于唯一无序实例配对数，而不是两倍。
  - 交换配方父母输入顺序后，完整结果 JSON、路线键和候选数量都不变。

### 2. 四模式排名只在“请求模式截断后的候选”中计算，会把非最优路线标成最快/最少借用

- 文件与位置：
  - `apps/agent/src/pal_hatch_helper/breeding/engine.py:134-180,238-254`
  - `apps/agent/tests/breeding/test_scoring.py:46-68,95-114`
  - `docs/architecture/deterministic-breeding-engine.md:145-155`
- 触发条件：合法候选数大于 `max_results`，且某条不在请求模式 Top N 中的路线，是另一优化模式的全局第一名。
- 实际影响：引擎先按请求模式截断，再把 `returned` 传给 `_mode_rankings`。审查探针中共有 5 条已完整评分候选、`max_results=3`；返回的三条都是一代但借用 1 只帕鲁，真正的 0 借用路线位于综合模式截断之外，`least_borrowing` 排名却完全不包含它。前端据此会显示错误的“最少借用”方案。此时诊断仍给出 `search_complete=true` 且没有命中限制。
- 违反原因：正式规格要求四种评分模式，结果页要突出综合、最快、最高成功率和最少借用方案；架构文档也明确声称结果同时保存四种模式的排名。对截断子集排名不能证明任何全局标签。
- 最小修复建议：先在全部已评分候选上计算四套排名，再构造返回集合。返回集合至少应包含每种模式的第一名，再用请求模式补足；若契约要求 ranking 只能引用已返回路线，则调整 `max_results` 约束或为未返回赢家提供完整摘要。输出截断的完成语义和稳定原因码也应明确。
- 应新增的回归测试：构造“短但借用”和“长但零借用”至少 5 条路线，令综合模式截断掉零借用路线；断言四种模式的第一名仍分别是全候选池的真实第一名，且所有 ranking 引用都可解析。

### 3. `game_data_version_id` 没有与传入配方绑定，引擎可把任意或未发布配方标成固定版本结果

- 文件与位置：
  - `apps/agent/src/pal_hatch_helper/breeding/engine.py:41-49,170-188`
  - `packages/contracts/schema/breeding-engine.schema.json:8-45`
  - `docs/architecture/deterministic-breeding-engine.md:12-18,43`
  - `apps/agent/tests/breeding/test_reproducibility.py:12-34`
- 触发条件：调用方保持完全相同的 `BreedingEngineRequest.game_data_version_id`，但向第二个参数传入另一版本、staging 版本或手工构造的 `CatalogBreedingRecipe` 集合。
- 实际影响：`search` 只接收无版本元数据的裸 `Iterable[CatalogBreedingRecipe]`，不会核对 UUID、status、content hash 或目录中的 Pal/被动外键。实测同一请求和同一版本 ID 分别传入两组不同配方，两个结果都回显相同 `game_data_version_id`，却生成不同父母路线和摘要。库存列表与 `inventory_snapshot_id` 也只有调用方声明，没有版本化加载边界。
- 违反原因：Phase 4 验收要求算法只使用 published 固定版本中的配方，历史结果必须按精确版本复现。把关键约束写成“调用方必须正确”但没有可执行 Adapter 或类型绑定，不能形成事实完整性边界；现有测试只验证相同配方的输入顺序变化。
- 最小修复建议：让引擎接收携带 `version_id/status/content_hash` 的已验证目录对象，以及携带 `snapshot_id/world_id` 的固定库存对象；在入口核对请求 ID、published/历史可读状态和目录/库存元数据。若保持纯函数，至少引入不可由裸列表替代的 version-scoped value object，并由精确版本 Repository 构造。
- 应新增的回归测试：
  - 请求版本与目录对象 UUID 不同、目录状态为 staging/rejected、content hash 不同都返回稳定错误码且不产生路线。
  - 固定快照 ID 与库存 envelope 不同稳定失败。
  - 从本地 Supabase published 版本 exact-load 后运行，引擎输出的每个关系都能回查该 UUID 的投影；切换 world 当前版本不得改变历史请求结果。

### 4. 任务创建 RPC 未在数据库限制稳定 ID 或目录成员，绕过前端即可写入引擎无法处理的任务

- 文件与位置：
  - `packages/contracts/schema/breeding-engine.schema.json:24-30,48-53`
  - `supabase/migrations/20260713012000_breeding_jobs_and_plans.sql:27-35,61-66`
  - `supabase/migrations/20260714020000_versioned_game_catalog.sql:1352-1368`
  - `apps/agent/tests/test_breeding_engine_contracts.py:10-88`
- 触发条件：authenticated 用户不经过未来前端选择器，直接调用 `create_breeding_job`，传入包含空格/大写的目标 ID、超过 120 字符的被动 ID，或传入当前固定目录中不存在但格式合法的 ID。
- 实际影响：数据库只检查目标整体长度、数组非空/去重，不检查稳定 ID 正则、被动元素长度，也不核对固定目录成员。事务探针成功创建了 `target_pal_id='Pal Target'`、单个被动长度 121 的任务；相同值会被新 Pydantic 模型拒绝，导致队列中出现无法构造引擎请求的持久任务。格式合法但不存在的 ID 还会无意义消耗搜索任务。
- 违反原因：工程约定明确禁止只在前端限制；TS、JSON Schema、Pydantic 和数据库业务字段必须一致。目标与被动属于发布目录事实，创建 RPC 已经在同一事务固定版本，应在数据库侧验证。
- 最小修复建议：追加迁移统一稳定 ID 约束和元素最大长度；在 `create_breeding_job` 固定版本后验证目标存在于 `catalog_pals`、每个被动存在于 `catalog_passive_skills`，使用稳定错误码区分格式错误和目录成员缺失。共享契约应复用同一个 StableId 定义，避免 job schema 与 engine schema再维护两套规则。
- 应新增的回归测试：pgTAP 直接以 authenticated 身份调用 RPC，覆盖大写/空格、超长、未知目标、未知被动和合法目录成员；并用同一 fixture 验证 JSON Schema、生成 Pydantic 和数据库接受/拒绝集合完全一致。

## MEDIUM

### 1. 合法的 0 代路线无法按当前数据库约束保存，且多代父源字段也没有无损映射

- 文件与位置：
  - `apps/agent/src/pal_hatch_helper/breeding/scoring.py:113-168`
  - `packages/contracts/schema/breeding-engine.schema.json:307-347,413-441`
  - `packages/contracts/schema/breeding-engine.schema.json:216-304`
  - `supabase/migrations/20260713012000_breeding_jobs_and_plans.sql:137-161,180-219`
- 触发条件：库存已经存在满足目标和期望被动的实例，产生 0 步路线；或保存包含中间代父源的多代路线。
- 实际影响：0 步路线按实现输出 `estimated_attempts_min=0/estimated_attempts_max=0`，Schema/Pydantic 允许且要求这两个整数；数据库 `breeding_routes_attempts_check` 对非 null 值要求最小次数大于 0，本地事务插入已确认触发 check violation。多代契约还依赖 `produced_by_step_index`、`recipe_type`、`child_required_gender` 等字段，当前 `breeding_steps` 没有对应列，若直接落库会丢失执行拓扑和性别约束。
- 违反原因：规格把 0 代已有实例作为合法候选，并要求历史计划可解释、步骤可执行；数据库、Schema、Pydantic 字段语义不一致会在保存计划时产生事务失败或状态丢失。
- 最小修复建议：明确 0 代语义并统一三层：要么数据库允许 `0/0`，要么契约统一使用 null 且 Adapter 明确映射。为中间父源增加可约束的前序 step 引用、配方类型和所需性别字段，或设计一个经 Schema 校验且数据库约束可验证的完整路线 JSON；不要仅把信息塞入无结构约束的 `score_breakdown`。
- 应新增的回归测试：从真实引擎结果到本地数据库的事务集成测试，覆盖 0 代、一代和多代路线；插入后重新读取必须与原输出拓扑、父源、性别、被动和尝试区间一致。

### 2. `route_key` 没有包含真实期望被动，两个不同请求可得到同一个路线键

- 文件与位置：
  - `apps/agent/src/pal_hatch_helper/breeding/engine.py:107,211-221`
  - `apps/agent/src/pal_hatch_helper/breeding/planning.py:35-59,96-99`
  - `docs/architecture/deterministic-breeding-engine.md:157-171`
- 触发条件：同一目标实例同时携带 `passive-a` 和 `passive-b`；分别以其中一个作为唯一期望被动运行，其他固定 ID/版本不变。
- 实际影响：规划签名只记录位图数值 `required=1`，路线键只哈希版本、快照和该签名，不包含被动 ID。本地探针确认两个语义不同请求产生完全相同的 `route_key`，虽然结果摘要不同。未来若缓存、选择、审计或幂等逻辑以路线键为标识，会串用不同被动目标的路线。
- 违反原因：架构文档声称规范化请求和被动分派事实进入路线键或摘要；稳定标识符不能只在单个结果数组内偶然唯一。
- 最小修复建议：路线键的规范输入加入排序后的目标 ID、期望被动 ID，以及所有会改变合法性/评分的固定请求字段；或者让规划签名直接编码被动稳定 ID 而不是请求局部位号。明确路线键是 job-scoped 还是全局语义键，并在数据库/契约中保持一致。
- 应新增的回归测试：相同实例分别请求不同被动必须生成不同路线键；期望被动输入顺序变化必须保持同一键；完全相同的规范请求在重启和输入乱序后仍保持同一键。

### 3. `timeout_ms` 不覆盖配方建索引和库存预处理，超时结果仍可声称搜索完整

- 文件与位置：
  - `apps/agent/src/pal_hatch_helper/breeding/engine.py:41-61`
  - `apps/agent/src/pal_hatch_helper/breeding/limits.py:12-54`
  - `apps/agent/tests/breeding/test_limits.py:46-62`
  - `docs/architecture/deterministic-breeding-engine.md:113-130`
- 触发条件：配方 Iterable 获取/遍历、索引分组或大库存排序耗时超过 `timeout_ms`，而进入种类搜索后没有节点或很快结束。
- 实际影响：SearchBudget 在配方索引与库存筛选之后才启动，且这些输入没有数组上限。使用一个预处理阶段耗时约 50 ms 的配方 Iterable 和 `timeout_ms=1`，结果仍为 `hit_limits=[]/search_complete=true`。大目录或异常 Adapter 可绕过本阶段宣称的硬超时和资源保护。
- 违反原因：Phase 4 要求单任务算法时间和资源上限配置化；文档明确写“硬超时”。现有测试只让注入时钟在已进入节点展开后前进，没有覆盖预处理失败路径。
- 最小修复建议：在 `search` 最开始建立绝对 deadline，把预算或 deadline 传入索引构建、库存规范化、闭包计算、规划和评分阶段并周期检查；同时为库存和配方数量设置与目录校验一致的上限。若 `timeout_ms` 只定义搜索阶段，应重命名字段并修正文档，另设总任务 deadline。
- 应新增的回归测试：慢 Iterable、大库存排序和无搜索节点三种场景都必须在总 deadline 内返回 `timeout/search_complete=false`；预处理刚好在界内的正常输入仍可复现。

## LOW

无。

## 当前 Phase 验收与范围结论

- 当前工作区只实现 Phase 4B 引擎、契约、测试和基准，没有提前接入 Phase 5 登录/库存页面、Phase 6 AI/Job Handler 或 Phase 7 自动计划推进。
- 但是仓库没有独立获批的 Phase 4A/4B 实施计划。总计划的当前门禁仍是 Phase 4；`docs/architecture/deterministic-breeding-engine.md:3` 的“已通过 Phase 4B 验证”不能替代正式阶段验收。
- 已提交的 `docs/reviews/phase-4a-review.md` 仍记录 Phase 4A 的来源入口、版本 provenance/兼容性和完整统一目录 diff 等 HIGH 问题；当前未提交 diff 没有修改对应文件。本次按用户要求没有重新审查或重复计入这些基线发现，但它们仍会阻止总 Phase 4 通过。
- 因此当前工作区尚未完整满足 Phase 4 的“published 固定事实、合法唯一候选、四模式正确排名、版本化评分和可复现”验收标准。

## 已验证的安全边界

- 已完整读取 `AGENTS.md`、正式设计规格和总实施计划，并确认仓库不存在单独的 Phase 4B 实施计划。
- 已执行用户指定的 `git status --short --branch`、`git diff --check`、`git diff --stat` 和 `git diff`；未跟踪文件已逐个读取。写入本报告前后，原工作区差异范围未出现意外实现变更。
- 使用仓库要求的 Node `v22.23.1` 实际执行 `pnpm check`：契约生成、Prettier、ESLint、TypeScript、Vitest、Next.js build、Ruff、mypy、pytest、结构检查和秘密扫描全部通过。Agent 全量为 `137 passed, 1 skipped`；被跳过的本地 Supabase 生命周期测试随后显式注入回环地址和本地测试 key 单独运行，`1 passed`。
- Phase 4B 定向 Python 测试 `35 passed`，TypeScript 契约定向测试 `3 passed`。
- 本地 Supabase 实际执行空库 `supabase db reset`、`supabase db lint` 和全量 `supabase test db`；pgTAP 为 `164/164` 通过。仅使用 `127.0.0.1` 本地 fixture 环境，未连接 linked/生产项目。
- 性能基准连续执行两次；图规模、展开/剪枝计数、候选数、命中限制和摘要均与归档一致，摘要均为 `5580e066c407f78d73181e1d3edf0a26c781e8f75548c89980bbea253797f5ba`。耗时约 568/567 ms，峰值 Python 分配内存约 14.44 MB。
- 未发现 `.env`、生产密钥、邮箱、真实服务器 IP、真实存档或生产数据提交；秘密扫描通过。探针输出中的凭证均为 Supabase CLI 的本地固定 demo 凭证，未写入工作区。
- 未新增依赖或 lockfile 变更；未修改 Phase 0 的 Node/pnpm/Python/CI/Compose/端口配置，完整 check 通过。
- 未访问或修改 `/opt/palworld`，未修改 Palworld/mihomo Compose、容器、权限或存档；未访问生产数据库、生产密钥或真实服务器凭证。
- 当前 diff 不写数据库、不发布目录、不接入 AI，不新增公网端口，也没有让 AI 生成或改变配种事实。
- 新增错误分支使用稳定错误码；未发现敏感路径、令牌、原始库存或异常堆栈进入引擎输出。

## 验证过程说明

- 当前 shell 初始 Node 为 v26；定向 TS 测试因此先显示 engine warning。完整验证显式加载 `.nvmrc` 对应 Node v22.23.1 后重跑并通过，报告不把 Node v26 调用当作正式全量证据。
- 主机没有 `psql` 可执行文件；数据库边界探针改用本地 `supabase_db_pal-hatch-helper-local` 容器内的 `psql`，所有写入均包在事务中并 rollback。探针确认 RPC 接受不一致 ID/固定旧版本，也确认 `0/0` 路线触发数据库 check violation。
- `pnpm check` 会重新生成契约文件；生成后 Git 状态和预期工作区一致，没有产生额外差异。
- 额外只读行为探针确认：同种父母镜像重复、四模式截断排名、不同被动路线键碰撞、相同版本 ID 可配不同配方，以及预处理绕过 timeout。这些失败路径不在现有 35 项 Phase 4B 测试中。

## 仍未验证的风险

- 未连接任何真实游戏目录、真实配种来源或生产 Supabase，未验证来源许可、真实 build 对应关系和真实配方完整性。
- 未使用完整真实目录和真实库存评估搜索质量、最坏内存、磁盘压力或 5 代组合爆炸；当前 benchmark 是明确标注的合成数据，而且有意命中三个内部 cap。
- 没有可执行的真实 Engine Job Handler，也没有把引擎结果原子持久化到计划/路线/步骤表；本地 Worker 集成仍使用 fake handler。
- 未验证并发 Worker 在“算法完成 → 路线持久化 → AI enrich”边界的幂等性、租约丢失后重放或部分写入回滚。
- 未构建 Agent Docker 镜像；本次没有 Dockerfile、依赖或 Compose 变更，但容器内性能和资源限制仍未验证。
- 未运行生产部署、远程推送、真实发布/回滚或任何 `/opt/services/palworld-manager` 操作。

## 建议人工检查项

- 先决定并正式评审 Phase 4 是否拆分为 4A/4B；若拆分，明确每个子阶段的验收、回滚和总 Phase 门禁，不用架构状态行替代实施计划。
- 人工核对四套 v2 权重的产品含义，并确认数据库不可变记录、代码整数基点和 UI 标签完全一致；“最高成功率”仍只能解释为策略代理。
- 对真实配方抽样人工复核特殊配方优先、同种父母唯一性、性别要求和多代被动检查点，不能只依赖合成图 Oracle。
- 在引入真实 Job Handler 前，人工评审精确版本加载、库存权限投影和结果持久化事务，特别检查 service-role 数据不会进入前端响应。
- 关闭已记录的 Phase 4A HIGH 问题后，再做一次从来源获取、validate/stage/finalize/publish、固定任务、exact-load、engine、持久化和 rollback 的本地全链路演练。

## Phase 结论

原审查的 BLOCKER 与 4 个 HIGH 已关闭。数据库正常创建的四模式作业现可经真实 Claim 和精确版本 Adapter 进入引擎；候选唯一性、全候选池四模式排名、事实绑定及数据库输入边界均有回归保护。

当前进度统一记录为“Phase 4 代码与高风险门禁完成，待人工真实数据验收”。在真实来源及游戏 build 对应关系人工确认前，仍不能进入下一 Phase。
