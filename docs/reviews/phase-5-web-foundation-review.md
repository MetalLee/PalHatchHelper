# Phase 5 Web 基础未提交改动审查

- 审查日期：2026-07-15
- 审查范围：分支 `agent/phase-5-web-foundation` 的全部未提交改动，包括普通 `git diff` 不显示的未跟踪文件
- 当前工作区声明的阶段：Phase 5 `implementation=completed`、`automated_gates=passed`
- MEDIUM 整改复核：2026-07-15，6/6 已修复并通过自动化验证
- HIGH/LOW 整改复核：2026-07-15，2/2 HIGH、1/1 LOW 已修复并通过自动化验证
- 当前结论：0 个 BLOCKER、0 个未解决 HIGH/MEDIUM/LOW；Phase 5 实现与自动化门禁通过

## BLOCKER

未发现 BLOCKER。

## HIGH

### 1. Phase 5 的启动门禁由同一实现 diff 自行改写，与已归档 Phase 4 结论冲突（已修复）

- 整改结果：项目负责人明确批准“Phase 5 可只依赖 Phase 1/3，可以闭环”，并新增独立 ADR 0005，记录非生产边界、Phase 4 人工验收继续阻塞 Phase 6/真实数据生产发布以及禁止扩大授权的条件。规格、计划、项目状态和 README 已统一为 Phase 5 `implementation=completed`、`automated_gates=passed`。
- 验证证据：`scripts/check-structure.mjs` 要求 ADR 存在且含批准状态、Phase 1/3 依赖、Phase 6 和生产发布边界，并逐份检查规格、计划与项目状态的 Phase 5 完成字段；`pnpm check:structure` 通过。

- 文件路径和代码位置：`docs/superpowers/specs/2026-07-13-palworld-breeding-system-design.md:3`；`docs/superpowers/plans/2026-07-13-palworld-breeding-system-implementation.md:4, 377-380, 449-455, 522-527`；冲突基线见 `docs/reviews/phase-4a-review.md:140-144` 和 `docs/reviews/phase-4b-review.md:190-194`。
- 触发条件：合并当前 diff，并据此把 Phase 5 视为已经获准开始，同时仍未完成人工真实来源许可、固定 source commit/release、Steam build ID、游戏版本和配方真实性验收。
- 实际影响：当前实现通过修改规格/计划的状态文字，把原来“不能进入下一 Phase”的人工门禁改为“只阻塞 Phase 6”；仓库内没有独立的评审或批准记录解释这一交付顺序变更。后续无法从审计记录判断 Phase 5 是获准并行，还是绕过了 Phase 4 门禁。
- 为什么违反规格或工程原则：实施计划明确用于约束交付顺序，跨阶段规则要求规格变更先更新并评审；用户也要求检查是否提前实现后续 Phase。不能在功能实现的同一个未提交变更中，仅靠状态字段为自身解除前一阶段门禁。
- 最小修复建议：在 Phase 5 代码之外先形成并批准一份明确的规格/计划变更记录，说明 Phase 5 可只依赖 Phase 1/3 的原因、允许的非生产边界以及 Phase 4 仍阻塞 Phase 6/生产发布；否则恢复 Phase 5 为未开始并等待 Phase 4 人工验收。
- 应新增的回归测试：增加阶段状态一致性检查，要求某 Phase 标记 `in_progress` 前，存在明确批准该转换或并行例外的评审记录；若上一阶段审查结论仍是“不能进入下一 Phase”，结构检查应失败。

### 2. 帕鲁和被动显示名/搜索来自两条硬编码 fixture，而不是版本化游戏目录（已修复）

- 整改结果：删除 Web 生产路径的 `features/pals/catalog.ts`。`list_available_pals_page` 现在从登录用户绑定世界推导活动 published `game_data_version_id`，在同一 RPC 内连接 `catalog_pals`、`catalog_passive_skills` 和 `catalog_localizations(zh-CN)`，返回图鉴编号、帕鲁/被动显示名、目录解析状态和固定版本 ID；名称、编号、稳定 ID 与多结果部分文本搜索共享同一版本。分页游标同时固定快照和目录版本，版本切换返回 `GAME_DATA_VERSION_CHANGED`。目录未配置和未知 Pal/被动 ID 均显式展示，不伪造事实。
- 验证证据：`supabase/tests/phase5_web.sql` 使用三个目录 Pal、两个共享“棉”前缀的中文名、图鉴编号、未知 Pal/被动和第二目录版本，36/36 通过；共享 JSON Schema、生成类型、Web 单测和 iPhone Chromium Playwright 共同验证显示、前缀/编号搜索、未知状态和浏览器接线，Phase 5 E2E 为 5/5。

