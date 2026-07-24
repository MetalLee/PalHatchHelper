# Forest Healing UI 重构现状审计

## 1. 审计基线

- 审计日期：2026-07-24
- 当前分支：`refactor/forest-healing-ui`
- 当前 HEAD：`4a4da8876c1534b1e9b4398a13b85bc2da6c1bd0`
- HEAD 摘要：`4a4da88 Merge pull request #15 from MetalLee/fix/guild-owned-inventory-snapshots`
- 起始分支：`main`
- 分支处理：目标分支原本不存在；从当前 `main` HEAD 原位创建并切换，没有暂存、覆盖或丢弃工作区文件。
- 起始工作区：不干净，已有未跟踪目录 `docs/ui-reference/`。
- 本步骤新增：本审计文档 `docs/ui-refactor/forest-healing-audit.md`。
- 未执行：push、PR、部署、生产数据库访问、生产秘密访问、Agent/Palworld/mihomo 操作，以及 `/opt/palworld` 读写。

本审计以正式设计规格为唯一需求来源。实施计划只用于确定交付顺序；原型只作为视觉参考，不能引入规格或当前契约中不存在的事实与动作。

## 2. 原型核对

以下 7 个文件全部存在，均为 `1672 × 941` RGB PNG：

| 原型 | 状态 |
| --- | --- |
| `docs/ui-reference/forest-healing/01-login.png` | 存在 |
| `docs/ui-reference/forest-healing/02-overview.png` | 存在 |
| `docs/ui-reference/forest-healing/03-pals.png` | 存在 |
| `docs/ui-reference/forest-healing/04-breeder.png` | 存在 |
| `docs/ui-reference/forest-healing/05-plans.png` | 存在 |
| `docs/ui-reference/forest-healing/06-data-status.png` | 存在 |
| `docs/ui-reference/forest-healing/07-admin.png` | 存在 |

### 2.1 只能借鉴的视觉语言

- 浅色森林背景、柔和绿色主色、半透明卡片、圆角导航和高密度数据卡片。
- 顶部品牌区、桌面横向主导航、移动端仍须回到规格规定的底部四项导航。
- 页面头图、状态卡、列表卡和步骤/路线图的层级关系。

### 2.2 不得直接实现的原型内容

原型包含大量当前系统不存在、与规格冲突或会制造虚假事实的内容，重构时必须删除、禁用或替换为真实能力：

- 登录页的注册、忘记密码、游客体验、上传存档。当前只支持 Supabase Auth 登录；浏览器不能上传真实存档。
- 概览页的“上传存档”、通知角标、虚构增长数据、虚构计划与虚构目录统计。
- 帕鲁页的潜力评分、收藏、属性/稀有度筛选、即时备份，以及没有契约来源的图片、状态或统计。
- 配种页的精确成功率、星级稀有度、潜力偏好、任意替换亲本、“保存方案”和“生成并加入计划”。当前只能展示策略估计的难度/尝试区间；只有 `ready` 路线能通过正式采用 RPC 建立计划。
- 计划页的日程提醒、到期提醒、自动进度、没有服务端事实来源的完成预测。
- 数据状态页的自动备份、30 天数据保留、属性分布/趋势、解析完成率和手动刷新。正式库存明细保留语义是被更新快照取代后最多 24 小时，最新有效库存始终保留。
- 管理原型中的上传/替换/删除存档、创建/恢复备份、云同步、清缓存和客户端直接“立即同步”。管理员动作必须限于现有受审计 RPC/Agent command；不得修改真实存档或控制 Palworld。

## 3. 当前页面与路由

所有受保护业务页面均通过 `force-dynamic` 或动态父布局按用户请求读取会话，不应在 UI 重构中改成跨用户静态缓存。

