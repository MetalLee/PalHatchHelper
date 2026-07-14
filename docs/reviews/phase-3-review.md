# Phase 3 未提交改动审查

- 审查日期：2026-07-14
- 审查范围：`feat/phase-3-save-parser` 当前工作区未提交改动
- 当前结论：未发现 BLOCKER；4 个 HIGH 已全部修复，尚有 5 个 MEDIUM 和 3 个 LOW 待跟踪，可以进入下一 Phase
- 记录说明：HIGH 条目保留修复前的触发条件、影响和证据，并在每项开头标明当前修复状态
- 判定依据：使用同日已经实际运行并记录的修复后验证结果；本次状态更新按要求没有重复运行测试

## BLOCKER

无。

## HIGH（4 项已修复）

### 1. owner 暂时无法解析会清除玩家的“禁止共享”选择

- 修复状态：已修复。owner unresolved 时保留原 owner、`share_enabled` 与 `updated_by`；只有确认非空 owner 确实变化时才恢复默认共享。
- 修复位置：`supabase/migrations/20260714030000_phase3_inventory_sync.sql:270`、`supabase/tests/inventory_sync.sql:158`

- 修复前文件与位置：`supabase/migrations/20260714030000_phase3_inventory_sync.sql:229`
- 触发条件：某实例原先 `share_enabled=false`，新快照因解析异常得到 `owner_player_id=null`。
- 实际影响：SQL 将其视为所有者变化，重置为 `true` 并清空 `updated_by`；下次原所有者重新解析成功后，该帕鲁会重新进入公会共享池。
- 违反原因：规格要求同一所有者保留设置，只有确认所有者真正变化才重置；这是隐私与权限语义回退。
- 最小修复：当新 owner unresolved 时保留现有 `owner_player_id_at_set`、`share_enabled`、`updated_by`；只在新 owner 非空且确实不同的情况下重置。
- 回归测试：依次发布“明确关闭共享 → owner unresolved → 原 owner 恢复”，断言始终关闭；再发布不同的已解析 owner，断言才重置为 true。
- 实测证据：本地数据库已复现 `false + 原 owner` 被改成 `true + null owner`。

### 2. 历史哈希再次出现时，RPC 返回的快照与数据库 latest 不一致

- 修复状态：已修复。历史成功哈希再次出现时原子回切 `latest_snapshot_id`，RPC 返回值与数据库 latest 指向同一不可变快照。
- 修复位置：`supabase/migrations/20260714030000_phase3_inventory_sync.sql:106`、`supabase/tests/inventory_sync.sql:323`

- 修复前文件与位置：`supabase/migrations/20260714030000_phase3_inventory_sync.sql:78`
- 触发条件：快照序列为 A→B→A；A 已是历史 published 快照，但不是当前 latest。
- 实际影响：RPC 返回历史 A 的 ID，却在第 85–87 行提前退出，不更新 `worlds.latest_snapshot_id`；Worker 报告已发布 A，查询仍使用 B。
- 违反原因：发布结果、返回 ID 和 latest 指针必须保持原子一致，真实库存不能与控制面状态分叉。
- 最小修复：只把“哈希等于当前 latest”视为幂等跳过；历史哈希重现时应原子切回已有快照，或记录新的同步观测并切换指针。
- 回归测试：A→B→A 后断言 RPC 返回 ID、`latest_snapshot_id` 和 latest 哈希都指向 A。
- 实测证据：RPC 返回 `...0001`，latest 仍为 `...0002`/B。

### 3. 乱序或并发 Worker 可把旧存档发布为 latest

- 修复状态：已修复。新增 world 级 `inventory_source_modified_at` 时间水位；旧观测返回稳定错误码 `INVENTORY_SNAPSHOT_STALE`，玩家和公会 `last_seen_at` 使用单调更新。
- 修复位置：`supabase/migrations/20260714030000_phase3_inventory_sync.sql:1`、`supabase/migrations/20260714030000_phase3_inventory_sync.sql:68`、`supabase/tests/inventory_sync.sql:428`

