# Parser 1.4.1 发布候选变更记录

## 范围

Parser 1.4.1 修复物品库存解析与发布链路，不修改 Palworld 存档，也不增加
联网、写回或修复能力。

- 按零售存档的
  `ItemContainerSaveData.Value.Slots.Slots.RawData` 二进制布局读取槽位编号、
  数量和物品内部 ID。
- 从 `MapObjectSaveData.Model.RawData` 读取明确的基地、公会和位置，并从
  ItemContainer module 读取目标容器、槽位属性和 usage type。位置只用于校验
  明确归属是否一致，不再用于就近猜测基地。
- 只纳入已完成建筑中的普通储物、冰箱、饲料箱和生产输出；排除玩家背包、
  输入槽以及明确无基地归属的容器。结构无法确认时继续失败闭合为 `partial`。
- `palbeacon-cli` 记录上次成功同步使用的 Parser 版本；即使存档哈希未变化，
  Parser 升级也会重新解析和上传。
- 数据库收到 `partial` 且没有任何可解析基地物品栈时，保留上一份有效物品
  快照指针；帕鲁库存仍按原事务独立发布。

## 发布验收

发布前必须在固定 Go 1.26.5 环境运行 Parser 全量测试并重建已提交的 Linux
x64 二进制；正式双平台候选仍需按固定 Linux/Windows 构建环境连续构建两次并
比较 SHA-256。还需运行根目录 `pnpm check`、新增 pgTAP 行为测试、Parser
版本一致性检查和 npm 包验证。

本记录不授权 npm 发布、生产数据库迁移、远程推送、Vercel 部署、修改真实
Palworld 存档或停止任何 Palworld/mihomo 服务。