| 路由 | App Router 文件 | 边界 | 页面直接依赖 |
| --- | --- | --- | --- |
| `/` | `app/page.tsx` | Server | 重定向 `/overview` |
| `/login` | `app/login/page.tsx` | Server + `LoginForm` Client | `POST /api/auth/login` |
| `/overview` | `app/(workspace)/overview/page.tsx` | Server | `requireUserContext`、`getOverviewSummary`、`dataStatusPresentation` |
| `/pals` | `app/(workspace)/pals/page.tsx` | Server + `PalInventory` Client | `parsePalListQuery`、`listPals`、筛选/分页展示 |
| `/breeder` | `app/(workspace)/breeder/page.tsx` | Server + `BreederForm` Client | `loadBreederFormContext` |
| `/breeder/jobs/[jobId]` | `app/(workspace)/breeder/jobs/[jobId]/page.tsx` | Server + `BreedingJobView` Client | `loadBreedingJob` |
| `/plans` | `app/(workspace)/plans/page.tsx` | Server | `loadPlans`、`PlanList` |
| `/plans/[planId]` | `app/(workspace)/plans/[planId]/page.tsx` | Server + `PlanDetail` Client | `loadPlanDetail` |
| `/data-status` | `app/(workspace)/data-status/page.tsx` | Server | `getInventoryDataStatus`、状态 presentation |
| `/account` | `app/(workspace)/account/page.tsx` | Server + `SignOutButton` Client | `requireUserContext`、`POST /api/auth/logout` |
| `/admin` | `app/admin/page.tsx` | Server | `loadAdminOverview`、`loadAdminAuditEvents` |
| `/admin/bindings` | `app/admin/bindings/page.tsx` | Server + admin actions Client | `loadAdminBindings` |
| `/admin/save-parser` | `app/admin/save-parser/page.tsx` | Server + admin actions Client | `loadAdminSaveParserStatus` |
| `/admin/breeding-data` | `app/admin/breeding-data/page.tsx` | Server + admin actions Client | `loadAdminCatalogWorkspace` |
| `/admin/jobs` | `app/admin/jobs/page.tsx` | Server + admin actions Client | `loadAdminJobs`、秘密配置状态 |
| `/admin/settings` | `app/admin/settings/page.tsx` | Server + admin actions Client | runtime settings、秘密配置状态 |

规格中的正式路由均已存在。管理员页面名 `/admin/breeding-data` 保留了早期命名，但当前实际处理统一游戏目录；仅改显示名时不能改变 RPC 或版本语义。

## 4. Server/Client Component 边界

### 4.1 Server Components 与 server-only 数据访问

- 根布局和所有页面文件默认是 Server Component。
- `(workspace)/layout.tsx` 在服务器执行 `requireUserContext()` 后，把安全的 `display_name` 交给 Client `AppShell`。
- `admin/layout.tsx` 在服务器执行 `requireAdminPageAccess()`；不能把管理员判断迁到浏览器。
- `features/auth/server.ts` 使用当前用户 anon session 查询 `profiles`、`player_bindings`、`players`、`guilds`、`worlds`。
- `features/pals/server.ts`、`features/breeder/server.ts`、`features/plans/server.ts`、`features/admin/server.ts` 是页面的 server 查询边界，均 `noStore()`。
- `lib/supabase/server.ts` 只使用 `NEXT_PUBLIC_SUPABASE_URL` 与 anon key 加当前会话 Cookie；没有 service role。

### 4.2 Client Components

| Client Component | 必须保留的交互职责 |
| --- | --- |
| `components/app-shell.tsx` | 读取 pathname，设置当前导航；可替换视觉外壳 |
| `app/login/login-form.tsx` | 登录提交、稳定错误提示、完整导航刷新会话 |
| `account/sign-out-button.tsx` | 调用退出 Route Handler |
| `features/pals/pal-inventory.tsx` | 自有 Pal 的共享开关、乐观展示、错误处理 |
| `features/breeder/breeder-form.tsx` | 目标/被动/模式/共享/代数输入和创建任务 |
| `features/breeder/breeding-job-view.tsx` | 有上限轮询、路线选择/比较、正式采用 |
| `features/plans/plan-detail.tsx` | 人工状态动作、候选确认/拒绝、乐观并发、重算 |
| `features/admin/admin-shell.tsx` | 管理员 pathname 导航状态 |
| `features/admin/admin-actions.tsx` | 受审计管理员动作及目录制品上传 |
| `app/admin/error.tsx` | error boundary 重试 |

重构应把这些文件中的展示片段拆到纯组件，但不应把数据查询、权限判定、稳定错误映射或状态机复制进新展示组件。

## 5. 页面、feature、API 与 Supabase 映射

