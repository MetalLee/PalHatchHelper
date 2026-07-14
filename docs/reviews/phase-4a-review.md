# Phase 4A 未提交改动审查

- 审查日期：2026-07-14
- 审查范围：`feat/phase-4a-breeding-data` 当前工作区全部未提交改动（含未跟踪文件）
- 当前结论（2026-07-15 修复复核）：4 个 HIGH 已按最小方案关闭；3 个 MEDIUM、1 个 LOW 保留为后续风险清单。Phase 4 的代码与高风险门禁已具备，仍需按正式规格完成人工真实来源许可、版本和真实性核验后才能进入下一 Phase。
- 需求依据：`AGENTS.md`、正式设计规格、总实施计划中的 Phase 4。仓库中不存在单独的 Phase 4A 实施计划；`docs/operations/breeding-data.md` 是本次未提交的运行文档，不能替代已批准实施计划或覆盖正式规格。

## 2026-07-15 修复复核

| 原 HIGH                     | 最小修复                                                                                                                                                                                      | 回归证据                                                                                                      | 状态   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| 1. 阶段范围不完整           | 继续完成总计划 Phase 4 的两层搜索、实例分配、四模式评分、确定性与资源限制，不把 4A/4B 当作独立阶段门禁                                                                                        | `tests/breeding/`、共享 engine 契约、确定性基准                                                               | 已关闭 |
| 2. 供应链无入口             | 增加 `catalog prepare-breeding-source`；只按数据库中受审计且启用的 source UUID 构造 Upload/GitHub/URL Adapter，输出可继续 `catalog stage` 的本地候选                                          | CLI 回归覆盖 Upload 闭环、disabled 来源和稳定退出码；pgTAP 覆盖来源配置权限                                   | 已关闭 |
| 3. 基础目录与来源未精确绑定 | 来源契约强制 `base_content_hash + game_build_id + game_version`；候选保留基础目录版本/包哈希，并把来源 UUID、类型、名称、版本、文件名、原始哈希和 UTC 获取时间写入受 Schema 约束的 provenance | 不同 hash/build/version 均以 `BREEDING_BASE_CATALOG_MISMATCH` 拒绝；导入 RPC 拒绝 provenance/source UUID 错配 | 已关闭 |
| 4. 只审配方却发布完整目录   | 配种专用 diff 在 SQL 中逐投影比较其余六类事实；带 provenance 的候选在 world 指针切换前再次执行同一门禁，回滚完整已发布版本不受影响                                                            | `phase4_hardening.sql` 覆盖非配种事实隐藏变化的 diff 与 publish 拒绝                                          | 已关闭 |

本次没有顺带扩大到 MEDIUM/LOW；其中通用 URL 的 DNS/allowlist、整次下载 deadline 和 metadata 细粒度 diff 仍需单独排期。所有仓库数据仍是虚构 fixture，修复不代表任何真实来源已经通过人工真实性验收。

本次 4A/4B 修复共用一轮最终验证：根目录 `pnpm check` 完整通过（Agent `149 passed, 1 skipped`），本地空库 reset 和 lint 通过，pgTAP `181/181` 通过；被根命令按环境跳过的本地 Supabase 生命周期用例随后显式使用回环测试凭证运行，`1 passed`。未连接生产或 linked 项目。

## BLOCKER

无。

## HIGH

### 1. 已批准的 Phase 4 验收范围尚未完成，未批准的“Phase 4A”拆分不能作为进入下一 Phase 的依据

- 文件与位置：`docs/superpowers/plans/2026-07-13-palworld-breeding-system-implementation.md:373-418`、`apps/agent/src/pal_hatch_helper/breeding/handler.py:6-8`、`docs/operations/breeding-data.md:1-3`
- 触发条件：把当前 `feat/phase-4a-breeding-data` 工作区视为当前 Phase 已完成，并开始 Phase 5 或其他下一 Phase。
- 实际影响：已批准计划要求 Phase 4 同时交付确定性两层搜索、实例分配、性别/共享/被动约束、四种评分模式、至少三条路线和完整 `score_breakdown`；当前代码只有配种来源/校验/差异工具，`BreedingJobHandler` 仍明确只是 Protocol，工作区中不存在路线搜索、实例分配或评分实现及验收测试。
- 违反原因：`AGENTS.md` 要求计划约束交付顺序；工作区没有单独的 Phase 4A 计划，未提交的运行文档不能自行缩小 Phase 4 验收标准。若不明确这是 Phase 4 的中间检查点，阶段状态、文档和真实能力会不一致。
- 最小修复建议：二选一：先评审并提交不覆盖正式规格的 Phase 4A/4B 细化计划，明确当前仅为不可进入 Phase 5 的中间交付；或继续完成总计划中 Phase 4 的算法、评分和可复现验收后再做阶段结论。
- 应新增的回归测试：在 Phase 4 阶段门禁中加入特殊配方、多代搜索、父母交换属性测试、实例性别替代、共享关闭排除、四模式排序、少于/不少于三条路线、固定版本历史复现和完整评分明细测试；CI/结构检查不得在这些测试不存在时把 Phase 4 标为完成。

