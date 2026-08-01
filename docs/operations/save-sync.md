# Phase 3 存档同步运行说明

## 配置确认

Save Worker 不搜索常见目录，也不使用默认存档路径。部署人员先在 Palworld Compose 目录只读执行：

```bash
docker compose config --format json
```

然后以明确的服务名和容器内存档挂载目标调用 `discover_save_root` 校验：只有一个绝对 bind source 精确匹配时才可把结果写入部署平台的 `PALWORLD_SAVE_ROOT`。同时显式设置 `PALWORLD_COMPOSE_DIR`、世界 UUID/UID、Parser 名称/版本、命令 JSON 与 Parser 声明的相对文件清单。任一值缺失、相对路径、`..`、反斜杠或歧义映射都会使 `save-worker` 命令安全拒绝启动；API readiness 保持自己的数据库边界，并通过 `save_worker_configured=false` 报告独立状态。

这些值只放在部署平台 Secret/环境配置中，不提交真实路径、凭据或 Parser 私有参数。仓库的 `.env.example` 保持为空。

## PlM CanonicalSnapshot Parser

生产 Parser 固定为仓库 `parser/palworld-save-parser`，容器内只读挂载为
`/app/parser/palworld-save-parser`：

```dotenv
PARSER_NAME=palhatch-plm-save-parser
PARSER_VERSION=1.4.4
PARSER_COMMAND_JSON=["/app/parser/palworld-save-parser","--snapshot","{snapshot_path}","--output","{output_path}"]
```

支持矩阵固定为 `PlM/0x31`（Oodle Mermaid）、`PlZ/0x31`（单层 zlib）和
`PlZ/0x32`（双层 zlib）。不得修改 `magic`、伪装旧格式或把旧
`palworld-save-tools 0.24.0` CLI 配成生产 Parser。每层解压后长度必须匹配容器声明，
最终字节必须以 `GVAS` 开头。

Parser 1.4.4 把 PalworldSaveTools commit
`3395e393466fc1f384dee54dabb3e597e611435e` 的最小 palooz/ooz decode-only
C++ 源码通过 CGO 链接进自包含 Linux x64 与 Windows x64 可执行文件。Linux Agent bundle 继续只
需要 Linux 可执行文件、许可证和
第三方通知；不再需要外部解压文件、Python 或运行时下载。PalBeacon 不分发专有 Oodle 文件。
上游来源、逐文件 SHA-256、唯一的 decode-only 预处理补丁和更新步骤固定在
`parser/third_party/palooz/UPSTREAM.md`。组合 Parser 按 GPL-3.0-or-later 分发，原有 palhelm
Apache-2.0 声明继续保留；这不改变独立 TypeScript CLI 或仓库其他组件的许可证。

`PALHATCH_WORLD_UID` 由 Agent 从已确认的 `PALWORLD_WORLD_UID` 单向传给受限子进程。若
Level/Player GVAS 中存在 `WorldUID`/`WorldGuid`，Parser 要求它们与配置完全一致；旧存档省略
该字段时才使用显式配置值，绝不从目录名猜测。`PARSER_REQUIRED_FILES_JSON` 必须列出
`Level.sav`、本轮允许复制的每个 `Players/<UID>.sav`，以及需要纳入库存的
`Players/<UID>_dps.sav`；Parser 只扫描 Agent 快照中已经声明
并复制的 Players 文件，不访问真实 `PALWORLD_SAVE_ROOT`。玩家文件清单变化时先更新声明并
重新走双次稳定性检查，不能让 Parser 自行越过快照读取源目录。

## 同步协议

每轮同步按以下顺序执行：