- 文件路径和代码位置：`apps/web/features/pals/catalog.ts:1-27`；调用点 `apps/web/features/pals/server.ts:14-18, 48-55, 70-76`；筛选文案 `apps/web/features/pals/pal-filters.tsx:52-59`；只覆盖 fixture 的测试 `apps/web/tests/pals.test.tsx:7-46`、`apps/web/e2e/phase5.spec.ts:37-39`。
- 触发条件：库存包含 `test_parent_a`、`test_child_pal` 以外的任何真实 Pal/被动；按中文名、图鉴编号或可匹配多个 Pal 的部分文本搜索。
- 实际影响：绝大多数真实记录只能显示内部 ID，被动也显示内部 ID；图鉴编号完全没有进入契约；中文名搜索无法工作。`catalogQueryToStableId()` 还会把多结果部分查询压成第一个硬编码 ID，例如宽泛查询不会返回全部匹配项。Phase 5 在合成 fixture 上通过，但不能用于规格所称的真实库存列表。
- 为什么违反规格或工程原则：正式规格要求名称或编号筛选，并要求静态事实来自固定、发布且可复现的游戏数据版本；仓库已经有受权限保护的 `search_catalog_pals`、`search_catalog_passive_skills` 和目录本地化投影。前端 fixture 不能成为新的事实来源。
- 最小修复建议：让浏览器安全 RPC 在同一活动 `game_data_version_id` 上连接目录/本地化，或通过既有目录 RPC 批量解析当前页的 Pal 和被动；把图鉴编号、显示名和必要的版本 ID 加入共享 Schema，删除生产路径中的硬编码映射。目录未配置时应显示稳定状态，而不是静默回退到伪名称。
- 应新增的回归测试：用至少三个目录记录、两个共享同一查询前缀的 Pal、中文本地化、图鉴编号和一个未知 ID，验证名称/编号/部分文本搜索、显示名和被动名全部来自固定目录版本；断言更换目录版本不会读取硬编码结果。

## MEDIUM

### 1. 分页游标没有固定快照，翻页可跨库存版本并产生缺口或重复（已修复）

- 整改结果：游标改为包含 `snapshot_id + pal_id + pal_instance_uid` 的 Base64URL 不透明值；后续页把快照传入 RPC，若 world 的 latest 指针已变化则返回结构化 `INVENTORY_SNAPSHOT_CHANGED`，不会跨版本继续。
- 验证证据：`supabase/tests/phase5_web.sql` 在第一页与第二页之间发布新快照，断言第二页稳定拒绝；Web 单元测试验证游标可逆且 URL 不暴露旧分隔格式。

- 文件路径和代码位置：`supabase/migrations/20260715020000_phase5_web_foundation.sql:12-14, 72-76, 108-109, 141-166`；`apps/web/features/pals/server.ts:69-80, 84-93`；`packages/contracts/schema/phase5-web.schema.json:86-98`。
- 触发条件：用户读取第一页后、读取下一页前，Save Worker 发布新的 `world.latest_snapshot_id`。
- 实际影响：第一页来自旧快照，下一页会用旧的 `(pal_id, pal_instance_uid)` 游标查询新快照。实际本地事务探针得到第一页快照 `...0002`、第二页快照 `...0088`，证明一次分页会话混用了两个版本；实例新增、消失、改名或转移所有者时会跳项、重复或呈现互相矛盾的共享状态。
- 为什么违反规格或工程原则：Phase 5 计划要求稳定 keyset 分页，系统又以不可变快照作为库存一致性边界；只稳定排序键而不固定快照不能保证状态一致。
- 最小修复建议：在不透明游标中包含 `snapshot_id` 和排序键，后续页固定读取该授权快照；若产品只允许最新快照，则在指针变化时返回稳定的 `INVENTORY_SNAPSHOT_CHANGED` 并要求从第一页重试。
- 应新增的回归测试：先取第一页，在两次 RPC 之间发布增删/转移实例的新快照，再取第二页；断言所有页使用同一 `snapshot_id`，或者以稳定错误码拒绝继续，且没有重复或遗漏。

### 2. 浏览器共享库存响应超过规格所述的最小必要字段（已修复）

