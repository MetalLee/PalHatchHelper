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

恢复审计后补齐了结构发现中的 FText/array/map/struct 与不依赖候选分数的 Blueprint CDO/组件枚举；C# verifier 直接执行共享 JSON Schema，并核对 counts、files、locales、checksums、validation report、summary、反向证据和 Stable ID 来源链。`extract` 采用同级暂存目录，全量验证成功后才发布；`verify --compare` 与重复 package 检测提供显式字节级复现性门禁。服务器 App ID 保持为配置事实，`2394010` 只留在示例配置中。

PalCalc 参考固定在 `tylercamp/palcalc@b822c7fda4f019bd7c57f45437f14a74061a29bc`；许可证副本与 notices 已进入工具目录。没有复制 UI、图片导出、地图或存档求解器，也没有把预生成数据当作 Build 事实。

## Fail-closed 状态

Linux 环境没有完整 Windows 客户端 PAK 与 `Mappings.usmap`，所以没有运行真实 inventory，没有确认当前 Build 的 DataTable/Blueprint property chain。生产 reader 当前保留 unresolved 状态，CLI `extract` 明确返回 `WINDOWS_ASSET_EXTRACTION_REQUIRED`。这不是七类 reader 的真实资产验收通过。

Windows workflow 已配置 `windows-latest`、.NET 10、restore/build/test，并在提取器、Stable ID vectors 或共享 Catalog Schema 变化时触发；本次 Linux 恢复没有伪造一次 Windows runner 的执行结果。

没有生成真实 normalized 目录、base version、validated candidate 或发布版本；`docs/reviews/phase-4-real-data-acceptance.md` 的 `pending`、`blocked` 与 `REAL_BASE_CATALOG_MISSING` 保持不变。

## 后续人工门禁

目标服务器已刷新为 Build `24181105` / `v1.0.1.100619`，但没有执行真实客户端资产提取。必须按 Windows 运行手册在全新的版本隔离目录中动态取得客户端 Build/appmanifest hash、Mappings hash 和 source package hash，再执行 doctor/inventory、审核七类来源字段、实现经证据确认的 reader，最后执行 extract/verify/package 与重复性检查。只有 exact game version match、七类非空、零 unresolved、完整反向证据和全部测试通过后，才可申请真实 candidate 的下一阶段批准。