- 修复前文件与位置：`supabase/migrations/20260714030000_phase3_inventory_sync.sql:53`、`supabase/migrations/20260714030000_phase3_inventory_sync.sql:264`
- 触发条件：较新的快照先完成发布，较旧快照随后取得 world 锁；或直接提交比 latest 更早的 `source_modified_at`。
- 实际影响：旧库存成为 latest，公会、玩家 `last_seen_at` 也可倒退，并可能再次触发共享偏好重置。
- 违反原因：`FOR UPDATE` 只串行化事务，没有保证时间顺序；Phase 3 要求原子发布且不能产生状态回退。
- 最小修复：持有 world 锁后比较当前 latest 的 `source_modified_at`；旧值返回稳定的待审核或过期错误码。公会和玩家时间至少使用 `greatest(existing, excluded)`。
- 回归测试：两个发布任务按“新快照先提交、旧快照后提交”执行，断言 latest 始终为新快照。
- 实测证据：当前 RPC 接受了 `07:00Z` 快照并覆盖原 `09:00Z` latest。

### 4. 没有真实或脱敏存档解析闭环，核心验收只由 FakeParser 模拟

- 修复状态：当前 Phase 验收缺口已修复。全合成脱敏兼容 fixture 由独立受限子进程实际读取，经过 CanonicalSnapshot 校验并进入 Repository 序列化 payload；测试覆盖玩家、公会、帕鲁、性别、被动、位置以及源字节和权限不变。fixture 不冒充 Palworld 二进制格式，生产 Parser 兼容性仍是部署前人工检查项。
- 修复位置：`apps/agent/tests/save_sync/test_redacted_fixture_pipeline.py:50`、`apps/agent/tests/parsers/redacted_fixture_command.py:1`、`data/parser-fixtures/minimal-save/README.md:1`

- 修复前文件与位置：`apps/agent/tests/save_sync/test_publish_guard.py:105`、`apps/agent/tests/parsers/test_adapter_contract.py:26`、`data/parser-fixtures/minimal-save/World.sav:1`
- 触发条件：将实际支持格式的 `.sav` 交给当前实现。
- 实际影响：仓库只有通用子进程包装器；FakeParser 忽略输入字节直接返回预制 JSON，所谓 `.sav` fixture 也是两行文本。尚未证明能从存档得到玩家、公会和帕鲁数据。
- 违反原因：Phase 3 测试明确要求“脱敏样例解析测试”，核心目标是由 ParserAdapter 生成 CanonicalSnapshot。
- 最小修复：加入明确支持的具体 Parser Adapter 或转换器及合法来源说明；使用真正经过脱敏的兼容 fixture 做端到端解析。若需重量级依赖，先获批准。
- 回归测试：真实 fixture → 子进程 Parser → CanonicalSnapshot → Repository payload，断言玩家、公会、帕鲁、性别、被动和位置，并验证源字节与权限不变。

## MEDIUM（5 项未修复，非 Phase 4 阻断项）

### 1. Parser 资源限制可通过派生进程绕过

- 文件与位置：`apps/agent/src/pal_hatch_helper/parsers/subprocess.py:59`、`apps/agent/src/pal_hatch_helper/parsers/subprocess.py:203`
- 触发条件：Parser 调用 `fork/clone/clone3`，或在输出目录创建大量文件。
- 实际影响：`RLIMIT_AS`、CPU 和文件大小都是单进程或单文件限制；子进程可累积占用内存、CPU、PID 和磁盘，影响游戏服务器。
- 违反原因：规格要求 Parser 约 1 核、1.5 GB 且受控运行。
- 最小修复：禁止不需要的进程创建 syscall，或用 cgroup/container 总量限制；输出目录使用有容量上限的 tmpfs 或配额。
- 回归测试：尝试派生进程及生成多个大文件，断言稳定失败且总资源不超限。

### 2. 解析失败没有写入 Supabase 失败记录