- 整改结果：从逐行 DTO 删除 `owner_player_id`、`guild_id` 和 `snapshot_id`；页面级仅保留分页一致性所需的 `snapshot_id`，所有者筛选改用 world + owner UUID 生成的 SHA-256 不透明 facet，自有共享修改仍只使用实例 UID。
- 验证证据：共享 Schema、pgTAP 和 Playwright 网络响应均断言逐行对象不含三个内部字段，私有/跨公会/raw/path 数据仍不可见。

- 文件路径和代码位置：`supabase/migrations/20260715020000_phase5_web_foundation.sql:16-31, 148-166`；`packages/contracts/schema/phase5-web.schema.json:27-84`；`apps/web/features/pals/server.ts:43-60`。
- 触发条件：普通玩家请求 `all` 或 `shared` 范围，或读取 `/pals` 的 RSC/HTML/`/api/pals` 响应。
- 实际影响：其他玩家共享 Pal 的内部 `owner_player_id`、`guild_id` 和每行 `snapshot_id` 被发送到浏览器；其中 `guild_id`、每行 `snapshot_id` 并未用于卡片渲染，内部 owner UUID 只被当前页筛选器当作 option value。它们不是原始存档或密钥，但扩大了可关联的内部标识面。
- 为什么违反规格或工程原则：普通玩家对公会共享库存只应得到完成配种所需的最小必要信息；正式规格列出的借用信息是名称、性别、被动、所有者显示名和位置。安全投影应按使用目的裁剪，而不是因为数据库已有 UUID 就全部下发。
- 最小修复建议：从共享浏览器 DTO 移除不需要的 `guild_id` 和逐行 `snapshot_id`；owner 筛选使用单独的安全 facet/不透明筛选键。若实例 UID 或 owner ID 确有后续业务需要，应在规格中逐项说明用途，并区分自有记录与共享记录的 DTO。
- 应新增的回归测试：以普通玩家请求共享页和页面 HTML，断言只出现允许字段，不出现内部 guild/snapshot/owner UUID；同时验证自有共享切换仍能使用自己的实例 UID。

### 3. `/data-status` 没有展示规格要求的游戏数据和算法版本（已修复）

- 整改结果：安全状态契约和页面新增活动游戏数据版本 ID、游戏版本、Build、确定性算法版本及 `published/not_configured/review_pending/blocked` 状态；查询始终从当前登录用户绑定的 world 推导，不接收可伪造的 world 参数。
- 验证证据：pgTAP 覆盖已发布、未配置、待审核、受阻和活动版本切换；Playwright 验证移动端可见算法版本。

- 文件路径和代码位置：`supabase/migrations/20260715020000_phase5_web_foundation.sql:170-180, 220-265`；`packages/contracts/schema/phase5-web.schema.json:141-174`；`apps/web/app/(workspace)/data-status/page.tsx:49-77`。
- 触发条件：普通玩家打开 `/data-status`，尤其是活动游戏目录缺失、待审核、已切换或算法版本需要核对时。
- 实际影响：页面只有库存快照、存档时间、Parser 和解析错误码；无法看到活动 `game_data_version_id`、游戏版本/构建、算法版本，也无法判断游戏数据待审核状态。当前页面不能完成正式规格对普通玩家数据状态的定义。
- 为什么违反规格或工程原则：正式规格第 17.10 节明确要求普通玩家查看同步时间、快照版本、游戏数据和算法版本；Phase 5 又把 `/data-status` 列为本阶段明确范围。
- 最小修复建议：在浏览器安全状态契约中加入活动游戏数据版本、构建/游戏版本、配置的算法版本及安全状态枚举；复用受世界权限保护的目录状态查询，不暴露制品路径、hash 以外的敏感来源信息或错误堆栈。
- 应新增的回归测试：覆盖 published、未配置、待审核/阻塞和切换版本四种 fixture，断言普通玩家只能看到绑定世界的安全版本摘要，其他世界返回稳定权限错误。

### 4. Web 层仍靠错误文本匹配稳定错误码，并忽略身份摘要查询错误（已修复）

- 整改结果：三个 Phase 5 RPC 改为受共享 Schema 约束的 `{ok,data}` / `{ok:false,error_code}` 结构；Web 仅解析结构化 code，意外 PostgREST 错误只按 SQLSTATE 分类。profile/binding/player/guild/world 与 Auth 查询错误均显式处理，`AUTH_UNAVAILABLE` 返回 HTTP 503。
- 验证证据：Web 测试覆盖相同 SQLSTATE 不同/误导 message、profile RLS、binding/world 网络失败和 Auth 不可用，确认不会降级成“未绑定”。

