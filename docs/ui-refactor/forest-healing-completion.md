# Forest Healing UI 重构完成报告

## 1. 最终 HEAD 和分支

- 分支：`refactor/forest-healing-ui`
- 本轮收尾开始时 HEAD：`2439506c73e0f9b21a16198e5fc865111ca221a7`
- 最终交付 HEAD：本报告所在提交；实际 SHA 以交付输出中的
  `git rev-parse HEAD` 为准。Git 提交哈希无法写入它自身所包含的文件。
- 对比基线：`main` 的 merge-base
  `4a4da8876c1534b1e9b4398a13b85bc2da6c1bd0`

本轮没有 push、创建 PR 或部署，也没有修改 `/opt/palworld`、Palworld
Compose、Palworld/mihomo 容器或真实存档。

## 2. 页面完成清单

| 页面                    | 完成状态 | 核查重点                                              |
| ----------------------- | -------- | ----------------------------------------------------- |
| `/login`                | 完成     | 单一 `h1`、真实登录、森林留白与玻璃登录卡             |
| `/overview`             | 完成     | CSS 风景 Hero，不出现 Pal；指标和状态均来自服务端数据 |
| `/pals`                 | 完成     | 真实库存、过滤、稳定分页、共享开关与错误状态          |
| `/breeder`              | 完成     | 真实目录选项、被动 Rank、创建请求与固定版本摘要       |
| `/breeder/jobs/[jobId]` | 完成     | 恢复/轮询、路线比较、AI 降级、真实 Rank 与配种树      |
| `/plans`                | 完成     | 真实查询页指标、状态 Tabs、分页和计划摘要             |
| `/plans/[planId]`       | 完成     | 推进/暂停/恢复/失效/重算、候选确认和完整计划树        |
| `/data-status`          | 完成     | 真实同步、安全和目录状态                              |
| `/account`              | 完成     | 真实账号/绑定信息和退出操作                           |
| `/admin`                | 完成     | 管理摘要、快捷入口和真实审计信息                      |
| `/admin/bindings`       | 完成     | 绑定创建、修改、解除和明确确认                        |
| `/admin/save-parser`    | 完成     | 只读同步/Parser 状态与受审计操作                      |
| `/admin/breeding-data`  | 完成     | 固定目录、内部滚动表格和版本操作                      |
| `/admin/jobs`           | 完成     | 任务、AI 与真实诊断操作                               |
| `/admin/settings`       | 完成     | 版本化设置，不展示或编辑秘密                          |

所有工作区页面使用同一顶部导航；移动端使用右侧 Sheet。不存在侧栏或底部导航。
导航和性别展示使用 Lucide，不再用几何或性别 Unicode 字符充当图标。

## 3. 设计系统组件清单

- 导航与布局：`SiteHeader`、`AppNavigation`、`MobileNavigation`、`AppShell`
- 页面层级：`PageHero`、`ForestScenery`、`MetricCard`
- Pal 信息：`PalPortrait`、`PassiveBadge`、`StatusChip`
- 状态：`PageLoading`、`PageEmpty`、`PageError`
- 树：`BreedingRouteTree`、`BreedingTreeNode` 及计划步骤 overlay
- shadcn/ui：Alert、AlertDialog、Avatar、Badge、Button、Card、DropdownMenu、
  Input、Label、Progress、Select、Sheet、Switch、Table、Tabs 等
- Token：天蓝、森林绿、叶绿、玻璃表面、统一圆角、阴影、焦点环和 reduced-motion

`globals.css` 现在为 144 行，只保留 Tailwind 入口、Token、全局基础、焦点与
`prefers-reduced-motion`。页面和复杂组件样式由 Tailwind class、shadcn 组合及少量
共享 class 常量承载，没有新增巨型 stylesheet。

## 4. 被动 Rank 数据来源

Rank 与负面标记都来自任务或计划固定的目录版本：

`catalog_passive_skills.rank / is_negative`
→ 固定版本 RPC projection
→ Phase 6/7 JSON Schema
→ 生成的 TypeScript/Python 契约
→ 页面 `passiveFacts`
→ `PassiveBadge`

新增迁移
`supabase/migrations/20260725010000_ui_passive_rank_projection.sql`
为配种任务 localization 和执行计划 summary 投影 `rank`、`is_negative`。前端不再
传入 `null` 或按名称猜 Rank；目录负面标记也不再依赖负数 Rank。