- 文件与位置：`apps/agent/src/pal_hatch_helper/save_sync/service.py:77`、`apps/agent/src/pal_hatch_helper/save_sync/registry.py:55`、`docs/architecture/database-and-rls.md:34`
- 触发条件：Parser 崩溃、非法 JSON、Schema 错误或库存骤降。
- 实际影响：失败仅保存在本机 `.state`；`inventory_snapshots.failed/rejected`、`error_code` 始终不会由此流程产生，Supabase 控制面无法展示解析异常。
- 违反原因：架构文档明确规定失败记录单独插入，且后续数据状态页依赖这些状态。
- 最小修复：增加只写失败元数据的 service-role RPC；不能更新 latest，也不能上传原始存档或路径。
- 回归测试：Parser 失败后断言数据库存在稳定错误码的 failed/rejected 行，latest 仍保持上一成功快照。

### 3. Phase 2 API readiness 与 Compose 运行边界发生回退

- 文件与位置：`apps/agent/src/pal_hatch_helper/settings.py:75`、`infra/agent/docker-compose.yml:12`、`infra/agent/.env.example:17`
- 触发条件：现有生产 API 进程只配置数据库；或通过当前 Compose 启动 Save Worker。
- 实际影响：API `/readyz` 从 200 退化为 503；Compose 不传递新增变量，也没有只读源挂载和可写数据目录，`.env.example` 中的配置实际不会进入容器。
- 违反原因：新增 Save Worker 不应破坏已有 API/Job Worker 边界；当前容器配置也无法运行 Phase 3。
- 最小修复：采用命令级 readiness；为 Save Worker 建独立无端口 service，显式传递配置、只读挂载源、可写挂载 Agent 数据并设置总资源限制。
- 回归测试：Compose API 在 DB-only 配置下保持原有 readiness；独立 Save Worker 缺路径时安全拒绝、配置正确时可完成 fixture 同步。

### 4. 库存发布 RPC 不在生成数据库类型中，完整 payload 也没有共享契约

- 文件与位置：`packages/contracts/scripts/generate-database-types.mjs:85`、`apps/agent/src/pal_hatch_helper/repositories/inventory.py:103`
- 触发条件：TS 消费者使用新 RPC，或 Python `_publish_payload` 与 SQL JSON key 漂移。
- 实际影响：类型生成仍会“通过”，但 `publish_inventory_snapshot`、latest/catalog RPC 不会进入 `database.types.ts`；派生字段由 Python 和 SQL 手工同步。
- 违反原因：业务字段应来自共享 Schema/OpenAPI，不能依赖两端手工 DTO。
- 最小修复：为完整发布请求建立共享 Schema/Pydantic 模型，并把三条 RPC 纳入数据库类型生成。
- 回归测试：本地重建后生成类型，断言三条 RPC 签名存在；契约 fixture 同时通过 JSON Schema、Pydantic 和数据库 RPC。

### 5. “源文件只读打开”测试没有观察到叶子文件的 open flags

- 文件与位置：`apps/agent/tests/save_sync/test_snapshot_copy.py:201`
- 触发条件：最终 `World.sav` 或玩家文件的 `os.open(..., dir_fd=...)` 被误改为 `O_RDWR`。
- 实际影响：第 212 行只记录绝对根路径；叶子文件以相对名称加 `dir_fd` 打开，不会进入 `observed_flags`，测试仍可能通过。
- 违反原因：核心安全失败路径不能由无效断言制造绿灯。
- 最小修复：跟踪 `dir_fd` 对应目录，或直接封装并断言叶子文件的实际 flags。
- 回归测试：注入一个会把最终文件改为 `O_RDWR` 的错误实现，确认测试必然失败。

## LOW（3 项未修复，继续跟踪）

### 1. 新增 SECURITY DEFINER 函数缺少内部 service-role JWT 校验

- 文件与位置：`supabase/migrations/20260714030000_phase3_inventory_sync.sql:1`、`supabase/migrations/20260714031000_phase3_inventory_catalog_lookup.sql:1`
- 触发条件：未来误授 EXECUTE、角色继承配置变化或内部函数被间接调用。
- 实际影响：只剩 ACL 一层防护。
- 违反原因：`docs/architecture/database-and-rls.md:73` 要求 service-role RPC 同时检查 JWT role。
- 最小修复：函数开头调用 `private.is_service_role()`，失败返回稳定错误码。
- 回归测试：anon/authenticated 无权；无 service-role JWT 的直接调用也失败。当前 ACL 实测正确，未发现现成浏览器绕过。

