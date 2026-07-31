# Parser 1.4.3 发布候选变更记录

## 范围

Parser 1.4.3 在 1.4.2 的基地物品容器解析基础上，增加公会箱只读归属解析，
不修改 Palworld 存档，也不增加联网、写回或修复能力。

- 从 `GuildExtraSaveDataMap[guild].GuildItemStorage.RawData` 读取已证明的
  `ItemContainerSaveData` GUID，并把对应堆栈标记为 `guild_chest`。
- 公会箱只保留公会归属，不虚构基地 ID；同一容器同时出现基地与公会箱证据时
  失败闭合为 unresolved。
- Canonical Schema 和公共同步脱敏链路接受 `guild_chest`，原始容器与公会 GUID
  仍只以稳定哈希形式上传。
- 公共 CLI 候选版本升级为 0.2.4，使同一存档在 Parser 1.4.3 下重新解析并上传。

## 发布验收

发布前必须在固定 Go 1.26.5 环境运行 Parser 全量测试、vet 和 fuzz，并重建已
提交的 Linux x64 二进制；正式双平台候选仍需按固定 Linux/Windows 构建环境
连续构建两次并比较 SHA-256。还需运行根目录 `pnpm check`、完整本地 Supabase
测试、Parser 版本一致性检查和 npm 包验证。

本记录不授权 npm 发布、生产数据库迁移、Vercel/Agent 部署、修改真实 Palworld
存档或停止任何 Palworld/mihomo 服务。