| 页面/能力 | feature/server 查询 | Web API Route | Supabase 入口 | 主要 migration |
| --- | --- | --- | --- | --- |
| 登录/会话 | `loadUserContext` | `POST /api/auth/login`、`POST /api/auth/logout` | Supabase Auth；直接读身份/绑定表 | Phase 1 身份/RLS；Phase 5 foundation |
| 概览 | `getOverviewSummary` | 无 | `list_available_pals_page_v2` ×3、`get_inventory_data_status` | `20260721030000`、`20260721040000`、`20260724020000`、`20260724040000`；`20260715020000`、`20260716031000` |
| 帕鲁列表 | `listPals` | `GET /api/pals`（当前 UI 的首屏使用 Server Component）；`PATCH /api/pals/[uid]/share` | `list_available_pals_page_v2`、`set_pal_share_enabled_for_web` | 同上；共享 RPC 在 `20260715020000` |
| 配种创建 | `loadBreederFormContext` | `POST /api/breeder/jobs` | `get_breeder_form_context`、`create_breeding_job_v2`，随后受 RLS 读取 job status | `20260716031000`、`20260716030000`、`20260720010000` |
| 任务结果 | `loadBreedingJob` | `GET /api/breeder/jobs/[jobId]` | `get_breeding_job_detail` | `20260716030000`，由 Phase 7、localization、v3 路线 migrations 继续扩展 |
| 路线采用 | 无 | `POST /api/plans/adopt` | `adopt_breeding_route` | `20260716040000_phase7_execution_plans.sql` |
| 计划列表/详情 | `loadPlans`、`loadPlanDetail` | 无（初始读取为 Server Component） | `list_execution_plans`、`get_execution_plan_detail` | `20260716040000` |
| 计划动作 | 无 | `POST /api/plans/[planId]/actions` | start/continue/skip/select/confirm/reject/pause/resume/recalculate RPC | `20260716040000` |
| 管理员读取 | `features/admin/server.ts` | 无 | `is_admin`、overview/binding/save-parser/catalog/jobs/settings/secret/audit RPC | `20260717010000`、`20260717011000` |
| 管理员动作 | 无 | `POST /api/admin/actions` | binding/settings/catalog RPC 与白名单 `create_agent_command` | `20260717010000`、`20260717011000` |

所有 Route Handler 都应继续返回 `private, no-store`。Phase 5–7 API 还设置 `Vary: Cookie, Authorization`；管理员 Route 当前仅设置 `Cache-Control`，视觉重构不应改变其权限行为。

## 6. 当前导航结构

玩家桌面侧栏：

1. 概览 `/overview`
2. 帕鲁 `/pals`
3. 配种器 `/breeder`
4. 计划 `/plans`
5. 底部：数据状态 `/data-status`
6. 底部：账号 `/account`

移动底栏当前有 5 项：概览、帕鲁、配种器、计划、数据状态。正式规格要求移动底栏只有前四项，数据状态应进入顶部状态入口或用户菜单；重构时可修正这一展示结构，但必须保留 `/data-status` 路由。

管理员使用独立横向导航：管理员概览、玩家绑定、存档与 Parser、配种数据、任务与 AI、系统设置。规格要求管理员入口位于用户头像菜单；重构可改变入口和壳层，不改变各子路由和服务端 `is_admin` 检查。

## 7. 当前样式系统

### 7.1 现状

- Tailwind CSS 4，通过 `@import "tailwindcss"` 使用；`@source "../../../packages/ui/src"` 已包含共享包源码。
- `globals.css` 共 1165 行，同时承担 token、reset、布局、导航、表单、卡片、配种器、计划、管理员和响应式规则。
- 只有 8 个根变量：`background`、`panel`、`panel-raised`、`foreground`、`muted`、`line`、`accent`、`accent-strong`。
- 大量颜色、圆角、阴影、透明度和断点直接硬编码，缺少 semantic/component token。
- 同一元素混用全局语义类和长 Tailwind utility 字符串，状态颜色与间距不统一。
- 当前是深色优先工具风，与 Forest Healing 浅色视觉差异很大。
- 全局 `body` 字体仍为 Arial/系统中文字体，没有字体资产策略。
- 共享 `@palhatch/ui` 仅有未被 Web 使用的 `StatusBadge`；实际页面复用仍集中在 `apps/web/app/globals.css`。

### 7.2 全局 CSS 类及引用位置

全局类共 94 个，按实际引用边界分组如下。状态后缀类中部分由模板字符串动态引用。

