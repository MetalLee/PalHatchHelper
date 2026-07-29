# Save Worker 到 palbeacon-sync 的原地切换

本文是现有生产 Save Worker 平滑切换为 `palbeacon-sync@0.1.0` 的验收、身份迁移、
验证和回滚手册。它不授权生产变更；生产执行必须使用已批准的变更窗口、备份、精确
构件和受控 Service Role 边界。

## 兼容性分析结论

### 公共 Sync 如何选择 world

`public.publish_sync_device_snapshot(token_hash, snapshot)` 先锁定未撤销设备并校验公共
载荷。设备已有 `world_id` 时，载荷中的 `server.world_uid` 必须等于该 world 当前
`world_uid`；设备尚未绑定时，函数按载荷的 `world_uid` 查找 world，找不到就创建一
行并把设备绑定到它。

公共 Sync 对 world UID 使用：

```text
pb1_<sha256("palbeacon:v1:" + raw_uid)>
```

现有生产 world 保存的是原始 UID，因此未 transition 就让未绑定设备首次上传时，
查找不会命中原 world，而会创建第二个 world。这不是可接受的切换方式。

### 库存发布如何复用 guild 和 player

公共入口最终委托 `private.publish_inventory_snapshot(world_id, payload)`。该函数按以下
键 upsert 当前身份行：

- guild：`(world_id, game_guild_uid)`，复用 UUID，只更新名称和最后出现时间；
- player：`(world_id, game_player_uid)`，复用 UUID，只更新 guild、昵称、等级和最后
  出现时间；
- share preference：`(world_id, pal_instance_uid)`，保留玩家的共享选择，仅在归属人
  发生变化时按既有规则重置。

因此，只有在首次公共上传前把现有 durable external UID 原地转换成完全相同的
`pb1_...` 值，公共上传才能复用现有 UUID。

### 当前键关系

| 数据                     | 稳定内部键                     | durable/current external UID  | 迁移动作            |
| ------------------------ | ------------------------------ | ----------------------------- | ------------------- |
| `worlds`                 | `id` UUID                      | 唯一 `world_uid`              | 转换 UID，保留 UUID |
| `guilds`                 | `id` UUID                      | `(world_id, game_guild_uid)`  | 转换 UID，保留 UUID |
| `players`                | `id` UUID                      | `(world_id, game_player_uid)` | 转换 UID，保留 UUID |
| `player_bindings`        | `(user_id, player_id)`         | 无                            | 原样保留并校验摘要  |
| `pal_share_preferences`  | `(world_id, pal_instance_uid)` | instance UID                  | 转换当前键          |
| `pal_instance_lifecycle` | `(world_id, pal_instance_uid)` | instance UID                  | 转换当前键          |

`player_bindings.player_id` 指向 player UUID，而不是游戏 UID；只要 player UUID 不变，
Steam 登录后的绑定关系不需要重建。

### 不可变历史和 instance UID

`inventory_snapshots` 与 `pal_snapshot_items` 有不可变触发器。唯一例外是 PostgreSQL
受控的 24 小时 retention 流程：它可以删除非最新快照的 item，并只写
`payload_purged_at` 标记；身份 transition 不调用该流程，也不修改或删除历史快照。

历史配种数据确实保存 instance UID，包括：

- `breeding_routes.route_payload` 的库存来源；
- `breeding_steps` 的 parent A/B 和 selected child instance UID；
- execution plan dependency、offspring candidate 和审计 payload；
- 已保存方案、历史 route/read model 中的固定库存引用。

这些数据是固定 snapshot/版本的历史证据。transition 与 rollback 均不重写它们；
旧 snapshot 继续携带原始 UID，新公共 snapshot 携带 `pb1_...` UID。新的配种任务固定
到切换后的 latest snapshot，不依赖改写旧路线。

### Agent 与公共 Sync 的 source_save_hash

旧 Agent 算法按路径排序后计算：

```text
relative_path + \0 + file_bytes
```

每个文件之间没有专用 domain，文件字节后也没有结尾分隔符。公共 Sync 正式协议为：

```text
palbeacon-sync-snapshot-v1\0
+ relative_path + \0 + file_bytes + \0
+ relative_path + \0 + file_bytes + \0
+ ...
```

路径相对于唯一世界目录、按字典序排列。两端都读取相同的 `Level.sav` 与
`Players/*.sav` 文件集合，但 hash 协议有意不同。domain prefix 使相同字节的第一次
公共上传必定不会命中历史 Agent snapshot；没有修改 Agent 算法，也不修改任何历史
`source_save_hash`。固定 fixture 的公共 Sync hash 为：

```text
c7c68938565e0ac2c20f46a57e6d92dedf712528a0de04f331c89c4b6b9c3607
```