### 2. 配种来源供应链只有未被生产入口引用的库代码，文档中的获取到版本化流程实际不可执行

- 文件与位置：`apps/agent/src/pal_hatch_helper/breeding/data_sources.py:100-235`、`apps/agent/src/pal_hatch_helper/breeding/supply_chain.py:23-78`、`apps/agent/src/pal_hatch_helper/cli.py:49-75`、`supabase/tests/breeding_versions.sql:6-29`、`docs/operations/breeding-data.md:14-28`
- 触发条件：运维人员按文档尝试配置 GitHub/URL/Upload 来源，抓取、暂存、转换并生成可交给现有 `catalog stage` 的候选版本。
- 实际影响：CLI 只有 `validate/stage/publish/rollback/warm-cache/inspect/diff`，没有任何命令或 Worker 实例化三个 Adapter、调用 `stage_breeding_source` 或 `prepare_breeding_catalog_version`；全仓除测试外也没有调用点。数据库测试以数据库 owner 直接插入来源记录，而迁移只向 `authenticated/service_role` 授予来源表 SELECT，没有当前角色可用的创建/启用来源 RPC。所谓“可配置供应链”无法从真实入口完成闭环。
- 违反原因：Phase 4 范围明确包含 GitHub/URL/Upload Adapter 与 staging；工作区文档声称已经存在“获取 → 暂存 → 转换 → 版本化”数据流，但代码只由单元测试直接拼装对象，核心验收没有真实行为入口。
- 最小修复建议：增加一个明确、默认禁用的受控 CLI/服务入口，从受审计来源配置构造 Adapter，完成 fetch → stage → validate → prepare，并输出候选目录和稳定状态码；来源创建/启用必须走管理员或受控 service-role RPC，且最终 `catalog stage --source-id` 必须与实际抓取来源绑定，不能由操作者任意配对。
- 应新增的回归测试：通过真实 CLI 主函数和 fake/MockTransport 跑完 Upload 与远程来源到 normalized candidate 的闭环；断言 disabled 来源不发请求、错误退出码稳定、输出候选可被 `catalog stage` 接受，并验证普通玩家不能创建/启用来源。

### 3. 配种来源没有绑定基础目录的精确版本，且候选 manifest 混用了游戏版本与来源版本

- 文件与位置：`packages/contracts/schema/breeding-data.schema.json:4-15`、`apps/agent/src/pal_hatch_helper/breeding/pipeline.py:23-79`、`apps/agent/src/pal_hatch_helper/breeding/supply_chain.py:34-40`、`apps/agent/src/pal_hatch_helper/breeding/supply_chain.py:63-70`、`apps/agent/tests/breeding/test_import.py:102-133`、`docs/operations/breeding-data.md:28`
- 触发条件：将一个来源版本的配方文件与另一个游戏 build/version 的基础目录合并；只要涉及的 Pal ID 仍存在，当前校验就会通过。
- 实际影响：来源契约没有目标 `game_build_id`、目标 `game_version` 或 `base_content_hash`；校验只验证 ID 是否存在。构建候选时保留基础目录的 `game_build_id`，却把 `game_version` 改成配种来源的 `source_version`，并把统一 manifest 的 `package_hash` 改成来源 JSON 的哈希。实测基础目录 `fixture-version` 与来源 `fixture-merge-v1` 不一致时仍得到 `accepted=True`，候选被标成 `game_build_id=fixture-build/game_version=fixture-merge-v1`。此外 staging 的来源 type/name/filename/fetched_at 不进入不可变候选，后续 `--source-id` 由人工另行传入，可产生错误来源归因。
- 违反原因：正式规格把 `game_data_version` 定义为同时固定七类静态游戏事实的权威边界，`game_build_id/game_version/package_hash` 必须具有统一且可审计的语义。当前实现既不能阻止错误 build 的配方污染合法目录，也让历史版本的来源和游戏版本不可准确解释。
- 最小修复建议：在共享来源契约中加入目标基础目录的精确 `content_hash` 与游戏 build/version，并在转换前强制与 base manifest 一致；保留 base 的游戏版本/包哈希，把配种来源 release、raw hash、type/name/filename 和来源 ID 放入独立且受 Schema 约束的 provenance 字段/表；stage 时验证 provenance 与 `source_id` 一致。
- 应新增的回归测试：不同 base content hash、game build 或 game version 必须返回稳定的兼容性错误且不创建 normalized 版本；相同 base 的合法合并必须保留原游戏 manifest 字段并完整保存来源 provenance；错误 `source_id` 绑定必须在数据库导入前失败。