| 引用边界 | 全局类 |
| --- | --- |
| 全站壳层/导航 | `app-frame`、`app-main`、`skip-link`、`desktop-sidebar`、`brand-lockup`、`brand-mark`、`side-nav-link`、`side-nav-link-active`、`mobile-bottom-nav`、`mobile-nav-link`、`mobile-nav-link-active` |
| 页面骨架/状态 | `page-stack`、`page-header`、`eyebrow`、`content-panel`、`state-card`、`state-orb`、`primary-button`、`secondary-button`、`notice-banner` |
| 登录 | `login-page`、`login-card`、`login-field` |
| 概览 | `stats-grid`、`stat-card`、`stat-card-accent`、`status-callout` |
| 数据状态 | `status-dot`、`status-good`、`status-warning`、`status-danger`、`status-hero`、`status-hero-good`、`status-hero-warning`、`status-hero-danger`、`detail-grid` |
| 帕鲁筛选/分页 | `filter-panel`、`scope-tabs`、`scope-tab`、`scope-tab-active`、`filter-grid`、`filter-field`、`filter-search`、`pal-pagination`、`pal-page-summary`、`pal-page-jump` |
| 帕鲁卡片/共享 | `pal-grid`、`pal-card`、`level-chip`、`passive-chip`、`detail-label`、`share-switch-row`、`share-switch`、`share-switch-on` |
| 配种表单 | `breeder-layout`、`breeder-controls`、`selected-passives`、`selected-passives-header`、`selected-passive-list`、`selected-passive-chip`、`passive-picker`、`passive-picker-empty`、`passive-option`、`share-choice`、`fixed-inputs` |
| 路线/计划详情 | `route-tabs`、`route-tab`、`route-tab-active`、`route-metrics`、`parent-grid`、`parent-card`、`route-step`、`score-panel`、`score-row`、`score-row-heading` |
| 管理员 | `admin-frame`、`admin-topbar`、`admin-identity`、`admin-navigation`、`admin-nav-link`、`admin-nav-link-active`、`admin-main`、`admin-access-denied`、`admin-grid`、`admin-card`、`admin-status`、`admin-status-good`、`admin-table-wrap`、`admin-table`、`admin-actions`、`admin-action-stack`、`admin-inline-form`、`admin-form-grid`、`admin-kv` |

精确文件映射：

- `components/app-shell.tsx` / `components/app-navigation.tsx`：壳层、品牌、桌面/移动导航、skip link。
- `components/page-state.tsx`：`state-card`、`state-orb`、`eyebrow`。
- `app/login/*`：登录类、品牌类、主按钮。
- `app/(workspace)/overview/page.tsx`：统计卡、状态 callout、通用面板。
- `features/pals/{pal-filters,pal-pagination,pal-inventory}.tsx`：全部筛选、分页、卡片、标签、共享开关类。
- `features/breeder/{breeder-form,breeding-job-view}.tsx`：全部配种表单、路线、父母、评分类。
- `features/plans/{plan-list,plan-detail}.tsx`：复用通用面板/按钮/父母卡/标签/表单类。
- `features/admin/*` 与 `app/admin/**`：全部 `admin-*` 类，并复用 `page-stack`、`page-header`、`eyebrow`、按钮。
- `app/(workspace)/data-status/page.tsx` 与 account：状态 hero、detail grid、notice。

### 7.3 shadcn/ui 与依赖准备状态

- `apps/web/components.json` 已存在：`new-york`、RSC、CSS variables、`lucide` icon library、标准 aliases。
- 尚无 `apps/web/components/ui/`、`apps/web/lib/utils.ts` 或 `apps/web/hooks/`。
- `apps/web/package.json`、其他 workspace `package.json` 和 lockfile 均没有直接或间接记录以下依赖：
  - `lucide-react`
  - `@radix-ui/*`
  - `class-variance-authority`
  - `clsx`
  - `tailwind-merge`
- 因此当前只是 shadcn 配置占位，不是可直接使用的 shadcn 组件库。
- 后续只能按真实页面需要增量引入轻量依赖；新增依赖前应记录理由，不能一次性生成整套组件。

## 8. Phase 5、6、7 测试覆盖

### 8.1 Phase 5

单元/组件测试：

- `auth.test.ts`：登录成功、稳定凭证错误、结构化错误映射、一次 auth timeout 重试。
- `pals.test.tsx`：三种范围、筛选、全候选池 facets、稳定分页上下文、页码跳转、自有共享开关、目录缺失/未知 ID、Boss/位置/公会所有展示。
- `states-and-navigation.test.tsx`：loading/empty/unbound/forbidden/stale/parse error、桌面/移动导航。
- `page.test.tsx`：登录工作台与 RLS/RPC 安全说明。
- `middleware-cache.test.ts`：认证重定向 private/no-store。

E2E `phase5.spec.ts`：

- 登录失败/成功、未绑定状态、库存范围和分页、iPhone 筛选/分享、浏览器响应隐私、过期数据状态。

### 8.2 Phase 6

单元/组件测试：

- `breeder.test.tsx` 共 24 项，覆盖 hydration、防重复输入、四被动上限、固定请求、目录本地化、三路线、ready/fallback 分层、缺失被动/父母、搜索上限语义、无合法路线建议、AI 降级、采用与已采用跳转。
- `breeder-csp.test.tsx`：Client Component 不依赖动态 JS 编译。

E2E `phase6.spec.ts`：

