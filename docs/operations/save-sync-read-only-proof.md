# 原始存档只读证明

## 源路径入口

- `settings.py`：`PALWORLD_SAVE_ROOT` 无默认值；`save-worker` 命令要求绝对、显式配置，API readiness 不依赖该命令配置。
- `save_sync/discovery.py`：只接受 `docker compose config --format json` 的结构化结果、明确服务名和明确容器挂载目标；零个或多个匹配均返回 `SAVE_PATH_NOT_CONFIRMED`。
- `parsers/adapter.py`：ParserAdapter 必须声明相对文件集合。
- `save_sync/snapshot.py`：拒绝绝对路径、空路径、`.`、`..`、反斜杠、重复声明、任何层级 symlink、非普通文件，以及源根与 snapshot root 的包含关系。

## 打开模式与复制原语

- 源根/中间目录：`O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_DIRECTORY`。
- 源文件：`O_RDONLY | O_CLOEXEC | O_NOFOLLOW`。
- 源路径没有 `O_WRONLY`、`O_RDWR`、`O_CREAT`、`O_TRUNC`、`chmod`、`chown`、rename、unlink 或 delete 调用。
- 不执行 shell 复制命令。代码对已安全打开的源文件描述符调用 `fcntl.ioctl(destination_fd, FICLONE, source_fd)`；仅在 `EINVAL`、`ENOTTY`、`EOPNOTSUPP` 或 `EXDEV` 时退化为 `os.read(source_fd)` → `os.write(destination_fd)`。目标仅位于 `.tmp-<uuid>`。
- 复制后重新采集源和副本清单，并比较每个文件 SHA-256；通过后才允许原子 rename。

## Parser 与发布隔离

- Parser 输入是已完成的 Agent 本地快照，不是源存档；文件 `0444`、目录 `0555`。
- Landlock 将文件写入限制到临时输出目录，seccomp 禁止网络 socket、chmod 和派生进程 syscall；单文件/目录总量、tmpfs、PID、CPU 与内存共同限制资源；子进程环境是白名单，不继承 Supabase key、代理或其他进程环境。
- Repository payload 不含原始路径或原始存档，数据库发布 RPC 只接收共享 Schema 约束的 CanonicalSnapshot 标准化字段，失败 RPC 只接收脱敏状态、时间、Parser 身份和稳定错误码。
- 任一失败路径都不调用发布 RPC；只可插入独立 `failed`/`rejected` 记录，Supabase `latest_snapshot_id` 保持上一有效值。

## 自动化证据

- `tests/conftest.py` 在完整 pytest session 前后记录 `data/parser-fixtures` 全部文件 SHA-256 与全部文件/目录权限并要求完全相等。
- `tests/save_sync/test_snapshot_copy.py` 覆盖两次清单间变化、复制期间变化、叶子与父目录 symlink、重复哈希、磁盘不足、源打开 flags 和成功复制。
- `tests/parsers/test_adapter_contract.py` 覆盖超时、非零退出、非法 JSON、快照只读、网络禁用、秘密环境隔离、输出目录外写入、派生进程和目录总输出拒绝。
- `tests/normalization` 与 `tests/save_sync/test_publish_guard.py` 覆盖 world UID、重复实例、未知 ID 告警、unresolved、骤降与失败不发布。
- `supabase/tests/inventory_sync.sql` 覆盖单事务发布、哈希幂等、数据库侧 world UID/骤降复核、失败记录不切换 latest，以及 ACL + service-role JWT 双重校验。
