# Windows 完整游戏目录提取运行手册

本流程只在受控 Windows x64 工作站读取本机 Palworld 客户端资产。工具默认无网络，不下载 Mappings、不启动游戏、不读取存档、不连接 Supabase，也不输出图标、纹理、模型或音频。原始资产和标准化输出均不得提交 Git。

## 1. 准备与版本核对

安装 .NET 10 SDK 与 x64 Palworld 客户端，检出本仓库后执行：

```powershell
cd tools/palworld-catalog-extractor
dotnet restore PalworldCatalogExtractor.sln -p:Platform=x64
dotnet build PalworldCatalogExtractor.sln -c Release -p:Platform=x64 --no-restore
dotnet test PalworldCatalogExtractor.sln -c Release -p:Platform=x64 --no-build
$Config = "../../data/game-catalog/extraction/v1.0.1.100619/extraction.json"
New-Item -ItemType Directory -Force (Split-Path $Config) | Out-Null
Copy-Item config/extraction.example.json $Config
```

本轮目标服务器事实固定为 App ID `2394010`、Build ID `24181105`、游戏版本 `v1.0.1.100619`、appmanifest SHA-256 `98ef29829ebfde6d71528f5a83883e6bfda96fa77ce363e52630205353c1a189`。这些值来自忽略目录中的本地审计证据，不能从旧报告复制。

只读核对 `steamapps/appmanifest_1623730.acf` 的 App ID、Build ID、`LastUpdated` 和 SHA-256，并把工作站实际路径写入 `$Config`。客户端 Build ID、客户端 appmanifest SHA-256、Mappings.usmap SHA-256 和 source package hash 必须在本次 Windows 运行中动态取得，示例配置不得预填。客户端游戏内自报版本必须满足 `client_game_version == server_game_version == v1.0.1.100619`；否则以 `SOURCE_GAME_VERSION_MISMATCH` 立即停止。Client Build ID 与 Server Build ID 可以不同，不能据此判不兼容。

每个目标版本使用全新目录：输入证据使用 `data/game-catalog/extraction/v1.0.1.100619/`，回传包只进入 `data/game-catalog/incoming/24181105/`。不要把旧目录复制为新目录的起点。

若 output 中存在旧 `manifest.json`、`extraction-evidence-manifest.json`，或存在没有目标绑定 manifest 的 legacy inventory，`doctor`/`extract` 必须以 `STALE_EXTRACTION_EVIDENCE` 停止。不得自动覆盖或复用 Build `24088465` / `v1.0.0.100427` 的 Mappings、client appmanifest hash、source-package-manifest、asset inventory、run-a/run-b、package hash 或 content hash。

## 2. 生成 Mappings.usmap

由人工从已审核、与当前客户端兼容的 UE4SS 发行物安装 Mapping Generator；不要让提取器或脚本自动下载、自动安装或启动游戏。启动客户端一次生成 `Mappings.usmap`，退出游戏后将该文件复制到仓库外或 `data/game-catalog/` 的忽略目录，并计算 SHA-256。不要提交 UE4SS、生成日志或 usmap。

生成完成后禁用 Mapping Generator；若不再需要 UE4SS，删除客户端中本次人工加入的 UE4SS 文件并通过 Steam 客户端验证游戏文件。禁止对 Dedicated Server 或 `/opt/palworld` 执行该操作。

## 3. Doctor 与 inventory

编辑忽略目录中的 `extraction.json`，路径使用本机绝对路径。示例中的服务器事实仅是待核对输入，不是程序硬编码。

```powershell
dotnet run --project src/PalworldCatalogExtractor -c Release -- doctor --config $Config
dotnet run --project src/PalworldCatalogExtractor -c Release -- inventory --config $Config
```

`doctor` 必须全部通过：Windows x64、.NET 10、PAK 目录、`Pal-Windows.pak`、可解析 usmap、客户端 appmanifest、只读输入、至少 10 GiB 空间，以及 output 命中 Git ignore 且没有 tracked file。`inventory` 只生成五个结构清单、来源包指纹和目标绑定 manifest，不导出资产内容。

inventory 会无条件枚举 DataTable row struct/字段，以及 Blueprint CDO 和组件中的 SoftObject、SoftClass、FName、FText、enum、array、map、struct 关系；关键词评分只另外写入 unresolved candidate，不会限制结构发现范围或自动确认字段。

## 4. Codex 资产字段确认

将六个 inventory JSON 保留在忽略目录，交给 Codex/人工逐项确认七类 reader 的真实 DataTable、row struct、Blueprint CDO/组件、字段类型和 property chain。候选评分不能直接升级为事实。每一个最终字段映射都要经过代码评审并进入 `source-evidence.json`；所有 unresolved candidate 必须解决或以明确 excluded reason 审核，不能静默丢弃。

在该确认提交完成并重新通过 Windows CI 前，`extract` 应返回 `WINDOWS_ASSET_EXTRACTION_REQUIRED`。不得临时填充 fixture 或猜测 Pal 元素、主动技能、伙伴技能。

## 5. Extract、verify 与 package

确认所有事实来源且客户端/服务器游戏版本仍完全一致后运行：

```powershell
dotnet run --project src/PalworldCatalogExtractor -c Release -- extract --config $Config
dotnet run --project src/PalworldCatalogExtractor -c Release -- verify --config $Config
dotnet run --project src/PalworldCatalogExtractor -c Release -- package --config $Config
```

`extract` 先在 output 同级暂存目录生成、校验所有文件，只有成功后才切换完整目录；失败不会留下半套 normalized 文件，也不会覆盖已保留的 inventory。若 output 含未知文件、目录或链接，会以 `CATALOG_OUTPUT_UNSAFE` 停止。

人工复核 `validation-report.json` 为 valid、七类 count 全部大于零、provenance 为 exact match、source evidence 可反向追踪。然后复制一份配置，仅把 `output_path` 改为另一个新的 Git-ignored 目录，在完全相同输入上再次运行 `extract`，并执行内置复现性比较：

```powershell
dotnet run --project src/PalworldCatalogExtractor -c Release -- verify --config $Config --compare C:\PalHatchHelper-output\v1.0.1.100619-run-b
```

结果必须包含 `reproducibility_status: identical`；工具会比较 source package hash、content hash 和七个 JSONL 的实际字节。压缩包名为 `palworld-catalog-<server-build-id>-<content-hash-short>.tar.zst`，只能包含 normalized JSON、证据 JSON、manifest、验证报告和校验和；相同目标名再次打包时也必须逐字节一致。

## 6. 传回腾讯云

使用组织批准的加密传输通道把 `.tar.zst` 与人工审核记录上传到腾讯云的 Agent 自有暂存目录。不得上传 PAK、IoStore、usmap、appmanifest、UE4SS、存档或 Steam 用户信息；不得把任何原始文件或标准化数据加入 Git。上传后先离线 `verify`/哈希核对，另行获得 Phase 4 candidate 授权前禁止 stage、publish 或修改 pending 状态。