1. ParserAdapter 返回完整相对文件清单。
2. 逐级使用 `O_NOFOLLOW` 打开目录与文件，采集相对路径、大小和纳秒 mtime。
3. 等待默认 10 秒后重复清单；不一致则跳过。
4. 预检磁盘空间，在 Agent 数据根的 `snapshots/.tmp-<uuid>` 创建副本。
5. 对只读源文件描述符优先执行 Linux `FICLONE` reflink；文件系统不支持时逐块读取并写入临时目标。
6. 再次采集源/副本清单，并逐文件比较 SHA-256；任何差异都会安全删除临时目录。
7. 计算包含相对路径与文件内容的整体 SHA-256。若等于上一份已发布哈希，删除临时目录并跳过 Parser。
8. 临时副本改为文件 `0444`、目录 `0555`，再原子 rename 为 UTC 时间戳加短哈希目录。
9. Parser 在独立进程中运行。Landlock 只允许读取系统运行时、显式 Parser 可执行文件和快照，只允许写临时输出目录；seccomp 禁止网络、权限修改、`fork`/`vfork`/`clone3` 和不带 `CLONE_THREAD` 的进程型 `clone`，只允许 Go 运行时所需的同进程线程，另有单 CPU affinity、内存/CPU/单文件与目录总输出大小、PID 和超时限制。独立 Compose service 再以 cgroup 限制 1 CPU、2 GB 内存和 32 PID，并用 64 MB tmpfs 限制 Parser 运行输出。Parser 自身只创建 `--output`，输出超过 64 MiB 时删除不完整文件并失败。
10. JSON 通过共享 CanonicalSnapshot Schema 与 world/player/Pal UID、目录告警和 resolved 规则校验后，库存骤降保护才允许 Repository 调用单一 Supabase RPC。
11. RPC 在同一事务中锁定 world，拒绝早于已接受存档时间水位的乱序发布，幂等检查哈希并重复执行骤降保护。历史成功哈希再次出现时复用不可变快照并原子回切 `latest_snapshot_id`；新哈希写入公会、玩家、快照、帕鲁和共享偏好后才切换 latest。owner 暂时无法解析不会覆盖已有共享选择，只有确认 owner 改变才恢复默认共享。

Parser、Schema、业务校验、数据库或资源保护失败都不会更新 `latest_snapshot_id`。失败会通过 service-role RPC 单独写入 `failed`/`rejected` 元数据和稳定错误码，记录不含本地路径、原始存档或堆栈。完整快照只保存在 Agent 自有数据目录；Supabase 发布 payload 只有共享 Schema 约束的标准化字段、解析告警码和筛选后的 resolution metadata。

仓库内 `data/parser-fixtures/minimal-save` 保留 Phase 3 的合成 JSON Adapter 样例；
`data/parser-fixtures/plm-minimal` 包含完全合成的 GVAS 和真正 Mermaid 压缩的 `PlM/0x31`
最小 fixture。后者只有虚构 GUID、玩家、公会和 Pal；其原始/压缩 SHA-256、长度、magic、save
type、生成范围和开源解码验证 commit 均固定在 `manifest.json`。一次性 fixture 压缩工具不进入
生产 Parser。测试会直接经过 vendored 解码器生成严格 CanonicalSnapshot，校验共享 Schema、
稳定 ID、PlZ 兼容、世界 UID、确定性、损坏输入和 64 MiB 边界。

## 保留与清理

快照状态写在 `snapshots/.state`，不修改只读快照目录。默认保留最近 3 份成功快照和 24 小时内最近 1 份失败/处理中快照。清理前先验证所有候选都是指定 snapshot root 的直接子目录；发现外部路径或 symlink 会整批拒绝，不会部分删除。

数据库采用独立的 24 小时滚动保留策略。Save Worker 每轮同步后通过 Service Role 调用
`cleanup_expired_inventory_snapshot_payloads(25)`；RPC 使用数据库时间，分批清理已经被更新
快照取代的 `pal_snapshot_items` 和检测运行记录，并删除过期失败/拒绝记录。每个 world 的
`latest_snapshot_id` 及其明细始终保留。成功快照清理后只留下带 `payload_purged_at` 的审计
存根；任务、路线、执行计划、候选和共享偏好不会级联删除。

清理失败只记录稳定错误码，不撤销已经成功的库存发布。普通用户和管理员均无 RPC 执行权限。
同一内容哈希在旧载荷已清理后再次出现时会创建新的快照发生记录。常规 PostgreSQL 删除只让
空间可复用，不自动运行 `VACUUM FULL`、`CLUSTER` 或其他高锁维护。

停止 `save-worker` 即可回滚运行行为；数据库继续指向上一份有效库存，清理只允许发生在 Agent 自有 snapshot root。