- 文件路径和代码位置：`apps/web/features/pals/server.ts:28-38, 82, 101-108`；`apps/web/app/api/pals/[palInstanceUid]/share/route.ts:11-17, 48-53`；`apps/web/features/auth/server.ts:16-25, 29-60`；`apps/web/app/api/auth/login/route.ts:29-33`。
- 触发条件：PostgREST 改变包装文案、数据库异常文本包含相似子串、RLS/网络/查询失败，或 Supabase Auth 暂时不可用。
- 实际影响：业务错误可能被错误映射为 `DATA_UNAVAILABLE` 或其他 code；profile/binding/player/world 查询失败会被静默当成默认 player 或“未绑定”；认证服务不可用虽然返回 `AUTH_UNAVAILABLE`，HTTP 状态仍是 401。用户会把系统故障误认为账号或绑定问题。
- 为什么违反规格或工程原则：工程约定明确禁止依赖错误文本判断，要求稳定错误码和明确失败状态；错误不能被空数据路径吞掉。
- 最小修复建议：RPC 返回结构化 `{ok,error_code,...}` 或使用可可靠映射的独立 SQLSTATE/结构字段；Web 只解析结构化 code。逐个检查 Supabase 查询的 `error`，把不可用、权限不足和确实不存在分开；`AUTH_UNAVAILABLE` 返回 503。
- 应新增的回归测试：模拟相同 SQLSTATE 不同 message、message 含误导子串、profile/binding/world 查询网络失败、RLS 拒绝和 Auth 503，断言 HTTP 状态与稳定 code 均正确，且不会显示“未绑定”。

### 5. 数据库生成类型把实际可空的 Phase 5 RPC 字段声明为必填字符串（已修复）

- 整改结果：Phase 5 RPC 返回 JSON envelope，数据库生成类型只声明为 `Json`；Web 在边界使用同一 `phase5-web.schema.json` 的 AJV 校验恢复强类型，不再对 table OUT row 做未验证断言。所有可空字段由共享 Schema 生成 `string | null` / `number | null`。
- 验证证据：契约测试含可空类型级断言和安全 payload 校验；本地数据库类型重复生成前后 SHA-256 一致。

- 文件路径和代码位置：`packages/contracts/src/database.types.ts:1510-1522, 1577-1593`；对照 `packages/contracts/schema/phase5-web.schema.json:66-81, 160-173`、`supabase/migrations/20260715020000_phase5_web_foundation.sql:16-31, 170-180`；强制断言位于 `apps/web/features/pals/server.ts:103-108`。
- 触发条件：没有 latest snapshot；玩家无公会；Pal 的 `location_name`、level 或状态时间/Parser 字段为空。
- 实际影响：JSON Schema 正确允许 null，但 `database.types.ts` 把 `snapshot_id/captured_at/error_code/guild_id/level/location_name` 等声明成非空。TypeScript 无法提醒调用方处理数据库真实 null；当前状态代码通过 `as InventoryDataStatus` 掩盖漂移。数据库类型重新生成仍会“通过”，因此漂移门禁是伪绿。
- 为什么违反规格或工程原则：用户要求检查 TypeScript、JSON Schema、Pydantic 和数据库字段一致；工程约定要求共享契约而非两套不一致 DTO。这里没有 Phase 5 Pydantic 消费者，但 TS/Schema/SQL 已经不一致。
- 最小修复建议：让 RPC 返回受 JSON Schema 验证的 JSON 对象，或扩展数据库类型生成器/显式覆盖元数据以保留 OUT 字段可空性；Web 边界做运行时 Schema 校验，移除未经验证的类型断言。
- 应新增的回归测试：用无公会、无位置名、空库存和解析失败 fixture 逐项跑 RPC 输出通过同一 Schema；增加类型级测试确保这些字段是 `string | null`/`number | null`。

### 6. Phase 5 浏览器验收没有进入根级检查或 CI，且测试依赖可变的外部本地状态（已修复）

- 整改结果：根级新增 `pnpm check:phase5`，自动启动并重置仓库本地 Supabase、只注入公开本地 URL/anon key、运行 Playwright，并在成功或失败后再次 reset；CI 新增独立 Phase 5 E2E job 安装 Chromium 后执行该门禁。共享修改用例保留显式恢复并增加 `afterEach` 兜底。
- 验证证据：在 Node 22.23.1 下从 reset 后 fixture 执行 5/5 Playwright 通过，随后清理 reset 成功；首次门禁失败时也实际执行了 finally reset，证明失败不会污染下一次运行。

