# 配种测试数据

这里的内容全部是虚构的 Phase 4A 回归数据，不代表《幻兽帕鲁》的真实配种事实，也不能发布到生产世界。

- `fixture-v1.json`：普通配方、特殊配方以及父母逆序输入；`fixture-pal-a + fixture-pal-b` 必须由特殊配方解析为 `fixture-pal-d`。
- `fixture-v2.json`：用于验证新增、删除和修改差异报告。
- `catalog-merge.json`：只引用统一目录最小 fixture 中的 Pal，用于构建本地不可变版本。
- `invalid-recipes.json`：覆盖字段、未知 Pal ID、重复、冲突和配方类型自相矛盾校验。

测试只读取这些仓库 fixture，不访问外网。