- iPhone 创建任务、刷新恢复、真实阶段、固定版本、最多三条确定性路线比较、评分明细和 AI 降级。

### 8.3 Phase 7

单元/组件测试：

- `plans.test.tsx`：状态筛选、固定版本、进度/候选数、空状态、当前步骤优先、候选事实、人工警告、审计时间线、确认端点、乐观冲突、失效与重算、权限/固定版本错误。
- `states-and-navigation.test.tsx`：计划中心在桌面和移动导航可达。
- `breeder.test.tsx` 同时覆盖从结果页采用路线。

E2E `phase7.spec.ts`：

- 正式采用 Phase 6 路线、候选检测、玩家确认、依赖消失失效、基于最新库存重算且历史固定版本不被改写。

### 8.4 本次基线范围

本步骤按用户指定命令运行了 Vitest，但没有运行 Playwright。E2E 文件和覆盖点已审计；后续页面迁移阶段必须在本地测试 Supabase/fixture 环境运行相应 Phase E2E，不能因本次未执行而宣称浏览器回归已通过。

## 9. 不能因 UI 重构改变的稳定边界

### 9.1 稳定错误码

Phase 5：

`AUTH_REQUIRED`、`INVALID_CREDENTIALS`、`AUTH_UNAVAILABLE`、`PLAYER_BINDING_REQUIRED`、`INVALID_PAL_SCOPE`、`INVALID_PAL_FILTER`、`INVALID_PAGINATION`、`INVENTORY_SNAPSHOT_CHANGED`、`GAME_DATA_VERSION_CHANGED`、`PAL_NOT_OWNED`、`FORBIDDEN`、`DATA_UNAVAILABLE`。

Phase 6 Web/数据库映射还必须保留：

`PLAYER_BINDING_INVALID`、`ACTIVE_INVENTORY_SNAPSHOT_REQUIRED`、`PUBLISHED_GAME_DATA_VERSION_REQUIRED`、`GAME_DATA_COMPATIBILITY_VERSION_REQUIRED`、`ACTIVE_SCORING_PROFILE_REQUIRED`、`INVALID_TARGET_PAL`、`INVALID_DESIRED_PASSIVES`、`INVALID_OPTIMIZATION_MODE`、`INVALID_GUILD_SHARING`、`INVALID_MAX_GENERATIONS`、`TARGET_PAL_NOT_IN_GAME_DATA_VERSION`、`DESIRED_PASSIVE_NOT_IN_GAME_DATA_VERSION`、`JOB_CREATE_CONFLICT`、`JOB_NOT_FOUND`，以及任务/搜索结果中的稳定 `error_code`、`explanation_codes`。

Phase 7：

`ROUTE_NOT_ADOPTABLE`、`PLAN_NOT_FOUND`、`PLAN_ACCESS_DENIED`、`PLAN_VERSION_CONFLICT`、`PLAN_INVALID_STATE_TRANSITION`、`PLAN_NOT_CURRENT_STEP`、`PLAN_PAUSED`、`STEP_PREREQUISITE_INCOMPLETE`、`CANDIDATE_NOT_FOUND`、`CANDIDATE_ALREADY_USED`、`CANDIDATE_SPECIES_MISMATCH`、`CANDIDATE_CONFIRMATION_REQUIRED`、`EXISTING_PAL_NOT_ELIGIBLE`、`PLAN_DEPENDENCY_UNAVAILABLE`、`PLAN_RECALCULATION_REQUIRED`、`PLAN_FIXED_VERSION_UNAVAILABLE`、`SNAPSHOT_DELTA_UNAVAILABLE`。

计划失效原因：

`DEPENDENCY_DISAPPEARED`、`OWNER_CHANGED`、`SHARING_DISABLED`、`GUILD_ACCESS_LOST`、`GENDER_INCOMPATIBLE`、`CONFIRMED_RESULT_DIVERGED`、`FIXED_CATALOG_UNAVAILABLE`、`FIXED_CONTENT_HASH_MISMATCH`。

管理员错误码与 action 名同样由 Phase 8 契约和 `api/admin/actions` 白名单固定，UI 不得自行发明成功状态或绕过确认/idempotency。

### 9.2 稳定 ARIA 名称与测试定位

以下是现有自动化与无障碍语义依赖，视觉重构必须保留语义等价名称；若产品文案必须改变，应先同步修改有意义的测试，而不是删除可访问名称：