- 文件路径和代码位置：`apps/web/package.json:5-11`；`apps/web/playwright.config.ts:21-26`；`.github/workflows/ci.yml:16-44, 46-85`；状态变更测试 `apps/web/e2e/phase5.spec.ts:41-55`。
- 触发条件：仅执行规范优先的 `pnpm check`/当前 CI；在干净 checkout 未启动/未注入本地 Supabase 环境时直接执行计划写出的 `pnpm --filter @palhatch/web test:e2e`；或共享切换测试在关闭后、恢复前失败。
- 实际影响：提交可以在 CI 全绿而完全没有执行登录、移动端筛选、网络响应裁剪和共享切换。E2E 命令本身不启动/reset 本地 Supabase，也不注入公开本地 URL/anon key；中途失败还可能把后续用例所依赖的共享状态留为 false。核心失败路径没有稳定门禁。
- 为什么违反规格或工程原则：Phase 5 计划把 Playwright 与 `pnpm check` 并列为阶段回归；工程约定禁止未实际执行就声称完成。测试存在但默认不运行，不能形成验收证据。
- 最小修复建议：增加隔离的 CI E2E job（安装浏览器、启动/reset 仅本地 Supabase、注入本地公开配置、运行后清理）；每个修改状态的用例使用独立 fixture 或 `beforeEach/afterEach` 强制 reset/恢复。根级提供一个可复现的 Phase 5 gate 脚本。
- 应新增的回归测试：在无 `.env` 的干净 CI 容器执行完整 Phase 5 gate；故意让第一次 toggle 后失败，再运行下一次测试，断言数据库状态仍被隔离恢复。

## LOW

### 1. 新索引不是计划要求的并发友好迁移，文档中的 Index Only Scan 证据不可复现完整 RPC（已修复）

- 整改结果：撤回缺少目标规模完整 RPC 性能证据的 `pal_snapshot_items_page_order_idx`，Phase 5 不再引入可能阻塞共享环境写入的普通索引。迁移文档删除误导性的局部 `Index Only Scan`，明确只有在保存完整 RPC、数据规模、`EXPLAIN (ANALYZE, BUFFERS)`、延迟和并发发布证据后，才能通过单独获批的 `CREATE INDEX CONCURRENTLY` 流程增加索引。
- 验证证据：空库 `supabase db reset` 与 36 项 Phase 5 pgTAP 证明撤回索引不影响功能正确性；`scripts/check-structure.mjs` 会拒绝该阻塞式普通索引重新进入 Phase 5 事务迁移。

- 文件路径和代码位置：`supabase/migrations/20260715020000_phase5_web_foundation.sql:1-2`；`docs/operations/database-migrations.md:38-49`。
- 触发条件：在已有较大 `pal_snapshot_items` 表的共享环境应用迁移，或按文档尝试对完整分页 RPC 复现所示计划。
- 实际影响：普通 `create index` 可能阻塞并发写入；索引只包含 `snapshot_id/pal_id/pal_instance_uid`，完整 RPC 还读取大量列和多表连接，文档没有保存实际 EXPLAIN SQL，因此所示 `Index Only Scan` 不能证明完整查询计划。
- 为什么违反规格或工程原则：Phase 5 计划要求只有性能证据成立时才增加独立、并发友好的索引迁移并记录查询计划；当前迁移和文档证据不足。
- 最小修复建议：将索引放入明确支持的并发迁移流程，或在非生产阶段记录为何普通建索引安全；保存可复现的完整 EXPLAIN SQL、数据规模和计划，不把仅查询排序键的计划描述成完整 RPC 证据。
- 应新增的回归测试：用接近目标规模的合成库存运行完整筛选/分页 EXPLAIN 与延迟基准，并在并发发布库存时应用索引迁移，断言写入不会被不可接受地阻塞。

## 已验证的安全边界

