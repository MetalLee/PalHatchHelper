# Phase 4 真实数据人工验收前置报告

- decision: `pending`
- 使用范围：`private_internal_use`
- 执行日期：2026-07-15
- 执行分支：`agent/phase-4-real-data-acceptance`
- 当前结论：`blocked`
- 稳定错误标识：`REAL_BASE_CATALOG_MISSING`

## 决策摘要

本地测试 Supabase 中不存在可用于当前真实 Palworld world 的 published 基础游戏目录。固定 PalCalc `db.json` 也无法从明确源事实完整生成现有 Catalog Schema 和数据库发布门禁要求的基础目录，因此本次在基础目录门禁处停止。

没有注册或启用 Upload Source，没有执行 `prepare-breeding-source`、真实 candidate `validate`、`stage`、`diff`、`publish`、`rollback` 或 `warm-cache`。没有创建最终配种候选，也没有修改 Phase 4 状态或开始 Phase 5/6 工作。

## 固定来源与完整性

| 字段                        | 值                                                                 |
| --------------------------- | ------------------------------------------------------------------ |
| 来源项目                    | Pal Calc                                                           |
| repository                  | `tylercamp/palcalc`                                                |
| commit                      | `b822c7fda4f019bd7c57f45437f14a74061a29bc`                         |
| commit 时间                 | `2026-07-14T16:10:08Z`                                             |
| commit message              | `Bump beta version`                                                |
| PalCalc application version | `v1.17.6-beta2`                                                    |
| PalCalc database version    | `v26`（由固定 `db.json` 顶层 `Version` 字段复核）                  |
| license                     | MIT，Copyright 2024 Tyler Camp                                     |
| `LICENSE.txt` SHA-256       | `60768557719376acb654991ff138d1b6ce5e9bf872582566b3f82b22e51ad5a4` |
| `db.json` SHA-256           | `803d891afdb18bd00e24332844a7276bbe5c0855170ef90ef142f2f4d7698ed1` |
| `breeding.json` SHA-256     | `1af1e4d6b461599ec3b80a2195002337ff484ed3c28ce57e27def96138262ec2` |

下载只使用固定 commit URL：

- `https://raw.githubusercontent.com/tylercamp/palcalc/b822c7fda4f019bd7c57f45437f14a74061a29bc/LICENSE.txt`
- `https://raw.githubusercontent.com/tylercamp/palcalc/b822c7fda4f019bd7c57f45437f14a74061a29bc/PalCalc.Model/db.json`
- `https://raw.githubusercontent.com/tylercamp/palcalc/b822c7fda4f019bd7c57f45437f14a74061a29bc/PalCalc.Model/breeding.json`

未使用 `main`、`latest`、release 浮动链接或远程 Catalog Source。三个原始文件保存在 Agent 自有且被 Git 忽略的目录 `data/game-catalog/extraction/raw/palcalc/b822c7fda4f019bd7c57f45437f14a74061a29bc/`。

## 当前 Palworld 版本事实

| 字段                      | 值                                                                 |
| ------------------------- | ------------------------------------------------------------------ |
| Steam App ID              | `2394010`                                                          |
| Steam Build ID            | `24088465`                                                         |
| 当前 Palworld 游戏版本    | `v1.0.0.100427`                                                    |
| appmanifest `LastUpdated` | `2026-07-10T16:54:33Z`                                             |
| appmanifest SHA-256       | `5dd1c163956fb8aff7ae7c0bc2e2ef1ed38ccb594919d3cc58d1ac1674a49b8c` |

Build 映射方法：

