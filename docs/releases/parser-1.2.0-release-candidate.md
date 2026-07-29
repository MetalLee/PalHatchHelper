# Parser 1.2.0 / palbeacon-sync 发布候选变更记录

日期：2026-07-29

状态：本地发布候选，未部署、未发布 npm

Parser 1.2.0 保留既有 Go GVAS、玩家、公会、帕鲁与 CanonicalSnapshot 解析，只把 PlM 解压路径替换为随源码构建的 decode-only palooz/ooz 核心。上游固定为 `deafdudecomputers/PalworldSaveTools` commit `3395e393466fc1f384dee54dabb3e597e611435e`；逐文件 SHA-256、许可证和唯一局部补丁见 `parser/third_party/palooz/UPSTREAM.md`。

候选 Linux x64 Parser 是单一自包含可执行文件，不需要 Python、palsav、专有 Oodle 文件或运行时下载；它仍无编码、压缩、联网、子进程和 SAV 写回能力。组合 Parser 按 GPL-3.0-or-later 分发，palhelm 的 Apache-2.0 声明继续保留。独立 TypeScript CLI 保持 MIT，并通过子进程/JSON 与 Parser 通信。

## 真实存档只读人工验收

自动 fixture 验证通过后，维护者仍需在关闭旧 Save Worker 之前完成以下验收；本步骤不是生产部署授权：

1. 让现有 Agent 的稳定性检查和快照复制流程从当前腾讯云存档创建一份新的安全副本。不得把新旧 Parser 指向正在写入的源目录。
2. 记录副本内全部声明文件的 SHA-256、大小、mtime 和只读权限；后续确认完全不变。
3. 若旧生产 Parser 仍可用，在隔离的迁移验收环境中分别让旧 Parser 与新自包含 Parser 读取两份字节相同的安全副本，输出到两个全新路径。历史运行库只用于这一轮差分，不进入新配置或新发布包。
4. 使用 `scripts/operations/compare-parser-canonical.mjs` 做完整深度 JSON 比较。预期 CanonicalSnapshot 完全一致；工具会逐项报告 world、guild/player/pal 数量、instance UID、owner/guild 关联、pal ID、gender、passive IDs 和 location，且不会忽略数组顺序。
5. 若存在差异，保留两份输出和输入哈希，按字段解释来源；任何无法解释的差异都视为验收失败，不切换 Worker。
6. 再次核对安全副本哈希和权限未变、无额外文件、输出小于 64 MiB，并确认新 Parser 无网络连接和子进程。
7. 验收成功前不得关闭旧 Save Worker。切换需要独立生产批准；本候选流程不修改或重启 Palworld、mihomo，也不读取或写回真实源存档。

准确命令、`palbeacon-sync inspect`、最终脱敏载荷差分和生产切换/回滚顺序见 [`docs/operations/save-worker-to-public-sync-cutover.md`](../operations/save-worker-to-public-sync-cutover.md)。不要用会重排数组的通用规范化替代业务差分工具，也不要把真实存档、完整输出、服务器路径或凭据提交到 Git。
