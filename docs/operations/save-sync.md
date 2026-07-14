# Phase 3 存档同步运行说明

## 配置确认

Save Worker 不搜索常见目录，也不使用默认存档路径。部署人员先在 Palworld Compose 目录只读执行：

```bash
docker compose config --format json
```

然后以明确的服务名和容器内存档挂载目标调用 `discover_save_root` 校验：只有一个绝对 bind source 精确匹配时才可把结果写入部署平台的 `PALWORLD_SAVE_ROOT`。同时显式设置 `PALWORLD_COMPOSE_DIR`、世界 UUID/UID、Parser 名称/版本、命令 JSON 与 Parser 声明的相对文件清单。任一值缺失、相对路径、`..`、反斜杠或歧义映射都会使生产 readiness 为 `not_ready`。

这些值只放在部署平台 Secret/环境配置中，不提交真实路径、凭据或 Parser 私有参数。仓库的 `.env.example` 保持为空。

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
9. Parser 在独立进程中运行。Landlock 只允许读取系统运行时、显式 Parser 运行文件和快照，只允许写临时输出目录；seccomp 禁止网络与 chmod，另有单 CPU affinity、内存/CPU/输出大小与超时限制。
10. JSON 通过共享 CanonicalSnapshot Schema 与 world/player/Pal UID、目录告警和 resolved 规则校验后，库存骤降保护才允许 Repository 调用单一 Supabase RPC。
11. RPC 在同一事务中锁定 world，拒绝早于已接受存档时间水位的乱序发布，幂等检查哈希并重复执行骤降保护。历史成功哈希再次出现时复用不可变快照并原子回切 `latest_snapshot_id`；新哈希写入公会、玩家、快照、帕鲁和共享偏好后才切换 latest。owner 暂时无法解析不会覆盖已有共享选择，只有确认 owner 改变才恢复默认共享。

Parser、Schema、业务校验、数据库或资源保护失败都不会更新 `latest_snapshot_id`。完整快照只保存在 Agent 自有数据目录；Supabase payload 只有标准化字段、解析告警码和筛选后的 resolution metadata。

仓库内 `data/parser-fixtures/minimal-save` 是完全合成的脱敏兼容样例。测试会让独立受限子进程实际读取其中声明的两个文件，生成 CanonicalSnapshot，并走到 Repository 序列化边界；该样例不冒充 Palworld 二进制格式。生产环境仍必须显式配置经过确认的第三方 Parser 命令、版本和所需文件清单。

## 保留与清理

快照状态写在 `snapshots/.state`，不修改只读快照目录。默认保留最近 3 份成功快照和 24 小时内最近 1 份失败/处理中快照。清理前先验证所有候选都是指定 snapshot root 的直接子目录；发现外部路径或 symlink 会整批拒绝，不会部分删除。

停止 `save-worker` 即可回滚运行行为；数据库继续指向上一份有效库存，清理只允许发生在 Agent 自有 snapshot root。
