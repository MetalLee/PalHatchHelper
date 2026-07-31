# PalHatchHelper v1 生产发布记录

## 2026-07-31 Catalog 2.0 目录更新

- Git SHA：`6d9c5cba9ae8b731a417cb4b87e154cb19d38879`
- Supabase migrations：`20260730010000_support_windows_sync_devices.sql`、
  `20260731010000_catalog_v2_entity_types.sql`、
  `20260731011000_catalog_v2_item_projection.sql`、
  `20260731020000_item_inventory_history.sql`
- Agent 镜像：
  `ghcr.io/metallee/palhatch-agent:6d9c5cba9ae8@sha256:44acb5cfae462fcee52f4792dfa84fa0ec3ad9f3217dbdebedeedf151e9743fb`
- Vercel deployment：`dpl_791t2CEQnEsJZScW3s117bZxbAHv`
- Vercel deployment URL：`https://pal-hatch-helper-38bfurvdg-devil-s-claw.vercel.app`
- 生产域名：`https://www.palbeacon.app`
- 生产 deployment record：`1e141522-351f-48fb-abbe-1dd634273fe4`

活动目录版本：

- version：`f13af131-539f-4635-8c5f-fb24a79b993c`
- content hash：`80edbc5491cbc96ac8f697f99dc8bc8028a7a98f76e450d783fdca08e56524b7`
- package hash：`0f23bb1ffc629ea3a91ba83c706280a230a3933ed328e62ff3dd654c16b3d1d2`
- Build：`24466863`
- 游戏版本：`v1.0.2.101103`
- Schema：`2.0.0`

| 实体              |  数量 |
| ----------------- | ----: |
| pals              |   288 |
| passive_skills    |   115 |
| active_skills     |   227 |
| pal_active_skills |  2200 |
| partner_skills    |   287 |
| breeding_recipes  | 41617 |
| items             |  1891 |
| item_recipes      |  1264 |
| localizations     | 27762 |

上传归档的 SHA-256 为
`72f342d5abc51179869b6c9a4f790342f540a172fa1dd8093fedc83aa0bf6755`。原始归档完整保留；
入库前发现提取器以旧 `1.1.0` schema 计算了 Catalog 2.0 的 content hash，因此只重新计算
`manifest.json`、`validation-report.json` 和 `extraction-summary.json` 中的派生 hash 字段，
九个 JSONL 及其 checksums 未改动。生产校验报告为零错误、零警告，九类投影计数与 manifest
完全一致；新旧 `breeding-recipes.jsonl` 的 SHA-256 都是
`fe174cc6c3c106fbca966de66995b157c3541f4f7e46092f0da084901762ab04`。

Agent 的 `api`、`job-worker` 和 `command-worker` 已切换到新不可变镜像，并通过非 root、能力删除、
禁止提权、资源限制、回环端口、只读存档挂载、连续健康和日志秘密检查。按本次发布约定，
`save-worker` 故意保持停止，未重建、未启动、未测试，后续由 `palbeacon-cli` 替代存档同步。
Web 的 Git 自动生产部署已指向相同 Git SHA，健康接口、公开页面、私有页面跳转与私有缓存头烟测通过。

本次备份与安全边界：

- 生产备份：`/data/projects/PalHatchHelper/data/backups/20260731T041034Z/`，权限 `0700`
- 上一目录版本：`b5feaeb9-5480-4ba5-b30d-a4c65531787e`
- `/opt/palworld/docker-compose.yml` SHA-256：
  `b19bc318e63c2c844b183d15ede232ae61d0d3adc56e012b3b5b37ff6c5a83ff`
- 目标 appmanifest SHA-256：
  `f1c8d57e77c68cd45ea9e8362444fb2e277d98da0c8006e9acca28d0962f3b69`

部署前后 81 个源存档文件的组合 SHA-256 保持
`709601a5833876ab25afd8910fadfb581b21b9156a683febeff6755f16364acc`。Palworld 和 mihomo
容器身份不变且重启计数均为 0；未修改 `/opt/palworld`、未操作真实存档、未停止或重启这两个容器，
也未开放新的公网 Agent 端口。

## 2026-07-27 路线去重与计划收藏更新

- Git SHA：`c67b511bbcb49a0f58a712ca4b60f39d8fde1d3e`
- Supabase migrations：`20260727010000_saved_breeding_plans.sql`、
  `20260727020000_remove_execution_plan_surfaces.sql`、
  `20260727030000_drop_execution_plan_rpcs.sql`
- Agent 镜像：
  `ghcr.io/metallee/palhatch-agent:c67b511bbcb@sha256:71e213e30b049c13be746acd9cd4a213076e2782e8ff6bb4cc97a144abd6e15f`
- Vercel deployment：`dpl_68SdQGmi3eH4ZTAsTJoJ2hDPhEP6`
- Vercel deployment URL：`https://pal-hatch-helper-95w198a6p-devil-s-claw.vercel.app`
- 生产域名：`https://www.palbeacon.app`；项目 Node.js 已固定为 `22.x`
- 生产 deployment record：`bea26940-8faa-450f-9320-d65624ad061f`

Supabase dry-run 只列出上述三条迁移，应用后 local/remote migration list 一致。生产烟测确认
收藏表和新 RPC 可用、四个 v5 评分配置激活、旧执行计划为零且旧列表 RPC 已移除。旧计划数据按
已批准需求删除，不做转换。

