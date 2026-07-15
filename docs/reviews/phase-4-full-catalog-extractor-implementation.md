# Phase 4 完整目录提取器实现检查

- decision: `pending`
- implementation scope: Linux 仓库代码、契约、合成测试、Windows 工具与运行手册
- real asset validation: `not_run`
- candidate created: `no`
- published: `no`
- stable blocker: `REAL_BASE_CATALOG_MISSING`
- required next environment: `WINDOWS_ASSET_EXTRACTION_REQUIRED`

## 已实现边界

仓库新增 .NET 10/x64 提取器的 `doctor`、`inventory`、`extract`、`verify`、`package` 命令，固定 CUE4Parse/CUE4Parse-Conversion `1.2.2.202607`，并建立七个 reader 接口、资产发现清单、source package canonical hash、Catalog Schema 1.1.0 provenance、Stable ID v1 三语言 golden vectors、证据/校验/打包门禁与独立 Windows CI。

PalCalc 参考固定在 `tylercamp/palcalc@b822c7fda4f019bd7c57f45437f14a74061a29bc`；许可证副本与 notices 已进入工具目录。没有复制 UI、图片导出、地图或存档求解器，也没有把预生成数据当作 Build 事实。

## Fail-closed 状态

Linux 环境没有完整 Windows 客户端 PAK 与 `Mappings.usmap`，所以没有运行真实 inventory，没有确认当前 Build 的 DataTable/Blueprint property chain。生产 reader 当前保留 unresolved 状态，CLI `extract` 明确返回 `WINDOWS_ASSET_EXTRACTION_REQUIRED`。这不是七类 reader 的真实资产验收通过。

没有生成真实 normalized 目录、base version、validated candidate 或发布版本；`docs/reviews/phase-4-real-data-acceptance.md` 的 `pending`、`blocked` 与 `REAL_BASE_CATALOG_MISSING` 保持不变。

## 后续人工门禁

必须按 Windows 运行手册核对客户端/服务器游戏版本、生成并哈希 usmap、执行 doctor/inventory、审核七类来源字段、实现经证据确认的 reader，再执行 extract/verify/package 与重复性检查。只有 exact game version match、七类非空、零 unresolved、完整反向证据和全部测试通过后，才可申请真实 candidate 的下一阶段批准。
