# Parser 1.4.2 发布候选变更记录

## 范围

Parser 1.4.2 修复 `palbeacon-cli@0.2.2` 所带 Parser 1.4.1 在当前零售存档上
无法发布基地物品库存的问题，不修改 Palworld 存档，也不增加联网、写回或修复能力。

- 读取真实 `ItemContainerSaveData.Value.Slots[].RawData` 直数组，同时保留旧解码
  wrapper 的兼容路径。
- 将 `MapObjectSaveData.Model.RawData` 末尾字段按上游格式作为不透明 `uint32`
  令牌完整读取，不再错误限定为布尔值。
- 对已明确归属基地且 usage 为 storage、但省略逐槽默认属性的已确认物理容器，
  按稳定 MapObject ID 确定性分类箱柜、冰箱、饲料箱和已完成产出；未知设施、
  输入槽与新属性枚举继续失败闭合为 unresolved。
- 公共 CLI 版本升级为 0.2.3，使同一存档在 Parser 1.4.2 下重新解析并上传。

## 发布验收

发布前必须在固定 Go 1.26.5 环境运行 Parser 全量测试并重建已提交的 Linux
x64 二进制；正式双平台候选仍需按固定 Linux/Windows 构建环境连续构建两次并
比较 SHA-256。还需运行根目录 `pnpm check`、Parser 版本一致性检查和 npm 包验证。

本记录不授权 npm 发布、生产数据库迁移、远程推送、Vercel 部署、修改真实
Palworld 存档或停止任何 Palworld/mihomo 服务。
