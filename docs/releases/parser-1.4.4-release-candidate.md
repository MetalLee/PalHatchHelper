# Parser 1.4.4 发布候选变更记录

## 范围

Parser 1.4.4 修复基地物品库存的两个保守分类错误，不修改 Palworld 存档，也不增加联网、
写回或修复能力。

- 已确认 `CoolerPalFoodBox` 的 `Input` 槽按饲料箱库存计入；其他生产设施的 `Input`
  槽继续作为进行中的制作预留排除。
- 已确认基地直接归属的 `PublicOutput` 槽按已完成生产输出计入，不再错误依赖容器的
  storage usage 标记。
- 未知设施、未知槽位属性和无法证明基地/公会归属的容器继续失败闭合，不扩大推测白名单。
- 公共 CLI 候选版本升级为 0.2.5，使同一存档在 Parser 1.4.4 下重新解析并上传。

## 发布验收

发布前必须在固定 Go 1.26.5 环境运行 Parser 全量测试、vet 和 fuzz，并重建已提交的
Linux x64 二进制；正式双平台候选仍需按固定 Linux/Windows 构建环境连续构建两次并比较
SHA-256。还需运行根目录 `pnpm check`、完整本地 Supabase 测试、Parser 版本一致性检查和
npm 包验证。

真实存档验收只允许解析只读稳定副本，并应确认冷藏饲料箱、已完成生产输出和非饲料箱生产
输入的分类数量。`AncientRelicRecycler` 无槽位属性和未知属性值 5 仍保持 unresolved，直到有
受控 fixture 证明其语义。

本记录不授权 npm 发布、生产数据库迁移、Vercel/Agent 部署、修改真实 Palworld 存档或停止
任何 Palworld/mihomo 服务。
