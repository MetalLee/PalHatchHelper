# 配种数据供应链（Phase 4）

Phase 4A/4B 只是实现检查点；正式验收仍以总实施计划的完整 Phase 4 为准。本流程负责配种事实的受控获取、暂存、精确基础目录合并、校验、版本化、差异审查和人工发布。所有仓库 fixture 都是虚构数据，不能替代真实来源的人工许可与真实性核验。

## 安全默认值

- `BREEDING_REMOTE_SOURCES_ENABLED=false`：GitHub 和通用 HTTPS URL 默认完全禁用，禁用时不会发出请求。
- 每个来源必须先由管理员或 service role 通过 `configure_game_data_source` RPC 以固定 UUID 登记并显式启用；普通玩家没有配置权限。
- GitHub 来源固定使用官方 raw host；通用 URL 只接受 HTTPS，拒绝凭证和非公网 IP 字面量。
- 默认超时 30 秒、最大 10 MiB，可通过 `BREEDING_SOURCE_TIMEOUT_SECONDS` 和 `BREEDING_SOURCE_MAXIMUM_BYTES` 收紧。
- Upload 不使用网络，但仍受来源启用状态和大小上限约束。
- 没有定时拉取、自动 stage 或自动发布路径；每一步都由明确命令触发。

## 来源与基础目录契约

来源 JSON 顶层必须声明它对应的精确基础目录：

```json
{
  "source_version": "example-v1",
  "base_content_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "game_build_id": "example-build",
  "game_version": "example-game-version",
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

`base_content_hash`、`game_build_id` 或 `game_version` 任一不等于指定 published 基础目录时，转换以 `BREEDING_BASE_CATALOG_MISMATCH` 终止，不生成候选。父母按稳定英文 ID 排序；同父母、同类型不能对应多个子代，特殊配方仍优先于普通配方。

候选保留基础目录的 `game_build_id`、`game_version` 和 `package_hash`。来源信息只写入受共享 Schema 约束的 `breeding_source_provenance`：source UUID/type/name/version、文件名、原始 SHA-256、UTC 获取时间和基础目录 content hash。数据库导入还会再次核对 provenance 中的 UUID 与 `--source-id`，操作者不能把候选任意归因给另一个来源。

## 受控准备与暂存

数据流：

```text
受审计且 enabled 的 source UUID
→ GitHub / HTTPS URL / Upload Adapter
→ game-catalog/extraction/staging/<id>/source.bin + source-metadata.json
→ 精确 published base catalog 校验与合并
→ normalized/<content-hash> 不可变候选
→ catalog stage（只到 validated）
→ 管理员 diff
→ 管理员显式 publish
```

准备 Upload 来源：

```bash
cd apps/agent
uv run pal-hatch-helper catalog prepare-breeding-source \
  --source-id <已登记来源 UUID> \
  --source-version <固定 release/commit> \
  --base-version-id <published 基础目录 UUID> \
  --upload-file <本地来源 JSON>
```

远程来源省略 `--upload-file`，Adapter 只使用该 source UUID 在数据库中登记的类型和 URL。命令成功只输出 `candidate_ready`、基础版本、来源 UUID 和候选 content hash；不会上传或发布。随后对输出的 normalized 目录执行：

```bash
uv run pal-hatch-helper catalog validate --input <normalized 目录>
uv run pal-hatch-helper catalog stage \
  --input <normalized 目录> \
  --source-id <同一来源 UUID>
```

## 审核、发布与回滚

比较当前与候选版本：

```bash
uv run pal-hatch-helper catalog diff \
  --from-version-id <当前 published UUID> \
  --to-version-id <候选 validated UUID>
```

配种 diff 按父母对和配方类型稳定排序。它只允许“同一精确基础目录上的配方变化”：Pal、被动、主动技能、Pal-主动技能关系、伙伴技能或本地化任一投影不同，都会以 `BREEDING_BASE_CATALOG_MISMATCH` 拒绝。普通玩家不能读取未发布版本差异。

发布时数据库在 world 活动指针切换前重复执行基础 content hash 与六类投影门禁，避免绕过 diff 直接发布隐藏变化：

```bash
uv run pal-hatch-helper catalog publish \
  --world-id <世界 UUID> \
  --version-id <validated 候选 UUID>
uv run pal-hatch-helper catalog rollback \
  --world-id <世界 UUID> \
  --version-id <历史 published UUID>
```

发布/回滚不修改不可变目录事实，也不改写已有任务。任务创建时固定 `world_id + inventory_snapshot_id + game_data_version_id + algorithm_version + scoring_profile_version`；运行时还核对目录 `content_hash`，所以当前指针切换不会改变已领取或历史任务的事实边界。

## 尚需人工完成

任何真实导入前，人工确认来源许可、固定 release/commit、对应游戏 build/version、原始哈希、特殊配方语义及抽样事实。未完成这些检查时，候选不得发布，也不能据此把 Phase 4 标记为最终验收完成。
