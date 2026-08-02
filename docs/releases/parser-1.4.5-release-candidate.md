# Parser 1.4.5 / palbeacon-cli 0.2.6 发布候选变更记录

## 范围

Parser 1.4.5 修复 Palworld 普通库存与次元帕鲁仓库对同一帕鲁 CharacterID 使用不同
ASCII 大小写时，整个同步被 `GAME_ID_NORMALIZATION_COLLISION` 拒绝的问题。

- 仅次元仓库 CharacterID 可以接受纯 ASCII 字母大小写变体并复用相同稳定 ID。
- 每个实例仍保留存档中的原始 CharacterID 作为审计证据。
- 普通库存之间、被动、物品以及 Unicode/NFKC 碰撞继续失败关闭。
- `palbeacon-cli` 0.2.6 为剩余真实碰撞增加明确的中英文提示，不再显示通用错误。

## 发布验收

发布前必须在固定 Go 1.26.5 环境运行 Parser 全量测试、vet、fuzz 和可复现 Linux/Windows
x64 构建，比较连续两次构建的 SHA-256，并运行 Sync format、lint、typecheck、完整测试、build、
npm dry-run 与精确 tgz 验证。真实存档验收只解析稳定只读副本。

本记录不授权 npm publish、生产数据库迁移、Vercel/Agent 部署、替换服务器已安装 CLI、修改
真实 Palworld 存档或停止 Palworld/mihomo 服务。