## 5. 配种树实现方式

配种结果继续使用固定数据版本和确定性算法返回的 `BreedingRoute`。树构建器将路线
步骤转换为稳定 occurrence/entity 模型，`BreedingRouteTree` 再展示库存亲本、中间
子代、最终目标、被动来源、缺失项和步骤连接。树只表达后端给出的合法配方，不生成
配种事实、不改变路线评分，也不让 AI 决定配方合法性。

窄屏时只有树区域自身允许横向滚动，整页保持不溢出。

## 6. 计划树复用方式

`buildPlanBreedingTree` 把已采用路线、真实计划步骤和候选状态适配到同一树模型；
`buildPlanStepOverlays` 注入完成、当前、待开始、候选和失效状态。计划详情直接复用
`BreedingRouteTree`、`BreedingTreeNode` 和被动 facts，不维护第二套树 UI 或配种
算法。

## 7. 已删除的 legacy 代码

产品组件和 `globals.css` 已移除以下 legacy class 及同类页面样式：

- `desktop-sidebar`、`mobile-bottom-nav`、`side-nav-link`
- `admin-topbar`、`admin-navigation`
- `primary-button`、`secondary-button`
- `content-panel`、`stat-card`、`pal-card`、`passive-chip`
- `route-tab`、`login-card`
- `page-stack`、`page-header`、`detail-grid`、`state-card`
- `admin-card`、`admin-grid`、`admin-kv`、`admin-actions`
- `admin-form-grid`、`admin-inline-form`、`admin-action-stack`
- `admin-table-wrap`、`admin-nav-scroll`

新增 `legacy-ui-removal.test.ts` 防止这些 class selector 或禁用几何导航字符重新进入
产品源码。源目录 grep（排除 `.next` 和 `node_modules`）无
`desktop-sidebar|mobile-bottom-nav|side-nav-link` 或 `◫|◇|△|□` 命中。

## 8. 未实现的原型虚假功能

根据正式规格，没有实现原型中无真实后端闭环的注册、拖放上传、手工上传存档、
备份恢复、通知中心、虚构成功率/趋势图、清缓存、随意编辑秘密、自动推进计划等功能。
界面没有为这些内容保留可点击的死按钮；已有按钮均对应真实导航、请求或明确的受审计
动作。

## 9. 测试命令和结果

### 失败先行与局部验证

- 新增 legacy、heading 与真实 Rank 断言后，目标测试最初出现 5 个真实失败；完成
  最小实现后，6 个相关文件共 65 项通过。
- 色彩 Token 检查发现白字/旧 destructive 为 `4.42:1`；轻微加深后为 `4.59:1`。
  其他核心前景组合为 `5.11:1` 至 `11.32:1`。
- 管理端目录 select 最初只有 `28×44px`；改为最小 `44×44px` 后浏览器复验通过。
- `pnpm --filter @palhatch/web test -- admin.test.tsx`：6/6 通过。

### 数据库

- `supabase test db supabase/tests/phase6_breeder.sql supabase/tests/phase7_execution_plan_behavior.sql`：
  2 个文件、96 项通过。
- 本地 Supabase reset、全部迁移与 seed 成功。

### 浏览器业务回归

pnpm 9 会把用户给出的额外 `--` 作为 Playwright 的字面参数，因此实际使用不带额外
`--` 的等价命令：

- `pnpm --filter @palhatch/web test:e2e phase5.spec.ts`：7/7 通过。
- `pnpm --filter @palhatch/web test:e2e phase6.spec.ts`：1/1 通过。
- `pnpm --filter @palhatch/web test:e2e phase7.spec.ts`：2/2 通过。
- `pnpm --filter @palhatch/web test:e2e phase8.spec.ts`：2/2 通过。

覆盖登录、未绑定状态、过滤/分页、共享、安全响应、任务创建与轮询、路线比较、AI
降级、路线采用、计划推进/确认/失效/重算和管理员权限。

### 最终聚合验证

最终验证使用仓库要求的 Node `22.23.1`：