- 导航：`主导航`、`移动端导航`、`管理员导航`、`帕鲁列表分页`、`计划状态筛选`。
- 登录字段/动作：`邮箱`、`密码`、`登录工作台`。
- 帕鲁：`库存筛选`、`库存范围`、`名称、图鉴编号或稳定 ID`、`应用筛选`、`跳转页码`、`<帕鲁名> 公会共享` switch。
- 配种：`配种目标`、`目标 Pal（名称、编号或 Stable ID）`、`已选择的被动`、`被动技能选择`、`优化模式`、`最大代数`、`固定版本`、`可执行路线比较`、`缺库存备选路线`、`路线详情`。
- 计划：`执行步骤`、`当前步骤操作`、`确认真实子代`、`继续尝试`、`选择已有 Pal`、`跳过步骤`、`基于最新库存重新计算`。
- 稳定测试标识：`data-testid="job-stage"`、`data-testid="offspring-candidate"`。
- 状态语义：错误继续使用 `role="alert"`，异步/健康状态继续使用 `role="status"`/`aria-live`，共享开关继续使用 `role="switch"` + `aria-checked`，当前导航继续使用 `aria-current="page"`。

### 9.3 稳定接口字段

不得在展示层手工重定义或重命名以下共享契约字段；字段变化必须先修改 JSON Schema、重新生成并通过数据库/Agent/Web 兼容验证：

- 用户/绑定：`user_id`、`email`、`display_name`、`role`、`binding` 及 player/guild/world ID/name。
- 库存页：`snapshot_id`、`game_data_version_id`、`catalog_state`、`items`、`total_count`、`page_number`、`total_pages`、`filter_options`。
- Pal：稳定 instance/species ID、`is_boss`、目录编号/显示名/解析状态、所有者 filter/display、gender/level/passives、location type/name/logical ID/slot/access scope、ownership scope、share 状态、requester ownership。
- 数据状态：`state`、snapshot/captured/source/attempt time、parser name/version、`error_code`、`using_previous_snapshot`、游戏数据状态/version/build/game version、算法版本。
- 任务创建/进度：target、最多四个 desired passives、optimization mode、allow guild shared、max generations、job ID/reused/status/attempt/error。
- 路线：固定 snapshot/catalog/content hash/algorithm/scoring、route ID/key/rank/mode/score、generation/step/attempt/difficulty/borrow/coverage/inheritance、`feasibility_status`、`adoptable`、missing requirements/passive sources、score breakdown、parents/steps、AI degraded/provider/explanation。
- 执行计划：plan/route ID、status/current/completed/total/pending candidate、完整 version pin、concurrency version、steps、candidates、invalidation reasons、events。
- 计划动作：`expected_concurrency_version` 与 `idempotency_key`；确认必须使用真实 `candidate_key`，重算返回 source plan/job/reused。

## 10. 必须保留与可以替换的模块

### 10.1 必须原样保留语义的业务模块/方法

- `features/auth/authenticate.ts` 与 `features/auth/server.ts` 的 Auth、绑定和用户上下文。
- `lib/supabase/{config,server,browser}.ts` 的 anon session 边界。
- `features/phase5-errors.ts` 的结构化错误映射与 HTTP 状态。
- `features/pals/query.ts` 的筛选解析、长度限制、分页上限和稳定 snapshot/catalog page context。
- `features/pals/server.ts` 的 safe projection、RLS/RPC 查询和 overview 统计来源。
- `features/breeder/server.ts`、创建请求校验、任务恢复/轮询、ready/fallback 分层、搜索不完整语义、采用调用。
- `features/plans/server.ts` 的 cursor、读取和稳定错误映射；`plan-detail.tsx` 中所有正式状态动作、乐观并发与人工确认。
- `features/admin/server.ts`、`api/admin/actions/route.ts` 的服务器管理员检查、动作白名单、确认/idempotency 与安全错误。
- `packages/contracts` 的 JSON Schema、生成类型和解析器。
- 相关 Supabase migrations/RPC/RLS；UI 重构不得重写历史 migration。

### 10.2 可删除或替换的旧展示层

以下模块可在新组件达到行为/测试等价后删除或改写：

- `components/app-navigation.tsx`、`components/app-shell.tsx` 的当前深色侧栏视觉与字符 glyph。
- `components/page-state.tsx` 的当前卡片外观，保留状态语义和错误码输入。
- 页面中的 `page-header`、`stats-grid`、`content-panel` 等纯展示 JSX。
- `features/pals/pal-filters.tsx`、`pal-pagination.tsx` 的视觉结构；查询参数名、范围和稳定 context 必须保留。
- `pal-inventory.tsx` 中纯卡片/徽标/位置排版；共享 mutation 逻辑应抽出保留。
- `breeder-form.tsx`、`breeding-job-view.tsx` 中纯表单/卡片/路线/评分视图；创建、轮询、选择、采用逻辑应先抽离。
- `plan-list.tsx` 和 `plan-detail.tsx` 中纯列表、步骤、候选和时间线视图；状态机调用不可删除。
- `features/admin/{admin-shell,admin-navigation,presentation}.tsx` 与各 admin page 的纯展示壳。
- 1165 行旧 `globals.css` 在新 token/组件样式覆盖并且引用清零后分批删除。
- `packages/ui/StatusBadge` 当前未被 Web 使用；可替换为新共享状态组件或删除，但先更新其独立测试与导出。