### 4. 管理员差异审查只比较配种表，却会发布整个统一游戏数据版本

- 文件与位置：`supabase/migrations/20260714040000_phase4a_breeding_data_diff.sql:29-39`、`supabase/migrations/20260714040000_phase4a_breeding_data_diff.sql:41-111`、`apps/agent/src/pal_hatch_helper/breeding/supply_chain.py:55-62`、`docs/operations/breeding-data.md:50-68`
- 触发条件：候选版本使用了与旧版本不同或被替换的基础目录；管理员运行 `catalog diff` 后依据该报告发布候选。
- 实际影响：RPC 只验证两个版本为 validated/published，然后只查询 `catalog_breeding_recipes`。帕鲁、被动、主动技能、帕鲁技能、伙伴技能和本地化的任何变化都不会出现在报告中，也不会导致 diff 拒绝；但 publish 切换的是整个 `active_game_data_version_id`。管理员可能在“只看到配方变化”的情况下同时发布六类未经审核的静态事实。
- 违反原因：正式规格规定统一版本同时固定七类事实，人工发布必须以完整、可审计的候选为边界。当前差异报告无法证明候选只改变了配种事实，破坏了 staging → 审核 → 发布的安全门。
- 最小修复建议：若 Phase 4A 只允许替换配方，则在 diff/publish 前比较 manifest 中除 `breeding-recipes.jsonl` 外六个文件的 SHA-256 与记录数，任何差异返回稳定的 `BREEDING_BASE_CATALOG_MISMATCH`；若允许基础目录同时变化，则必须提供完整七类 diff，而不能把该 RPC描述为足够的发布审查。
- 应新增的回归测试：构造配方相同但任一非配种投影/文件校验和不同的两个 validated 版本，断言配种专用 diff 或发布前检查稳定拒绝；相同 base 仅配方变化时才返回可审核报告，并验证活动指针未被 diff 改写。

## MEDIUM

### 1. HTTPS URL 校验可被解析到回环、内网或链路本地地址的域名绕过

- 文件与位置：`apps/agent/src/pal_hatch_helper/breeding/data_sources.py:238-263`、`apps/agent/src/pal_hatch_helper/breeding/data_sources.py:311-321`、`apps/agent/tests/breeding/test_data_sources.py:104-152`
- 触发条件：远程来源被启用，来源 URL 使用 `https://localhost/...`、解析到私网地址的普通域名、DNS rebinding 域名或其他非公网解析结果。
- 实际影响：代码只对 hostname 本身是 IP 字面量时调用 `ipaddress.ip_address`；域名不做 DNS 解析或目标地址校验。无网络探针已确认 `_validated_https_url("https://localhost/recipes.json")` 被接受。接入真实入口后，Agent 可被用来访问宿主机或内网 HTTPS 服务，读取响应并写入本地 staging。
- 违反原因：Agent 持有 service-role 配置并运行在服务器私网，通用 URL Adapter 必须有 SSRF 边界；“只允许 HTTPS”和“不跟随重定向”不足以保证目标是公网。
- 最小修复建议：优先采用管理员 allowlist；通用 URL 必须通过可测试的解析器检查全部 A/AAAA 地址均为 global，并在连接时固定已验证目标、防止解析后重绑定，同时保留 TLS hostname 校验。GitHub Adapter 固定官方 host，不接受可变 host。
- 应新增的回归测试：`localhost`、私网/链路本地 IPv4/IPv6、映射 IPv6、解析到私网的域名、多地址中混入私网和 DNS 重绑定均必须在发请求前返回 `BREEDING_SOURCE_INVALID`；公网 allowlist 域名仍可通过 fake transport。

