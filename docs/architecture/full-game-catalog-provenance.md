# 完整游戏目录来源与兼容性

Catalog Schema 1.1.0 为真实七类目录增加 `source_provenance`。Schema 1.0.0 fixture 继续兼容，但 1.1.0 的应用层校验强制 provenance 存在、七类 count 均大于零，且兼容状态必须为 `exact_game_version_match`。

## 版本事实

客户端来源固定为 Steam App `1623730`。目标 Dedicated Server App ID 是受审计的配置输入；当前示例事实为 App `2394010`、Build `24181105`、游戏版本 `v1.0.1.100619`，程序和 Schema 不把服务器 App ID 或 Build ID 硬编码为永久常量。两个 App 的 Build ID 没有相等要求，必须分别记录。真实 candidate 只接受 `client_game_version == server_game_version == v1.0.1.100619`；不一致以 `SOURCE_GAME_VERSION_MISMATCH` 停止。

每次目标刷新必须使用版本隔离目录。inventory 会写入 `extraction-evidence-manifest.json`，把动态客户端 appmanifest、Mappings 与 source package hash 绑定到目标服务器事实。`doctor` 和 `extract` 在读取既有证据前校验该绑定；旧目标 manifest 或没有目标绑定的 legacy inventory 统一以 `STALE_EXTRACTION_EVIDENCE` 拒绝，绝不自动覆盖。旧 Mappings、client appmanifest hash、source-package-manifest、asset inventory、run-a/run-b、package hash 和 content hash 不跨游戏版本复用。

顶层 `game_build_id`、`game_version` 分别表示目标服务器 Build ID 和游戏版本。`extractor_name` 固定为 `palhatch-full-catalog-extractor`；`extractor_version` 是提取器 Git commit 或明确版本。

## 两类确定性哈希

`source-package-manifest.json` 按 `relative_path` 排序，覆盖提取实际读取的 `.pak`、`.utoc`、`.ucas`、客户端 appmanifest 和 `Mappings.usmap`，每项只有相对路径、大小、SHA-256 与 `file_kind`。

```text
package_hash = sha256(canonical-json(source-package-manifest.json))
```

它不是任一 appmanifest 的哈希。`content_hash` 则对七个已确定排序的 normalized JSONL 的文件名、记录数和 SHA-256 组成 canonical JSON 后计算；游戏资产、证据侧车和时间戳不进入 content hash。

## 反向证据

每条 normalized record 在 `source-evidence.json` 中至少对应一个原始内部标识和一个来源位置，位置由实际虚拟资产路径、row name、property chain 组成。候选评分只用于发现，不能写成事实来源。unresolved 记录使 extract 失败，excluded 与 warning 必须完整保留。

Schema 1.1.0 的非本地化记录还必须在 `metadata.source_internal_name` 保存同一个原始标识。实体 reader 的原始标识必须经 `palworld-stable-id-v1` 得到对应 normalized ID；不同原始值归一化碰撞时以 `GAME_ID_NORMALIZATION_COLLISION` 失败。C# verify 直接执行仓库共享 Schema，并核对 manifest counts/files/locales、checksums、validation report、extraction summary、引用和证据，不维护另一套可漂移的字段 Schema。

提取在 output 同级目录完成暂存和全量 verify，成功后才发布完整目录。`verify --compare` 用两个独立输出的 source package hash、content hash 与七个 JSONL 字节验证相同输入的复现性；package 使用确定性 tar 元数据和原子文件替换。

PalCalc 只作为 MIT 许可的固定代码参考：repository `tylercamp/palcalc`、commit `b822c7fda4f019bd7c57f45437f14a74061a29bc`。不得用其预生成 `db.json`/`breeding.json` 声称当前 Build 的权威事实。