禁止“一次性删除再补功能”。每个旧组件只有在新组件已接回同一 server/API/contract 且局部测试通过后才移除。

## 11. 需要补充的浏览器安全字段

以下缺口来自正式规格与当前浏览器 projection 的差异。只能通过共享 Schema + 受 RLS/RPC 保护的最小化 projection 补充，不能从原型硬编码：

1. 概览：当前只有三种库存数和数据状态；需要活动计划、当前步骤、待确认候选、最近完成计划的安全摘要。
2. Pal 列表：规格还需要计划占用状态、稀有被动筛选/标记。应返回稳定枚举或目录事实派生字段，不返回其他玩家完整计划。
3. 配种目标选择器：当前 Pal option 缺少“已拥有”与公会可用数量。只能返回聚合 count/boolean，不返回选择器不需要的实例明细。
4. 路线父母位置：当前 Phase 6 parent projection 只有 `location_type`/`location_name`；为诚实显示页格/工作位，需要安全的 `location_slot_index`、必要时经脱敏的 logical `location_id` 和 `location_access_scope`。绝不能返回原始 CharacterContainer GUID 或服务器路径。
5. 路线来源：可增加稳定的 requester-owned/guild-borrowed/guild-owned/intermediate/missing 展示枚举，但必须由所有权/来源事实派生，不能用前端猜测。
6. 计划步骤：当前详情只含 parent instance UID/source kind；Forest Healing 路线图需要最小化父母 Pal 名称、性别、被动、所有者显示名和诚实位置 projection，且不得泄露其他玩家完整库存。
7. 计划候选：当前候选有 location type/name，但没有安全页格/工作位字段；需要时按同一位置规则补充 slot/access scope。
8. 图像：当前契约没有 Pal 图片 URL。若新 UI 使用图片，应增加由固定 catalog 版本控制的 `asset_key`/受许可静态资源映射；不能让 AI 或前端按名字猜图，也不能上传游戏二进制资产到目录制品。

任何新增字段都必须有：

- 共享 JSON Schema/OpenAPI 源；
- 生成 TS/Python 类型；
- RPC/RLS 最小化与跨公会隐私测试；
- fixture 和 Web 解析测试；
- 对历史固定结果的 nullable/兼容策略。

## 12. 分步骤迁移顺序与验证

### Step 1：视觉基础与无障碍壳层

- 建立 Forest Healing primitive → semantic → component tokens。
- 按需安装最小 shadcn 依赖并生成首批 Button/Card/Input/Select 等组件。
- 接入受许可的背景/品牌/图标资产；先做根布局、skip link、桌面/移动导航和状态组件。
- 保持受保护页面动态读取、管理员服务器检查和全部路由。

验证：

```bash
pnpm --filter @palhatch/web test -- page states-and-navigation tailwind-source
pnpm --filter @palhatch/web lint
pnpm --filter @palhatch/web typecheck
pnpm --filter @palhatch/web build
```

### Step 2：登录、概览、数据状态、账号

- 登录只接回现有 Supabase Auth。
- 概览先使用当前真实字段；新增摘要字段必须先完成契约/RPC 小阶段。
- 数据状态保留错误码、上一有效快照和固定版本信息，不展示虚构趋势/备份。

验证：

```bash
pnpm --filter @palhatch/web test -- auth page states-and-navigation
pnpm --filter @palhatch/web test:e2e --grep "login|binding|data status"
```

### Step 3：Pal 列表

- 迁移三种范围、服务端筛选、稳定分页 context、Boss/公会所有/位置诚实降级和共享开关。
- 再按独立契约/RPC 小阶段补计划占用/稀有被动字段。

验证：

```bash
pnpm --filter @palhatch/web test -- pals
pnpm --filter @palhatch/web test:e2e apps/web/e2e/phase5.spec.ts
```

### Step 4：配种器与路线结果

- 先迁移表单，保留固定输入和创建 payload。
- 再迁移真实任务阶段、轮询恢复、最多三条路线、ready/fallback、父母/缺口、评分、AI 降级与采用。
- 不展示精确遗传概率，不允许 `needs_inventory` 路线采用。