### 2. 配置的来源超时不是整次下载的总时限，持续滴流可以无限占用进程

- 文件与位置：`apps/agent/src/pal_hatch_helper/breeding/data_sources.py:238-303`、`docs/operations/breeding-data.md:10`、`apps/agent/tests/breeding/test_data_sources.py:75-152`
- 触发条件：远端在每次 read timeout 到期前发送少量数据，但整体下载持续远超 `BREEDING_SOURCE_TIMEOUT_SECONDS`。
- 实际影响：当前只把一个 float 传给 HTTPX 的 connect/read/write/pool 操作超时，没有包住整个 `_fetch_https/_read_response` 的 wall-clock deadline；恶意或异常来源可长期占住手工命令或未来 Worker。现有测试没有慢速流场景，因此 `pnpm check` 仍会通过。
- 违反原因：文档把该值描述为来源“超时”，安全设计需要有上限的资源占用；逐次 I/O inactivity timeout 不能实现整次操作时限。
- 最小修复建议：在完整 fetch/stream 外增加总 deadline（例如受控 `asyncio.timeout`），并把 connect/read 分项超时设为不大于剩余预算；超时返回稳定、可判定重试性的错误码。
- 应新增的回归测试：fake stream 每次在 read timeout 前输出一个字节但总时长超过预算，断言整次操作在总 deadline 内终止、临时目录被清理且没有完整 staging 产物。

### 3. metadata-only 变化只返回布尔值，人工审核看不到变化内容

- 文件与位置：`packages/contracts/schema/breeding-data.schema.json:167-185`、`apps/agent/src/pal_hatch_helper/breeding/diff.py:31-45`、`supabase/migrations/20260714040000_phase4a_breeding_data_diff.sql:85-104`
- 触发条件：父母、配方类型和子代均不变，仅配方 `metadata` 改变。
- 实际影响：报告只给出 `metadata_changed=true`，不包含 before/after metadata；管理员无法判断来源证据、标记或未来可能参与算法解释/筛选的字段究竟发生了什么变化，却仍可继续发布。
- 违反原因：当前 Phase 把人工差异审核作为错误数据进入 published 的最后防线，审核报告必须包含足够的真实变更内容，不能只给不可核验的布尔摘要。
- 最小修复建议：在共享契约、Python diff 和 SQL RPC 中加入受大小限制的 `before_metadata/after_metadata` 或确定性 JSON Patch；若 metadata 明确不参与任何事实或行为，也应在 Schema 中限制允许字段而不是完全开放。
- 应新增的回归测试：metadata-only 变化应稳定归类为 changed，并返回规范排序的旧值和新值；TS、Pydantic、SQL 三端对同一 fixture 的报告应一致。

## LOW

### 1. 所有 HTTP 4xx 都被标记为可重试

- 文件与位置：`apps/agent/src/pal_hatch_helper/breeding/data_sources.py:264-271`
- 触发条件：远端返回 400、401、403、404 等永久性配置/权限错误。
- 实际影响：这些错误统一成为 `BREEDING_SOURCE_FETCH_FAILED/retryable=True`；接入重试循环后会反复请求不会自行恢复的来源，增加噪声和外部负载，也掩盖需要人工修正的配置。
- 违反原因：工程约定要求稳定错误码，Phase 2 恢复策略要求只对暂时故障退避重试；永久错误不能被错误分类为暂时故障。
- 最小修复建议：按状态分类：408、429 和可恢复 5xx 为 retryable；普通 4xx 为 non-retryable，并保留不泄露响应正文的稳定错误码。
- 应新增的回归测试：404/401 返回不可重试，429/503 返回可重试，所有场景均不把响应正文、凭证或 URL 查询秘密写入错误摘要/日志。

## 已验证的安全边界