同一 fixture 的 Agent hash 是
`72f4f8718024eb6d1c8614ffa89513ecf481feff0a0b2b49f4490f13b0e6073b`，
测试会同时锁定这两个值。

## 原地身份 migration

forward-only migration：

```text
supabase/migrations/20260729020000_public_sync_world_transition.sql
```

它建立三个 browser-inaccessible private 表：

- `private.public_sync_world_transitions`：world UUID、原/目标 world UID、原 player/guild
  UUID 集合、binding 数量和摘要、切换时 latest snapshot 与 unresolved 基线；
- `private.public_sync_uid_mappings`：world、guild、player、share preference 与 lifecycle
  的原值和 `pb1_...` 目标值；
- `private.public_sync_snapshot_publications`：公共设备与不可变 snapshot 的正式来源标记。

anon/authenticated/browser 无权读取这些表；Service Role 也不直接读取备份表，只能调用
受控 RPC。RPC 不向客户端返回备份映射，transition 和 rollback 都写管理员审计。

### 固定 UID 向量

TypeScript 和 PostgreSQL 测试共同锁定 `UTF-8("palbeacon:v1:" + raw_uid)` 的
SHA-256：

| 原始 UID                    | 目标 UID                                                               |
| --------------------------- | ---------------------------------------------------------------------- |
| `fixture-world-local`       | `pb1_5f9e8f9da19f9e744f70723081bf058d9241375c30c56690aa7be452c71b5ba4` |
| `fixture-guild-alpha`       | `pb1_3eace36823bdb2610a8e6c6485e86706408a3ee2ab5628fa61a5622c1690b05a` |
| `fixture-player-a-uid`      | `pb1_925481877daf8e6b9bc893a484c9f2b66320582cd173a91338bde7d91c04d0ba` |
| `fixture-pal-b-private-001` | `pb1_f7094b3c7ae3ef6eb7e34c13a7a11409b2e10861024d52707653f6a02509625a` |

### 受控 RPC

所有函数仅允许 Service Role 调用：

```sql
preflight_public_sync_world_transition(p_world_id uuid)
transition_world_to_public_sync(
  p_world_id uuid,
  p_expected_current_world_uid text,
  p_allow_recent_save_worker boolean default false
)
verify_public_sync_world_transition(p_world_id uuid)
rollback_public_sync_world_transition(p_world_id uuid)
```

`preflight` 只读返回 world ID、当前/目标 world UID、guild/player/binding/share 数量、
latest snapshot、active/processing job 数、迁移状态、冲突以及各表预计修改行数。返回值
包含当前原始 world UID，只能在受控会话中查看，不得进入工单、日志或浏览器。

`transition` 对 world 行加锁并在单一事务中执行。调用者必须把刚刚确认的当前
`world_uid` 作为 expected 值；值改变、目标冲突、任何 processing/algorithm/AI 阶段
任务或五分钟内 Save Worker 心跳都会让整笔事务失败。正常切换必须使用默认
`false`；override 只用于心跳记录确认陈旧但仍未过窗口的获批事件，不能用来绕过仍在
运行的 Save Worker。重复调用已成功的 transition 会安全返回 verify 报告。

`verify` 只返回安全字段：UUID 保持/唯一性、player UUID 与 binding 摘要是否保持、
guild/player 数和重复数、latest Parser/Pal/unresolved、公共来源、设备绑定、数据状态和
migration 状态；不返回原始 UID、token 或完整库存。

`rollback` 要求该 world 的所有 Sync 设备均已撤销，且当前 world/guild/player/
preference/lifecycle 仍等于迁移目标值。identity 集合或目标值发生未知变化时会拒绝，
避免覆盖后续写入。成功后使用 private mapping 恢复原 UID，保留 UUID、bindings、公共
历史 snapshot 和来源标记；重复调用幂等。它不启动旧进程。

## 离线验收工具

### inspect

```bash
palbeacon-sync inspect \
  --save-dir __COPIED_WORLD_DIRECTORY__ \
  --canonical-output ./new-canonical.json \
  --payload-output ./actual-public-payload.json
```

两个输出路径都必须显式给出且不能已存在。`inspect` 不登录、不加载已有设备配置或
token、不访问网络、不上传；它和 `sync --once` 共用安全快照、自包含 Parser、
Canonical 校验、UID 脱敏及 publish payload 校验。成功输出确定性 JSON，失败和成功均
清理临时快照。

### Parser Canonical 差分

```bash
node scripts/operations/compare-parser-canonical.mjs \
  --old ./old-canonical.json \
  --new ./new-canonical.json \
  --report ./parser-diff-report.json
```

