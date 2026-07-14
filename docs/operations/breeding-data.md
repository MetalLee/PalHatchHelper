# 配种数据供应链（Phase 4A）

Phase 4A 只负责配种事实的获取、暂存、转换、校验、版本化、差异审查和人工发布，不包含路线搜索。所有仓库 fixture 都是虚构数据。

## 安全默认值

- `BREEDING_REMOTE_SOURCES_ENABLED=false`：GitHub 和通用 HTTPS URL 默认完全禁用，禁用时不会发出请求。
- 每个来源还必须有自己的 `enabled=true`；数据库 `game_data_sources.enabled=false` 也会阻止导入开始。
- URL 只接受 HTTPS，拒绝带用户名的 URL 和非公网 IP 字面量。
- 默认超时 30 秒、最大 10 MiB，可通过 `BREEDING_SOURCE_TIMEOUT_SECONDS` 和 `BREEDING_SOURCE_MAXIMUM_BYTES` 收紧。
- Upload 不使用网络，但仍受启用开关和大小上限约束。
- 代码没有远程定时拉取或自动发布路径。

## 数据流

```text
GitHub / HTTPS URL / Upload Adapter
→ game-catalog/extraction/staging/<id>/source.bin
→ source-metadata.json（source type/version、raw SHA-256、UTC 时间）
→ strict source JSON 转统一 CatalogBreedingRecipe
→ Pal ID、字段、重复、冲突、自相矛盾、特殊优先级和仓库 fixture 校验
→ 本地 normalized/<content-hash> 不可变候选版本
→ catalog stage（仍只到 validated）
→ 管理员查看 diff
→ 管理员显式 publish
```

原始 SHA-256 写入候选 manifest 的 `package_hash`，来源版本写入 `game_version`；数据库导入后分别保存到 `game_data_versions.package_hash` 和 `game_data_versions.game_version`。抓取和本地候选构建均不会调用发布 RPC。

## 统一来源格式

来源 JSON 顶层只允许 `source_version` 和 `recipes`。每条记录必须包含两个父母、子代、类型和 metadata：

```json
{
  "source_version": "example-v1",
  "recipes": [
    {
      "parents": ["example-parent-b", "example-parent-a"],
      "child_pal_id": "example-child",
      "recipe_type": "special",
      "metadata": {}
    }
  ]
}
```

转换时父母按稳定英文 ID 排序。相同父母、相同类型只能对应一个子代；普通与特殊记录可以同时存在，但运行时始终先解析 `special`。同一父母和子代同时被标为普通与特殊会作为类型自相矛盾拒绝。

## 审核、发布与回滚

比较两个 validated/published 版本：

```bash
cd apps/agent
uv run pal-hatch-helper catalog diff \
  --from-version-id <旧版本 UUID> \
  --to-version-id <候选版本 UUID>
```

差异报告按父母对和配方类型稳定排序，分别列出 added、removed、changed、unchanged。普通玩家不能读取未发布版本差异。

发布和回滚继续使用显式管理员操作：

```bash
uv run pal-hatch-helper catalog publish --world-id <世界 UUID> --version-id <validated UUID>
uv run pal-hatch-helper catalog rollback --world-id <世界 UUID> --version-id <历史 published UUID>
```

发布/回滚在数据库事务中只改变指定世界的活动版本边界，不修改不可变目录事实，也不改写已有任务。任务创建时已经固定 `inventory_snapshot_id + game_data_version_id + algorithm_version + scoring_profile_version`，所以运行中和历史任务继续读取原精确版本。
