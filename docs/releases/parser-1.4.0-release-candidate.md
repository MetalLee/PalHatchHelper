# Parser 1.4.0 发布候选变更记录

## 范围

Parser 1.4.0 在既有只读 GVAS、PlM/PlZ、玩家、公会和帕鲁解析基础上，
增加公会基地及物理物品容器槽位提取。它不增加存档写回、修复、联网或
子进程能力。

物品堆栈只有在以下证据同时成立时才标记为已解析：容器模块明确指向
`ItemContainerSaveData`、容器与基地属于同一公会、容器位置只落入一个
有效基地半径、槽位类型属于普通储物、饲料箱或已完成生产输出。输入槽、
重叠基地、未知模块和结构漂移均失败闭合并产生 `partial` 状态。

CanonicalSnapshot 新增 `bases`、`item_stacks` 和
`item_inventory_status`。这属于向后兼容的新增字段，但必须使用新的 Parser
版本触发相同源存档重新发布。

## 发布验收

发布前必须在固定 Go 1.26.5 构建环境中重新构建 Linux x64 和 Windows x64
二进制，分别连续构建两次并比较 SHA-256。还必须运行 Go 全量测试、跨平台
fixture、`pnpm check:parser-version` 和 PalBeacon 包验证；二进制版本、manifest、
源码提交与上游 palooz/ooz 提交必须一致。

本记录不授权 npm 发布、生产数据库迁移、Vercel 部署、修改 Palworld 服务，
也不授权停止现有同步服务。