工具先做完整深度 JSON 比较。对象键顺序不影响 JSON 值，所有数组顺序均保留；当前
契约没有被声明为无序并自动规范化的数组。报告包含 world、guild/player/Pal 数量、
instance UID 集合、owner/guild、Pal ID、gender、passive 和 location 差异。完全一致
退出 0，任何差异退出 1，参数/输入错误退出 2。人工评审可以解释差异，但脚本不会把
差异自动标成可接受。

### 最终公共载荷差分

```bash
node scripts/operations/compare-sync-payload.mjs \
  --canonical ./old-canonical.json \
  --actual ./actual-public-payload.json \
  --report ./payload-diff-report.json
```

工具用当前 `redactUid` 逻辑从旧 Canonical 构造 expected payload，并与 `inspect`
实际载荷做完整深度比较；时间、parser identity 与 source hash 采用 actual envelope，
库存内容必须相同。退出码同上。报告只含差异路径和安全汇总，不含设备 token、Service
Role 或服务器凭据。

### 在线安全验证

```bash
# 由 secret manager 为当前进程注入 SUPABASE_URL 和
# SUPABASE_SERVICE_ROLE_KEY；不要在命令行或 shell history 中赋值。
node scripts/operations/verify-public-sync-cutover.mjs \
  --world-id __WORLD_UUID__ \
  --expected-device-id __DEVICE_UUID__ \
  --expected-player-bindings __BINDING_COUNT__ \
  --expected-guild-count __GUILD_COUNT__ \
  --expected-player-count __PLAYER_COUNT__ \
  --expected-pal-count __PAL_COUNT__
```

脚本只调用 `verify_public_sync_world_transition`，不扫描基础表。它验证 world 唯一且
UUID 不变、设备绑定、Parser `1.2.0`、正式来源为 `public_sync`、预期数量、bindings、
无重复身份、unresolved 未增加、published 数据正常。失败退出非零；输出是白名单安全
摘要，不输出密钥、token hash、原始 UID 或库存。

## 正式切换顺序

每一步完成并留存不含秘密的证据后才能进入下一步。任一断言失败立即停止推进。

### A. 准备

1. 确认目标 Git SHA 的完整 CI 成功。
2. 创建并验证生产数据库备份；不在本任务中修改生产数据库。
3. 记录 Git SHA、当前 Agent 镜像 digest/tag 和 Vercel deployment ID。
4. 记录原 `world_id`、`latest_snapshot_id`。
5. 通过既有安全统计记录 player binding、guild、player、Pal 与 unresolved 数量。
6. 下载 CI 生成的唯一 npm 候选 tgz，记录文件名与 SHA-256，并校验签名/来源。
7. 确认回滚负责人、维护窗口、旧 Save Worker 启停方式和 Sync 设备撤销方式均已获批。

### B. 离线差分

1. 从现有只读安全快照复制两份字节完全相同的输入到隔离验收目录；不要读取或编辑
   真实源存档。
2. 对两份目录逐文件记录相对路径、大小和 SHA-256，确认集合与字节相同。
3. 使用当前生产镜像中的旧 Parser 对第一份副本运行固定命令，输出
   `old-canonical.json`。记录旧镜像 digest 和 Parser `--version`。
4. 使用候选中的 Parser `1.2.0` 对第二份副本运行相同
   `--snapshot <dir> --output <file>` 接口，输出 `new-canonical.json`；不得混用本地重编
   Parser。
5. 运行 `compare-parser-canonical.mjs`；要求退出 0，或对退出 1 的每一项完成人工审批，
   但不得让脚本忽略数组顺序或 UID 差异。
6. 对第二份副本运行候选 tgz 安装出的 `palbeacon-sync inspect`，生成新的 canonical 和
   actual payload；确认该命令没有网络访问。
7. 将 inspect canonical 再与 `new-canonical.json` 深度比较，必须完全一致。
8. 运行 `compare-sync-payload.mjs`，要求退出 0。
9. 再次逐文件计算两份输入 hash；相对路径、大小与字节 hash 必须与步骤 2 相同。

### C. 先切新 Parser

1. 构建并部署记录过 digest 的新 Agent 镜像，其中 Parser 必须为 `1.2.0`。
2. 保持现有 Save Worker 正常运行，只替换已批准的 Agent 镜像；此时不初始化或启用
   公共 Sync。
3. 等待至少一个真实 Save Worker 同步周期。
4. 验证 Parser identity、snapshot 状态、库存数量、unresolved、玩家读取和配种器正常。
5. 异常时仅回退 Agent 镜像；不要推进控制面或身份迁移。

### D. 部署控制面

