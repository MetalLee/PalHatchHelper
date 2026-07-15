# Phase 4 目标 Build 刷新审计：24181105

- decision: `pending`
- refresh scope: 配置、陈旧证据门禁、测试与 Windows 运维文档
- real asset extraction: `not_run`
- candidate created: `no`
- database action: `none`
- stable blocker: `REAL_BASE_CATALOG_MISSING`

## 目标变更与本地证据

本轮唯一服务器事实来源为被 Git 忽略的本地证据文件 `data/game-catalog/extraction/evidence/server-24181105.env`。没有从旧报告猜测或保留 appmanifest SHA-256 和 `LastUpdated`。

| 字段                       | previous                 | new                                                                |
| -------------------------- | ------------------------ | ------------------------------------------------------------------ |
| server Steam App ID        | `2394010`                | `2394010`                                                          |
| server Steam Build ID      | `24088465`               | `24181105`                                                         |
| server game version        | `v1.0.0.100427`          | `v1.0.1.100619`                                                    |
| server appmanifest SHA-256 | 历史值只保留在旧验收报告 | `98ef29829ebfde6d71528f5a83883e6bfda96fa77ce363e52630205353c1a189` |
| appmanifest `LastUpdated`  | 历史值只保留在旧验收报告 | `1784111967` / `2026-07-15T10:39:27Z`                              |

证据原始采集使用以下只读命令；本次仓库任务只读取上述本地证据文件，没有重新访问 `/opt/palworld` 或容器：

```bash
manifest=/opt/palworld/data/steamapps/appmanifest_2394010.acf
sed -n -E '/"(appid|buildid|LastUpdated|StateFlags)"/p' "$manifest"
sha256sum -- "$manifest"
last_updated=$(sed -n -E 's/.*"LastUpdated"[[:space:]]+"([0-9]+)".*/\1/p' "$manifest")
date -u -d "@$last_updated" '+%Y-%m-%dT%H:%M:%SZ'
docker logs palworld 2>&1 | grep -m1 'Game version is v'
```

## 旧目标值搜索与修改清单

对 `24088465`、`v1.0.0.100427` 和 `5dd1c163956fb8aff7ae7c0bc2e2ef1ed38ccb594919d3cc58d1ac1674a49b8c` 的逐项分类如下，没有执行全局替换：

| 分类              | 文件                                                                                                                 | 动作                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 历史审计文档      | `docs/reviews/phase-4-real-data-acceptance.md`                                                                       | 原样保留旧 Build、旧版本、旧 hash 与 `REAL_BASE_CATALOG_MISSING`           |
| 当前运行模板      | `tools/palworld-catalog-extractor/config/extraction.example.json`                                                    | 更新为 Build `24181105` 的新服务器事实；客户端动态 hash/build 字段仍不预填 |
| Windows 运维文档  | `docs/operations/full-game-catalog-extraction-windows.md`                                                            | 更新目标、错误码、版本目录和动态采集要求                                   |
| 当前架构/实现说明 | `docs/architecture/full-game-catalog-provenance.md`、`docs/reviews/phase-4-full-catalog-extractor-implementation.md` | 更新当前目标与陈旧证据拒绝规则                                             |
| 测试 fixture      | .NET 合成兼容性 fixture                                                                                              | 使用 `fixture-*`/`v-next` 等通用值，不绑定真实生产 Build                   |
| 程序硬编码        | 搜索未发现旧 Build、旧版本或旧 server appmanifest hash 的程序硬编码                                                  | 目标事实继续来自 config/manifest                                           |
| 旧输出数据        | Git 中无 `data/game-catalog` 跟踪文件                                                                                | 不迁移、不提交、不复用                                                     |

本报告为目标切换审计，因此明确记录 previous 值；它不替代也不修改旧验收报告。

## 作废与隔离规则

Build `24088465` / `v1.0.0.100427` 尚未生成 candidate，因此没有数据库回滚、candidate 清理或 world 指针动作。下列旧产物全部作废且不得复用：

- 旧客户端提取证据和 client appmanifest hash；
- 旧 `Mappings.usmap`；
- 旧 `source-package-manifest.json` 与 asset inventory；
- 旧 run-a/run-b；
- 旧 package hash 与 content hash。

新运行使用：

```text
data/game-catalog/extraction/v1.0.1.100619/
data/game-catalog/incoming/24181105/
```

若既有 catalog manifest、`extraction-evidence-manifest.json` 声明其他目标，或 legacy inventory 没有目标绑定 manifest，`doctor`/`extract` 必须返回 `STALE_EXTRACTION_EVIDENCE`，不得覆盖原目录。

## 兼容性、依赖与发布门禁

客户端 App ID 仍为 `1623730`，服务器 App ID 仍为 `2394010`；两者 Build ID 可以不同。只有 `client_game_version == server_game_version == v1.0.1.100619` 才允许写入 `exact_game_version_match`，否则返回 `SOURCE_GAME_VERSION_MISMATCH`。

PalCalc 继续固定为 `tylercamp/palcalc@b822c7fda4f019bd7c57f45437f14a74061a29bc`、MIT；CUE4Parse 与 CUE4Parse-Conversion 继续固定为 `1.2.2.202607`。本次没有依赖升级，也没有用 PalCalc 预生成数据代替新客户端资产事实。

七类完整目录发布门禁没有改变：pals、passive skills、active skills、pal-active skills、partner skills、breeding recipes、localizations 必须全部非空、validated、零 unresolved，并具有完整反向证据。本次未执行真实提取、未生成 normalized JSONL、未生成 package、未连接生产 Supabase、未 stage/publish 数据。

Phase 4 继续保持 `real_data_acceptance=pending`、`production_publish=blocked`；`REAL_BASE_CATALOG_MISSING` 持续存在，直到 Build `24181105` / `v1.0.1.100619` 的七类目录成功 validated。