四个 Agent 服务已切换到新不可变镜像，并通过非 root、只读存档挂载、资源/PID 限制、回环端口、
连续健康与日志秘密检查。Vercel 健康响应返回完整本次 Git SHA；登录页、未登录计划重定向和计划
API 私有缓存头烟测通过。

本次备份与回滚引用：

- 生产备份：`/data/projects/PalHatchHelper/data/backups/20260726T192631Z/`，权限 `0700`
- 上一 Agent 镜像：
  `ghcr.io/metallee/palhatch-agent:37094571cd58@sha256:e101d46d7b9d1fde07171aba49e768bd996154bd64e6ea1e360e681e7bee1c56`
- 上一 Vercel deployment：`dpl_DpwukS8iC6o3VYrUNYLPxda2oVZd`

部署前后 `/opt/palworld/docker-compose.yml`、目标 appmanifest、Palworld/mihomo 容器身份与重启计数、
以及 230 个源存档文件的 SHA-256 清单完全一致。没有修改或重启 Palworld、mihomo，也没有开放
新的公网 Agent 端口。

## 2026-07-20 首次发布

发布日期：2026-07-20（Asia/Shanghai）

## 发布标识

- 部署 Git SHA：`78355c8aa279e6abd5526917a9a1305f3bbd0d87`
- Supabase 最新 migration：`20260720010000_allow_terminal_breeding_job_recreation.sql`
- Agent 镜像：`ghcr.io/metallee/palhatch-agent:78355c8@sha256:9e5959db53875c4894847a795f0a3a29a93f569c6aec62af66b9875214b78a65`
- Vercel deployment：`dpl_B1H2MzVqa9oYr62WpLEwNniNA5CB`
- Vercel deployment URL：`https://pal-hatch-helper-6nct4mnqp-devil-s-claw.vercel.app`
- 生产域名：`https://pal-hatch-helper-web.vercel.app`

## 数据库与目录

Supabase dry-run 只列出 `20260720010000`，应用后 local/remote migration list 一致。生产权限烟测确认 admin 可调用管理员 RPC，普通玩家得到稳定的 `ADMIN_ACCESS_DENIED`。

活动目录版本：

- version：`b5feaeb9-5480-4ba5-b30d-a4c65531787e`
- content hash：`872e4a79af5b5043ee97d9a4287a41bba407afc96ff3b0a6de56fff827d334b3`
- package hash：`8c36cb60e4f78c3e4c7681cde602539b4b85f160d26392ed0144f728c6f191a9`
- Build：`24181105`
- 游戏版本：`v1.0.1.100619`

七类计数：

| 实体              |  数量 |
| ----------------- | ----: |
| pals              |   288 |
| passive_skills    |   115 |
| active_skills     |   227 |
| pal_active_skills |  2200 |
| partner_skills    |   287 |
| breeding_recipes  | 41617 |
| localizations     |  6234 |

## 生产验收

- 管理员六个路由、绑定历史、存档/Parser、目录、任务、设置和审计均通过 iPhone 宽度烟测。
- 普通玩家访问 `/admin` 时由服务端拒绝。
- 管理员 bootstrap 幂等完成，并已写入审计；没有创建明文密码或修改其他用户。
- 玩家库存读取、共享开关及恢复、目录状态和配种表单通过。
- 同一输入在旧失败任务终态后成功创建新任务，证明终态历史不会被错误复用。
- Worker 完成确定性任务并返回三条路线；Template Provider 降级状态符合预期。
- 玩家完成路线比较、采用方案并把首步骤标记为 `breeding`；未确认子代。
- 设置临时更新后成功回滚上一版本，最终任务创建保持开启。
- Template Provider 自检命令由 command-worker 完成，无命令失败。
- HTML、响应和 Agent 日志扫描未发现 Service Role 或生产秘密。

## 运行安全

- Agent API 仅绑定 `127.0.0.1:18765`，其余 Worker 没有主机端口。
- 四个 Agent 容器均使用 UID/GID `10001:10001`、只读根文件系统、`cap_drop: ALL` 和 `no-new-privileges`。
- 存档挂载为只读；Agent 数据目录由非 root 读写探针验证。
- Agent 未使用 host network，未挂载 Docker socket，并配置资源限制与日志轮转。
- `/opt/palworld/docker-compose.yml` SHA-256 保持 `a87dff0aff365e3f37a5cb0a14a84127587f664d8e1eff9c618656975bdb74f0`。
- Palworld 容器 ID 未变化、重启计数为 0；mihomo 启动于本次部署前且重启计数为 0。

## 备份与回滚

- 备份：`/data/projects/PalHatchHelper/data/backups/20260719T205320Z/`
- 备份目录权限：`0700`
- 上一 Vercel deployment：`dpl_7eKmtAaKiEj2W5R4rSAqGwWcN2XH`
- 上一 Agent 镜像：`ghcr.io/metallee/palhatch-agent:fd28e73@sha256:796b41c5ff46e7dbac8c46b5c76e0e54dfc87157da013e23cf9a5a5d6be741fa`
- 发布期间曾因烟测失败关闭任务入口并完成 Web/Agent 回滚；修复、CI 和 migration 通过后重新发布成功。
- 数据库变更是向前 migration；补偿时必须新增 migration，不得修改历史。

## 已知限制

- 当前只有一个 published catalog version，因此没有安全的 previous world pointer 可供目录回滚；发布失败时保留当前目录并停止后续部署。
- 外部 AI Provider 当前不可用时使用 Template Provider；AI 只解释确定性路线。
- 生产域名当前使用 Vercel project alias，尚未配置独立品牌域名。
- 系统不会自动确认子代、修改存档或操作游戏。