### 2. 公会 UID 冲突错误地使用玩家冲突错误码

- 文件与位置：`apps/agent/src/pal_hatch_helper/normalization/validator.py:51`
- 触发条件：同一 guild UID 对应不同名称记录。
- 实际影响：返回 `CANONICAL_PLAYER_UID_CONFLICT`，监控和处置无法准确分类。
- 违反原因：错误判断依赖稳定且语义准确的错误码。
- 最小修复：新增 `CANONICAL_GUILD_UID_CONFLICT`。
- 回归测试：冲突 guild 与冲突 player 分别断言不同错误码。

### 3. README 与真实代码状态不一致

- 文件与位置：`README.md:3`、`apps/agent/README.md:15`
- 触发条件：开发者按 README 判断当前能力或启动 Save Worker。
- 实际影响：文档仍称 Phase 2.5、Save Worker 未实现、不读取存档。
- 违反原因：正式运行文档必须与真实代码一致。
- 最小修复：更新当前 Phase、命令、配置与安全边界描述。
- 回归测试：结构或文档检查禁止重新出现“Save Worker 未实现”等过期声明。

## 已实际验证

- Node 22.23.1 下 `pnpm check` 通过：格式、lint、类型检查、测试、Web build、结构检查、秘密扫描全部执行；Agent `95 passed, 1 skipped`。
- 单独运行本地 Supabase 集成测试：`1 passed`。
- `supabase db reset`、`supabase db lint`、`supabase test db` 通过：142 项数据库测试。
- 本地数据库类型已重新生成，并包含新增的库存时间水位字段。
- Agent 镜像构建成功；非 root 用户；容器内 libseccomp、Landlock ABI 7 和 Parser 沙箱 smoke test 通过。
- Compose 配置仍只将 `18765` 绑定到 `127.0.0.1`。
- `git diff --check`、秘密扫描通过；未发现真实密钥、生产数据或重量级依赖变更。
- 未访问或修改 `/opt/palworld`、真实存档、生产数据库或生产容器。

## 仍未验证与建议人工检查

- 全合成脱敏兼容 fixture 的端到端证据已具备；尚未验证目标第三方 Parser 对真实 Palworld 二进制存档的兼容性。
- 未验证两个真实 Save Worker 并发运行及异常退出恢复。
- 未在目标服务器内核、文件系统和资源限制下演练 reflink、Landlock、磁盘不足及保留策略。
- 进入部署阶段前应人工确认 Parser 来源、许可、版本、真实 Compose 映射和只读挂载；本次不应接触生产环境。

## Phase 结论

四个 HIGH 已有最小修复及修复后验证证据，Phase 3 的只读 fixture、合法快照原子发布以及未确认路径时拒绝运行三项验收标准均无剩余阻断问题。Phase 4 以本地、确定性的配种数据和算法工作为主，不要求生产部署或真实宿主机存档，因此现存 MEDIUM/LOW 可以作为已知技术债继续跟踪：

- MEDIUM 1 和 MEDIUM 3 最迟在 Phase 8 生产部署前解决，确保 Parser 总资源和独立 Save Worker Compose 边界成立。
- MEDIUM 2 最迟在 Phase 5 数据状态功能前解决，否则前端无法展示数据库中的解析失败记录。
- MEDIUM 4 在任何 TypeScript 消费库存发布 RPC 之前解决；Phase 4 新增业务字段仍必须从共享 Schema 生成。
- MEDIUM 5 应优先补强，避免后续改动削弱只读打开测试而不被发现。
- LOW 项继续纳入后续安全、错误码和文档收口，不得在 Phase 8 部署验收时遗留。

进入下一 Phase 不代表批准部署、接触真实存档、配置生产 Parser 或推送远程仓库。

可以进入下一 Phase。
