# Palworld Stable ID v1

Palworld Stable ID v1 是 Parser、Catalog 与 Windows 提取器共同使用的游戏标识边界。机器可执行的 golden vectors 位于 `packages/contracts/data/palworld-stable-id-v1.json`，三种实现不得自行扩展规则。

## 规范

输入只能来自游戏中的原始 `InternalName`、DataTable row name 或稳定资源标识，不能来自显示名称。实现依次执行 Unicode NFKC、转换为小写，然后要求整个结果匹配 `^[a-z0-9][a-z0-9._-]*$`，最大 120 字符。下划线、点、连字符与 variant 后缀原样保留；不翻译、不做自然语言 slug、不删除后缀，也不应用未经审查的 alias。

每个标准化记录必须在 `metadata.source_internal_name` 保存原始输入。Parser 另外保存 `metadata.source_passive_skill_internal_names`；Catalog 提取证据同时保存资产路径、row name 和 property chain。原始快照/Parser 输出在标准化前不被原地修改。

若两个不同原始值归一化为同一 ID，整个批次以 `GAME_ID_NORMALIZATION_COLLISION` 失败。字符或长度不合法时以 `GAME_ID_INVALID` 失败，不得跳过记录。调用方应对同一批输入建立反向映射，并用原始 ID 调查冲突。

## 一致性门禁

- TypeScript：`packages/pal-catalog/src/stable-id.ts`
- Python：`apps/agent/src/pal_hatch_helper/normalization/stable_id.py`
- C#：`tools/palworld-catalog-extractor/src/PalworldCatalogExtractor/Core/StableIdV1.cs`

三者读取同一 golden vectors。修改规范时必须先评审 vectors、碰撞语义和迁移影响，再同步三种实现；不能通过添加 alias 修复单个数据问题。