1. 只读读取 `/opt/palworld/data/steamapps/appmanifest_2394010.acf` 中的 `appid`、`buildid`、`LastUpdated` 和 `StateFlags`，得到已安装 Build ID `24088465`。
2. 只读过滤当前 `palworld` 容器日志中的启动版本行，进程明确上报 `Game version is v1.0.0.100427`。
3. 使用 [SteamDB Dedicated Server depot 2394011](https://steamdb.info/depot/2394011/) 交叉核对 Build ID `24088465` 及其 2026-07-10 public update；SteamDB 仅作交叉证据，游戏版本值来自本机进程自报。

没有对 `palworld` 容器执行 `docker exec`、RCON、Steam update 或游戏二进制启动，没有停止、重启、更新或修改 Palworld/mihomo 容器，也没有读取生产凭证或修改 `/opt/palworld` 文件。

## 本地 Supabase 基础目录检查

检查对象由仓库 `supabase/config.toml` 明确标识为 `pal-hatch-helper-local`，API/DB 均为本机回环端口；未使用 linked 项目或生产 Supabase。

检查时唯一 published 目录如下：

| 字段                                    | 值                                                                 |
| --------------------------------------- | ------------------------------------------------------------------ |
| version ID                              | `51000000-0000-4000-8000-000000000001`                             |
| status                                  | `published`                                                        |
| `game_build_id`                         | `NULL`                                                             |
| `game_version`                          | `fixture-v1`                                                       |
| `content_hash`                          | `cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc` |
| `package_hash`                          | `cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc` |
| extractor                               | `legacy-breeding-data@phase2`                                      |
| Pal / 被动 / 主动技能                   | `8 / 3 / 0`                                                        |
| Pal-主动技能 / 伙伴技能 / 本地化 / 配种 | `0 / 0 / 6 / 0`                                                    |
| world                                   | `fixture-world-local` / `Fixture Local World`                      |

该版本是 seed fixture，不含真实 `game_build_id`，六类基础投影不完整，world 也不是当前 Palworld world，不能作为真实 base catalog。

## 从固定 `db.json` 生成基础目录的门禁结果

只读结构检查得到：

| 源集合           | 数量 | 可用于现有投影的结论                                                                                         |
| ---------------- | ---: | ------------------------------------------------------------------------------------------------------------ |
| `Pals`           |  299 | 含内部名、图鉴号、稀有度、配种力和本地化，但没有 Pal 元素字段；现有 `CatalogPal.element_types` 要求至少 1 项 |
| `PassiveSkills`  | 1905 | 含内部名、rank、名称/描述本地化等明确事实                                                                    |
| `ActiveSkills`   |  320 | 含内部名、元素、power、cooldown 和名称本地化                                                                 |
| Pal→主动技能关系 |    0 | `db.json` 不存在可证明 Pal、主动技能、学习等级与 exclusive 关系的字段                                        |
| `PartnerSkill`   |    0 | 299 个 Pal 的 `PartnerSkill` 全部为 `null`                                                                   |

另有三个不可绕过的问题：

1. 数据库 `finalize_catalog_import` 要求七类 counts 均大于 0，`publish_game_data_version` 又明确要求 `catalog_pal_active_skills` 和 `catalog_partner_skills` 非空。
2. 固定 `db.json` 只声明 `Version=v26`，没有声明它对应的 Palworld `game_build_id=24088465` 或 `game_version=v1.0.0.100427`，不能仅凭 commit 时间假定兼容。
3. 当前 Parser fixture 保留游戏原始 PascalCase ID（例如 `Lamball`、`Artisan`），Catalog/配种 Schema 则要求小写 stable ID。仓库没有经批准的 PalCalc `InternalName` 到 Parser/Catalog ID 映射策略；任意 lower-case、slug 或别名转换都会制造未证明的关系。

因此不能通过空文件、假关系、fixture 复制、猜测元素、任意 ID 转换或放宽历史迁移来生成基础目录。基础目录准备以 `REAL_BASE_CATALOG_MISSING` 停止。

## 版本、候选与供应链结果

| 要求字段              | 结果                                                       |
| --------------------- | ---------------------------------------------------------- |
| 基础目录 version ID   | 未创建；本地 published 版本仅为不可用 fixture              |
| 基础目录 content hash | 未生成；不能把 `db.json` 文件哈希冒充 Catalog content hash |
| 基础目录 package hash | 未生成；没有形成符合现有语义的真实标准化包                 |
| 候选 version ID       | 未创建                                                     |
| 候选 content hash     | 未生成                                                     |
| candidate status      | 未进入 `validated`；candidate 不存在                       |
| rollback version ID   | 未产生；没有发布或切换任何 world 指针                      |
| Upload Source UUID    | 未注册；基础目录门禁失败后停止                             |

执行状态：

| 步骤                                            | 结果         |
| ----------------------------------------------- | ------------ |
| 注册并启用 Upload Source                        | 未执行       |
| `prepare-breeding-source`                       | 未执行       |
| `catalog validate`（真实 normalized candidate） | 未执行       |
| `catalog stage`                                 | 未执行       |
| `catalog diff`                                  | 未执行       |
| 最终 candidate publish                          | 禁止且未执行 |
| 本地测试基础目录 publish                        | 未执行       |

`validate` 结果：真实 normalized candidate 不存在，因此没有可声称通过的 Catalog validation report。

`diff` 摘要：没有 candidate version，未执行 diff，活动 world 指针未改变。

## 配种数据与人工抽样

固定 `breeding.json` 顶层包含 `Breeding` 44851 条原始记录和 `MinBreedingSteps` 299 项。由于真实基础目录、经批准的 stable ID 映射及 build/version 绑定均不存在，本次没有进入配种转换；下列 candidate 指标不能安全计算或声称完成：

- 总导入配方数：未产生。
- 排除的性别相关配方数：未产生 validation report，不能把未绑定 ID 的原始分组统计冒充候选排除数。
- 冲突数：未产生 validation report。
- 反向对应证明：未执行。
- 10 条“原始记录 → 转换后记录”人工抽样：未生成。生成这些记录需要先确定真实 base catalog 和 stable ID 映射；当前输出任何转换后 ID 都会违反“不猜测、不伪造”的门禁。

这五项是本次验收的明确未满足项，而不是空值占位。原始第一条记录仅用于结构检查：`ElecSnail/WILDCARD + FlowerDinosaur/WILDCARD -> IceDeer`；它没有被写入任何候选。

## 测试命令与结果

| 命令/检查                                          | 结果                                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 固定三文件下载、`git check-ignore -v`、`sha256sum` | 通过；三文件均命中 `data/game-catalog/` ignore 规则，哈希如上                                                                                 |
| 本地 Supabase published/validated 目录投影查询     | 失败门禁；只发现 fixture，触发 `REAL_BASE_CATALOG_MISSING`                                                                                    |
| 固定 `db.json` 结构与字段完整性检查                | 失败门禁；缺 Pal 元素、Pal-active skill、partner skill 事实                                                                                   |
| `uv run pytest tests/breeding -q`                  | 通过，`38 passed`                                                                                                                             |
| `uv run python scripts/verify_reproducibility.py`  | 未运行成功；计划引用的脚本不存在。等价确定性回归文件 `tests/breeding/test_reproducibility.py` 已包含在上述 38 条通过测试中                    |
| `pnpm check`                                       | 失败；Node/TS 检查、Vitest、Next build、Ruff、mypy 均通过，Agent pytest 因当前内核缺少 Landlock ABI 3 得到 `10 failed, 139 passed, 1 skipped` |
| `uv run ruff check .`                              | 通过                                                                                                                                          |
| `uv run ruff format --check .`                     | 通过，113 files formatted                                                                                                                     |
| `uv run mypy src`                                  | 通过，65 source files 无问题                                                                                                                  |
| `uv run pytest -q --tb=line`                       | 失败，`10 failed, 139 passed, 1 skipped`；全部失败为 `PARSER_SANDBOX_FAILED`，只读探针确认 Landlock ABI 查询返回 `ENOSYS`                     |
| `supabase db lint`                                 | 通过，No schema errors found                                                                                                                  |
| `supabase test db`                                 | 通过，9 files、`217/217` tests                                                                                                                |
| 显式回环 integration lifecycle                     | 通过，`1 passed`；测试自身确认 URL hostname 为 loopback                                                                                       |

测试环境准备说明：宿主机最初没有 `uv` 且只有 Node 24。验证使用临时目录 `/tmp/palhatch-tools` 中的 `uv 0.11.28`、其管理的 CPython 3.12.13，以及现有 `n` 缓存中的 Node 22.23.1。`pnpm install --frozen-lockfile` 首次因宿主机用户级腾讯 npm 镜像 TLS reset 失败，随后只对该安装命令使用 `https://registry.npmjs.org` 成功；未修改全局代理、npm 配置或 lockfile。

真实数据专属测试（固定下载哈希、重复转换 content hash、父母交换、冲突排除、性别多结果保留、所有引用 ID 属于 base、normalized 校验、candidate=`validated`）没有新增伪造测试来制造通过。现有 Phase 4 fixture 测试通过只能证明既有算法/供应链行为，不能替代缺失的真实 base 和 candidate。

## 资产与安全确认

- 没有提交或暂存第三方原始数据、游戏包、图标、模型、音频、游戏二进制或真实存档。
- 原始 PalCalc 文件只存在于被 Git 忽略的 Agent 数据目录。
- 没有修改 `/opt/palworld`、Palworld Compose、容器、文件权限或存档。
- 没有停止、重启或更新 Palworld 和 mihomo。
- 没有连接生产 Supabase、读取生产密钥或访问真实服务器凭证。
- 没有开放新端口、设置系统全局代理或 Docker daemon 全局代理。
- 没有执行最终 candidate publish，也没有创建 commit 或推送远程仓库。

## 已知限制与解除阻塞条件

当前阻塞项：

1. `REAL_BASE_CATALOG_MISSING`：需要一个对应 Build `24088465` / 游戏版本 `v1.0.0.100427` 的真实 published 基础目录。
2. 该基础目录必须从可审计来源真实提供 Pal 元素、Pal→主动技能、伙伴技能及其本地化关系，不能用 PalCalc 当前 `db.json` 猜测或补齐。
3. 需要批准并测试 Parser、Catalog、PalCalc `InternalName` 三者之间的稳定 ID 映射。
4. 需要来源自身或独立权威证据证明 PalCalc DB v26 与上述精确 Palworld build/version 对应。
5. 解除基础门禁后，才可实现/运行性别多结果排除报告、逐条反向证明、10 条稳定抽样、真实 content-hash 重复性测试以及 Upload Source 的 prepare → validate → stage → diff 流程。
6. 完整 `pnpm check` 还受当前验证宿主机缺少 Landlock ABI 3 阻塞；应在支持 Landlock ABI 3 的 Linux 测试环境重跑，不应放宽 Parser sandbox 测试。

人工不得把 `decision` 改为通过，除非以上事实、候选 `validated` 状态和全部要求测试均有真实证据。Phase 4 继续保持 `real_data_acceptance=pending`、`production_publish=blocked`。