- `git diff --check` 通过；未发现空白错误或冲突标记。
- 使用仓库要求的 Node `v22.23.1` 和 pnpm `9.15.4` 重新执行 `pnpm check`，契约生成、Prettier、ESLint、TypeScript、Vitest、Next build、Ruff、mypy、pytest、结构检查和秘密扫描全部通过；Agent 为 `149 passed, 1 skipped`。
- 本地 Supabase CLI `2.109.1` 从空库执行 `supabase db reset` 成功，`supabase db lint` 无错误，`supabase test db` 为 9 个文件、217 项全部通过。
- 使用仅回环地址的本地数据库重新生成 `database.types.ts`；重复生成前后 SHA-256 一致，Phase 5 JSON RPC 不再生成错误的非空 table OUT 类型。
- 在 Node 22、仅本地 Supabase、`.invalid` 测试账号下通过新根级 `pnpm check:phase5` 执行 Phase 5 Playwright，5/5 通过；门禁前后均自动 reset 本地 fixture。一次预期外 E2E 失败也确认 finally reset 会执行，修正 hydration 等待与唯一定位器后全量通过。
- Web Supabase 客户端只读取 `NEXT_PUBLIC_SUPABASE_URL` 和 anon key；未发现 service role、生产 URL、真实邮箱、真实服务器 IP、`.env` 或生产凭证进入前端/工作区，秘密扫描通过。
- 新 RPC 为 `security definer` 且固定 `search_path`，显式撤销 anon/public 执行权；候选集先约束当前绑定玩家、世界、公会、owner 和共享偏好，再应用筛选。pgTAP 与浏览器测试均验证私有 Pal、其他公会 Pal、`raw_metadata`、源 hash 和 `/opt/palworld` 路径不进入响应。
- 共享修改仍通过数据库 `set_pal_share_enabled` 校验 latest snapshot 的真实 owner；未发现只靠前端隐藏开关的权限绕过。
- 未修改既有迁移、Phase 0 的 Node/pnpm/Python/CI 版本、Agent Compose、端口、代理、Palworld/mihomo 配置或 `/opt/palworld`；没有执行生产部署、远程推送或生产访问。
- 未发现 Phase 6 的配种任务、路线比较、AI 或 Phase 7 计划状态机实现；新增依赖为 Phase 5 所需 Supabase SSR/client 和 dev-only Playwright，没有新增重量级 Agent 生产依赖。

## 仍未验证的风险

- 未在 Vercel preview 或任何共享 Supabase 环境验证 SSR cookie 刷新、跨用户缓存隔离和部署环境变量；只验证了本地动态请求和 `private, no-store` 响应。
- 未使用真实游戏目录、真实存档或真实玩家库存；真实来源许可/build/配方验收仍是 Phase 4 阻塞项。
- 未在大规模库存上验证过滤、materialized CTE、目录连接和总数统计的性能；本阶段未携带推测性新索引，若后续基准证明需要索引，仍须单独验证并发构建和库存发布。
- 未验证 Safari/WebKit、Android Chrome 和微信浏览器；当前 Playwright 项目是 iPhone 13 尺寸/UA 下的 Chromium。
- 未对 `set_pal_share_enabled` 与库存发布同时发生的 owner 变化竞态做并发测试；现有数据库函数属于基线代码，但 Phase 5 首次把它接入真实 UI。
- Phase 5 Schema 当前没有 Python 消费者，因此没有生成对应 Pydantic 类型；一旦 Agent/BFF Python 侧消费这些字段，必须从同一 Schema 生成，不能手写 DTO。
- 未运行生产部署、远程推送、真实管理员账号、真实 Storage、真实网络扫描或 `/opt/services/palworld-manager` 操作。

## 建议人工检查项

- 用浏览器 Network/RSC payload 人工核对共享 Pal 的最小字段，确认哪些内部 UUID 真正有产品用途。
- 在后续真实目录验收通过后，人工复核中文本地化、图鉴编号、名称冲突和未知 ID 的实际展示；当前只使用 published 合成目录验证行为。
- 在真实 iPhone Safari、Android Chrome 和微信浏览器检查登录 cookie、底部导航、筛选表单、共享开关、焦点和安全区。
- 对接近真实规模的数据执行完整 RPC EXPLAIN ANALYZE，并评审并发索引策略。
- 人工核对 `/data-status` 最终应展示的游戏数据/算法版本和 Phase 4 阻塞措辞，避免把合成 fixture 标成真实可发布数据。

## Phase 结论

6 个 MEDIUM、2 个 HIGH 和 1 个 LOW 已全部修复：分页同时固定快照与目录版本，共享响应保持最小字段，目录显示/名称/编号搜索来自活动发布版本，未配置与未知 ID 状态明确，数据状态、结构化错误、共享 Schema 运行时校验和可复现 E2E 门禁均已闭环；未经证据支持的分页索引已撤回。

**Phase 5 实现与自动化门禁通过。Phase 6 仍受 Phase 4 `real_data_acceptance=pending` 与 `production_publish=blocked` 阻塞。**