验证：

```bash
pnpm --filter @palhatch/web test -- breeder breeder-csp
pnpm --filter @palhatch/web test:e2e apps/web/e2e/phase6.spec.ts
```

### Step 5：计划中心与详情

- 迁移全部状态筛选、稳定 cursor、当前步骤优先、候选、人工动作、失效、重算和历史版本。
- 保持乐观并发和 idempotency，不做自动确认。

验证：

```bash
pnpm --filter @palhatch/web test -- plans
pnpm --filter @palhatch/web test:e2e apps/web/e2e/phase7.spec.ts
```

### Step 6：管理员展示层

- 迁移现有 overview/binding/save-parser/catalog/jobs/settings 页面。
- 只展示当前 RPC 数据和现有白名单动作；不实现原型中的存档删除/恢复/云同步/清缓存。

验证：

```bash
pnpm --filter @palhatch/web test -- admin
pnpm --filter @palhatch/web test:e2e apps/web/e2e/phase8.spec.ts
```

### Step 7：旧样式清理与最终回归

- 用引用检查逐批删除旧全局类和未使用展示组件。
- 如果只改 Web 展示层，运行一次最终 Web 全覆盖；如果改了 `packages/ui`、contracts 或 migration，则改用根 `pnpm check` 并补 Supabase/契约检查。

验证：

```bash
pnpm --filter @palhatch/web lint
pnpm --filter @palhatch/web typecheck
pnpm --filter @palhatch/web test
pnpm --filter @palhatch/web build
pnpm --filter @palhatch/web test:e2e
git diff --check
```

契约/RPC 小阶段额外验证：

```bash
pnpm contracts:generate
pnpm contracts:check
supabase db reset
supabase test db
pnpm check
git diff --check
```

## 13. 风险与回滚

| 风险 | 控制 | 回滚 |
| --- | --- | --- |
| 原型诱导虚假功能/数据 | 原型仅作视觉参考；字段必须来自共享契约 | 删除未接业务的展示，不迁移数据库事实 |
| Server/Client 边界倒退导致会话泄漏/跨用户缓存 | 保持 server query、`noStore`、private/no-store 和 RLS | 恢复上一页面组件和 Route Handler |
| 大组件改写丢失轮询、状态机或乐观并发 | 先抽交互 controller，再替换 view；逐页测试 | 逐文件恢复旧 view，保留 server/API |
| 位置或公会数据泄漏 | 只加最小 projection；跨公会 pgTAP/E2E | 回退新增 projection/RPC 调用，字段 nullable |
| 历史固定计划被新 UI 误算 | 只读展示物化结果和 version pin，不在浏览器重算 | 回退到现有详情组件 |
| 资产许可/体积/移动性能 | 记录来源，使用响应式优化资产，不使用目录制品携带游戏资产 | 移除新资产并恢复无图安全占位 |
| shadcn 依赖一次性膨胀 | 按真实组件增量安装 | 删除未使用组件/依赖并恢复 lockfile 对应变更 |
| Node 版本漂移 | CI/正式验证使用仓库要求的 Node 22.x | 以 Node 22 结果为发布门禁 |
| 用户未提交原型被覆盖 | 始终保持 `docs/ui-reference/` 原样未跟踪 | 不对该目录执行清理、暂存或覆盖 |

回滚单位应是“一个页面或一个基础组件小阶段”，不修改历史 migration，不删除业务表，不改变 Agent/Palworld。Git 回滚前必须先检查并保留用户工作区改动。

## 14. 基线验证结果

执行环境：

- pnpm `9.15.4`
- 当前 Node `v26.3.0`
- 仓库 `engines.node` 要求 `22.x`

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `pnpm --filter @palhatch/web lint` | 通过 | ESLint 0 warning；pnpm 报 Node engine 警告 |
| `pnpm --filter @palhatch/web typecheck` | 通过 | `tsc --noEmit` |
| `pnpm --filter @palhatch/web test` | 通过 | 11 files、54 tests 全部通过；Node 26 有 `module.register()` 弃用和 localStorage 实验性警告 |
| `pnpm --filter @palhatch/web build` | 通过 | Next.js 15.5.20 编译、lint/type validity、静态/动态路由收集全部成功；读取现有 `.env.local` 但未查看或输出其内容 |
| `git diff --check` | 通过 | 本步骤最终内容检查无 whitespace error |

基线没有业务失败，不需要也没有修改业务代码来掩盖问题。环境阻塞项是 Node 版本不符合仓库声明；虽然本次命令通过，正式 UI 迁移和发布门禁应在 Node 22.x 重跑。
