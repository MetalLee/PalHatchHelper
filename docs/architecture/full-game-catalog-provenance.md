# 完整游戏目录来源与兼容性

Catalog Schema 1.1.0 为真实七类目录增加 `source_provenance`。Schema 1.0.0 fixture 继续兼容，但 1.1.0 的应用层校验强制 provenance 存在、七类 count 均大于零，且兼容状态必须为 `exact_game_version_match`。

## 版本事实

客户端使用 Steam App `1623730`，目标 Dedicated Server 使用 App `2394010`。两个 App 的 Build ID 没有相等要求，必须分别记录。真实 candidate 只接受客户端和服务器进程自报的游戏版本字符串完全一致；`mismatch` 或 `unknown` 都必须停止。

顶层 `game_build_id`、`game_version` 分别表示目标服务器 Build ID 和游戏版本。`extractor_name` 固定为 `palhatch-full-catalog-extractor`；`extractor_version` 是提取器 Git commit 或明确版本。

## 两类确定性哈希

`source-package-manifest.json` 按 `relative_path` 排序，覆盖提取实际读取的 `.pak`、`.utoc`、`.ucas`、客户端 appmanifest 和 `Mappings.usmap`，每项只有相对路径、大小、SHA-256 与 `file_kind`。

```text
package_hash = sha256(canonical-json(source-package-manifest.json))
```

它不是任一 appmanifest 的哈希。`content_hash` 则对七个已确定排序的 normalized JSONL 的文件名、记录数和 SHA-256 组成 canonical JSON 后计算；游戏资产、证据侧车和时间戳不进入 content hash。

## 反向证据

每条 normalized record 在 `source-evidence.json` 中至少对应一个原始内部标识和一个来源位置，位置由实际虚拟资产路径、row name、property chain 组成。候选评分只用于发现，不能写成事实来源。unresolved 记录使 extract 失败，excluded 与 warning 必须完整保留。

PalCalc 只作为 MIT 许可的固定代码参考：repository `tylercamp/palcalc`、commit `b822c7fda4f019bd7c57f45437f14a74061a29bc`。不得用其预生成 `db.json`/`breeding.json` 声称当前 Build 的权威事实。