- 已完整读取 `AGENTS.md`、正式规格和总实施计划；仓库没有单独的 Phase 4A 实施计划。
- 已执行用户指定的 `git status --short --branch`、`git diff --check`、`git diff --stat` 和 `git diff`；未跟踪文件另行逐个读取。最终 `git diff --check` 无输出。
- 使用仓库要求的 Node `v22.23.1` 实际执行 `pnpm check`：Prettier、ESLint、TypeScript、Vitest、Next.js build、Ruff、mypy、pytest、结构检查和秘密扫描全部通过；Agent 为 `110 passed, 1 skipped`。
- 本地 Supabase `pal-hatch-helper-local` 已执行空库 `supabase db reset` 和 `supabase db lint`；全量 pgTAP `164/164` 通过。定向 Phase 4A pgTAP `12/12` 通过。
- 使用本地回环数据库重新生成 `database.types.ts`，生成结果与当前工作区预期一致；JSON Schema、TypeScript 和 Pydantic 生成漂移检查通过。
- 新增 fixture 均明确标为虚构数据；未发现真实存档、生产数据库内容、真实密钥、邮箱、服务器 IP 或凭证提交。`.env.example` 仅增加安全默认值，远程来源默认关闭。
- 未新增生产依赖或 lockfile 变更；`httpx` 为既有固定依赖。
- 未修改 Compose、端口、Palworld/mihomo 配置或 `/opt/palworld`；未访问生产密钥、生产数据库、真实存档和真实服务器凭证。
- 新 diff RPC 为只读 `stable` 函数，普通玩家权限测试通过，执行 diff 不改变世界活动版本或已有任务固定版本。
- 数据库 `begin_game_data_import` 仍在数据库侧拒绝 disabled 来源，不是只依赖前端/Agent 开关。
- 没有 AI 生成配种事实、自动发布、自动修改存档、公开 Agent 端口或提前实现 Phase 5 前端功能。

## 验证过程说明

- 第一次把 `supabase db reset && supabase db lint && supabase test db ...` 串联执行时，reset 和 lint 已成功，但 Supabase CLI 在 PostHog 关闭阶段超时并以 1 退出，没有形成可采信的 pgTAP 结果；随后设置 `SUPABASE_TELEMETRY_DISABLED=1` 分别重跑，定向与全量 pgTAP 均真实通过。报告不把第一次失败调用描述为测试通过。
- 首次数据库类型生成因未提供 `DATABASE_URL` 按设计失败；随后显式使用本地回环数据库 URL 重跑并通过，未连接 linked/生产项目。
- 无网络探针确认 `https://localhost/...` 会通过当前 URL 校验；临时目录探针确认基础目录 `fixture-version` 与来源 `fixture-merge-v1` 会生成 `accepted=True` 的候选，并把候选 `game_version` 改为来源版本。

## 仍未验证的风险

- 未访问真实 GitHub/URL 来源，未验证任何真实配种数据的许可、真实性、完整性或对应游戏 build。
- 未运行生产部署、远程推送、真实 Storage 上传、真实管理员发布/回滚或服务器网络连通性测试。
- 未构建 Agent Docker 镜像；本次没有依赖、Dockerfile 或 Compose 变更，根级 Python/Node 构建和测试已覆盖代码，但容器内 DNS/CA/网络行为仍未验证。
- Agent 集成测试仍有 1 项按标记跳过；数据库生命周期由独立本地 reset/lint/pgTAP 覆盖，但未运行两个真实 Worker 的并发导入。
- 未验证大规模真实配方集下 JSON 内存放大、diff JSONB 聚合大小、磁盘耗尽和 staging 保留清理。
- 当前没有可运行的来源闭环，因此 remote enable、超时和 SSRF 风险尚未从生产入口触发；这不等于这些边界已经安全。

## 建议人工检查项

- 先决定并评审 Phase 4 是否正式拆成 4A/4B；在总计划中记录验收、回滚和阶段门禁，不用运行文档代替实施计划。
- 对任何真实来源人工确认许可、固定 commit/release、目标游戏 build/version、完整性基线和特殊配方语义；不要使用可漂移 branch 作为唯一版本标识。
- 修复统一版本兼容性和完整 diff 后，人工核对 candidate 的七个逐文件 checksum、来源 provenance、世界目标和 publish/rollback 审计身份。
- 在目标网络环境中验证 DNS、IPv4/IPv6、代理继承、CA、总超时和 allowlist；仍不得设置系统或 Docker daemon 全局代理。
- Phase 4 算法实现完成后，人工复核至少三条路线、少于三条原因码、评分版本、共享排除和历史精确版本复现。

## Phase 结论

原审查的 4 个 HIGH 已关闭，来源入口、精确基础版本、来源 provenance 和统一目录发布门禁均有可执行实现与回归测试。Phase 4 不再以 4A/4B 分拆作为验收依据；当前进度统一记录为“代码与高风险门禁完成，待人工真实数据验收”。

在真实来源许可、固定版本及对应游戏 build 由人工确认前，仍不能进入下一 Phase。