- `contracts:generate`：通过。
- `format:check`：通过。
- 全仓 lint、typecheck：通过。
- 全仓 JavaScript/TypeScript 测试：通过；Web 16 个文件、103 项通过。
- 全仓 build：通过；Next.js production build 成功。
- Agent Ruff、Ruff format、Mypy：通过。
- Agent pytest：244 通过、4 跳过、3 个 fixture error。唯一原因是宿主环境缺少
  `gcc`，无法编译临时 Oodle ABI test shim；失败用例为
  `test_palhatch_plm_parser.py` 中的 3 项编译器相关测试。
- `test:production-backup`：通过。
- `test:production-data`：宿主无非交互 sudo；改在 `--network none`、只读仓库挂载、
  一次性 root 容器中运行并通过。
- `test:production-deploy`：同一隔离方式运行并通过。
- `check:structure`：20 个路径通过。
- `check:forbidden-assets`：通过。
- `scan:secrets`：656 个 Git 可见文件通过。
- `git diff --check`：通过。

因此 `pnpm check` 总命令的退出码仍为 1，未通过范围仅为上述 3 个需要 `gcc` 的
Agent parser 测试。正确的完整复验方式是在安装 `gcc`（Debian/Ubuntu 可安装
`build-essential`）且具有测试所需本地权限的 Node 22 环境重新运行 `pnpm check`。

## 10. 截图路径

截图位于被 `.gitignore` 排除的临时目录：

- `artifacts/ui-refactor/1440x900/`
- `artifacts/ui-refactor/1024x768/`
- `artifacts/ui-refactor/390x844/`
- 自动审计摘要：`artifacts/ui-refactor/audit-summary.json`

每个尺寸包含 login、overview、inventory、breeder-create、
breeder-result-tree、plans、plan-detail-tree、data-status、admin，共 27 张 PNG。
视觉检查覆盖色调、间距、圆角、导航、信息层级、文字、适量毛玻璃、响应式和树结构；
没有用截图像素比较替代业务断言。

移动浏览器脚本还检查了全部 15 个路由：

- `document.documentElement.scrollWidth <= window.innerWidth + 1` 全部通过。
- 每页恰好一个 `h1`。
- 无可见未标注输入或未命名按钮。
- Sheet 键盘打开、焦点进入、Escape 关闭和焦点返回通过。
- Sheet 内恰好一个 `aria-current="page"`。
- reduced-motion 生效。
- 原生小控件由至少 44px 的 label 或 switch 伪元素命中区承载。

## 11. 尚存风险

1. 宿主缺少 `gcc`，3 个与本次 UI 无关但属于全仓门禁的 Oodle ABI parser 测试未完成。
2. 本地 Supabase fixture 不包含受版权约束的测试 Pal 图标，开发服务器会记录图标
   404；`PalPortrait` 会稳定降级为编号/首字 fallback，且已有单元测试。禁用资产检查
   因此保持通过。
3. 当前计划 projection 未提供所有初始库存亲本的物种目录事实；计划树明确显示
   “固定库存亲本”，不会猜测物种。
4. Chromium 三尺寸检查不能替代真实 iOS Safari、屏幕阅读器和生产数据量验收。
5. 截图目录是临时且不提交的产物，清理工作区后需要重新生成。

## 12. 部署前检查清单

- [ ] 在 Node 22、pnpm 9.15.x 且已安装 `gcc` 的环境运行完整 `pnpm check`。
- [ ] 以具备测试用 root/chown 权限的隔离环境复跑生产数据与部署就绪回归。
- [ ] 对目标 Supabase 环境执行备份并审核待应用迁移，尤其是被动 facts projection。
- [ ] 在本地 Supabase 重跑 Phase 6/7 pgTAP 和 Phase 5–8 E2E。
- [ ] 用真实但非生产秘密的预发布环境检查登录、绑定、任务、计划和管理员权限。
- [ ] 在真实 iPhone Safari 与键盘/屏幕阅读器上复核导航、Dialog、Sheet 和树滚动。
- [ ] 检查生产允许的 Pal 图标资产来源与许可；不得提交游戏原始资产。
- [ ] 确认健康接口仍仅绑定 `127.0.0.1:18765`，不新增公网端口。
- [ ] 再次确认不修改 `/opt/palworld`、真实存档或现有 Palworld Compose。
- [ ] 获得对应阶段明确批准后才能 push、创建 PR 或部署。