1. 按数据库发布流程应用已审核 migrations，并执行 migration/lint/pgTap 验证。
2. 部署与同一 Git SHA 对应的 Web。
3. 验证 Steam 登录、账号绑定、设备配对创建/撤销边界和公共 API 健康。
4. 此阶段只部署 migration 函数，绝不调用 preflight 以外的写入函数，不执行
   transition。

### E. npm 发布

1. 只使用 CI 在 A 阶段下载并校验的精确 tgz；禁止重新在本地打包另一个文件。
2. 对该精确 tgz 执行 `npm publish --dry-run <exact.tgz>` 并审查文件清单。
3. 由获批人员人工执行 `npm publish <exact.tgz>`；自动化或本任务不得发布。
4. 从干净目录运行 `npx --yes palbeacon-sync@0.1.0 --version`，必须输出 `0.1.0`。
5. 再核对 registry 包的 provenance、许可证、Parser manifest 和 tgz hash。

### F. 切换窗口

1. 关闭 breeding job 创建入口或将 Web 置于明确维护状态；保留只读查询。
2. 等待所有 processing、algorithm-completed、AI-enriching job 结束；不得强行迁移。
3. 停止且只停止现有 Save Worker。不要停止 Agent 其他 worker、Palworld 或 mihomo。
4. 确认 Save Worker 进程已停，并等待最后心跳超过五分钟失效窗口。
5. 用原 `world_id` 调用 `preflight_public_sync_world_transition`；逐项核对 UID 冲突、目标
   world、latest snapshot、jobs 和预计行数，并把当前 world UID 作为受控 expected 值。
6. 在同一获批会话调用 `transition_world_to_public_sync(world_id,
expected_current_world_uid, false)`。禁止常规使用 heartbeat override。
7. 以 `palbeacon-sync` 专用非 root 用户运行 `init`，使用精确 `0.1.0`、一次性配对码、
   固定 `XDG_CONFIG_HOME` 和只读存档权限。
8. 运行一次 `palbeacon-sync sync --once`。
9. 运行 `verify-public-sync-cutover.mjs`，并验证 pal list 可读、首次上传返回原
   `world_id`、未创建第二个 world、guild/player UUID 与 bindings 保持、latest snapshot
   已切到公共来源。
10. 创建一个受控验收 breeding job，确认它固定到新的 latest snapshot；完成验证后按
    维护策略处理该测试任务。
11. 安装并启动 `infra/sync/palbeacon-sync.service`，确认服务用户、只读路径、heartbeat
    与 journal 正常。
12. 恢复 breeding job 创建入口并退出维护状态。

### G. 观察

1. 连续观察 24 至 48 小时。
2. 确认新存档能产生新的公共 snapshot，hash、Parser identity 和 source attribution
   正常。
3. 确认 Sync heartbeat、设备 last-seen 和 systemd 重试正常且无凭据日志。
4. 核对数据状态、guild/player/Pal/unresolved 数量、库存列表、绑定、共享偏好和配种器。
5. 保留旧 Save Worker 容器/镜像、原启动参数、private rollback 数据和数据库备份；
   不要清理历史 snapshot。

### H. 回滚

1. 关闭任务创建入口，并等待 processing job 结束。
2. 停止且禁用 `palbeacon-sync.service`，确认不再上传或 heartbeat。
3. 通过控制面撤销该 world 的所有 Sync 设备，确认 `revoked_at` 生效。
4. 调用 `rollback_public_sync_world_transition(world_id)`；如果报告 identity set 或目标值
   已变化，停止并人工调查，绝不覆盖。
5. 验证 world/guild/player durable UID 已恢复，world/player/guild UUID 和 bindings
   保持，公共 Sync 历史 snapshot 未删除。
6. 启动旧 Save Worker；rollback RPC 本身不会启动任何进程。
7. 等待旧 Save Worker 发布一份新的原始 UID snapshot。因为旧历史 snapshot 可能仍被
   hash/parser 幂等键命中，必须确认实际得到一份满足当前发布约束的新快照；必要时等待
   下一次真实存档变化，不能修改源存档或历史 hash。
8. 验证 latest snapshot、绑定、库存、共享偏好和配种器恢复正常，再开放任务入口。
9. 不回滚、停止或重启 Palworld；不操作 mihomo。

## 验收边界

数据库 synthetic 集成测试覆盖原始 UID world、已有 guild/player/binding/share
preference/lifecycle、transition、首次公共上传、UUID 复用、pal list、基于新 latest
snapshot 创建 breeding job、verify、设备未撤销时拒绝 rollback、撤销后 rollback，以及
旧 Agent 再次发布新原始 UID snapshot。生产切换仍必须按上述手册人工执行，测试结果
不能替代备份、真实 Parser 差分和观察窗口。
