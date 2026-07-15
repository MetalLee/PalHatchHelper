# Phase 4 Full Catalog Extraction Audit — Server Build 24181105

## 审计范围

本报告记录 Palworld Dedicated Server Build `24181105` 对应的完整目录提取公开元数据。真实 inventory、七类 JSONL、源证据和发布包均保存在 Git 仓库之外，不纳入版本控制。

## 目标与来源版本

| 项目                            | 值                                                                 |
| ------------------------------- | ------------------------------------------------------------------ |
| Server App ID                   | `2394010`                                                          |
| Server Build ID                 | `24181105`                                                         |
| Server game version             | `v1.0.1.100619`                                                    |
| Server appmanifest SHA-256      | `98ef29829ebfde6d71528f5a83883e6bfda96fa77ce363e52630205353c1a189` |
| Client App ID                   | `1623730`                                                          |
| Client Build ID                 | `24181527`                                                         |
| Client game version             | `v1.0.1.100619`                                                    |
| Client appmanifest SHA-256      | `e0751824680f7de12cf79ee77ec888b8d2cdba9f682d7667c0562bb05f6450c6` |
| Compatibility status            | `exact_game_version_match`                                         |
| Mappings.usmap SHA-256          | `561ef13c8ee3cf785e4de8aa5bc9b3ad1646e416d895f1d1166fa27ebdfd26b0` |
| Source package manifest SHA-256 | `ed7d9aefb8cae7f4e29810bc7bcd5155f0dec147ac25527eb24a10a30f6b182a` |
| Extractor commit                | `705f9144a0f1c8891a3129e7db1db597ab97a109`                         |
| CUE4Parse version               | `1.2.2.202607`                                                     |
| PalCalc reference               | `tylercamp/palcalc@b822c7fda4f019bd7c57f45437f14a74061a29bc` (MIT) |

客户端与服务端属于不同 Steam App，因此 Build ID 不要求相等；两者 game version 完全一致后才记录 `exact_game_version_match`。

## 提取结果

| 数据类            |  Count |
| ----------------- | -----: |
| Pals              |    288 |
| Passive skills    |    115 |
| Active skills     |    227 |
| Pal-active skills |  2,200 |
| Partner skills    |    287 |
| Breeding recipes  | 41,617 |
| Localizations     |  6,234 |

| 门禁统计        | Count |
| --------------- | ----: |
| Excluded        | 6,058 |
| Unresolved      |     0 |
| ID collision    |     0 |
| Recipe conflict |     0 |

所有七类 count 均大于零。未解析 Pal element、Pal-active skill relation、partner skill、stable ID、localization reference、silent exclusion、ID collision 和 recipe conflict 门禁均为零。

## 重复性与打包

| 项目                   | 值                                                                 |
| ---------------------- | ------------------------------------------------------------------ |
| Run A content hash     | `872e4a79af5b5043ee97d9a4287a41bba407afc96ff3b0a6de56fff827d334b3` |
| Run B content hash     | `872e4a79af5b5043ee97d9a4287a41bba407afc96ff3b0a6de56fff827d334b3` |
| Reproducibility status | `identical`                                                        |
| Package filename       | `palworld-catalog-24181105-872e4a79af5b.tar.zst`                   |
| Package SHA-256        | `8c36cb60e4f78c3e4c7681cde602539b4b85f160d26392ed0144f728c6f191a9` |

Run A 与 Run B 的七类 JSONL 哈希、content hash、package hash、source package manifest hash、counts 以及 excluded/unresolved/conflict 统计完全一致。最终包连续生成两次后字节级 SHA-256 一致；归档仅包含 13 个白名单目录文件，不包含原始游戏资产、mapping、appmanifest、DLL 或 EXE。

## 验证结果

- `dotnet restore`、`dotnet build`、`dotnet test` 通过；提取器测试 50/50 通过。
- `doctor` 通过，并使用新 mapping 实际解析目标版本资产。
- `inventory`、Run A、Run B、两轮 `verify`、reproducibility compare 和 `package` 均通过。
- contracts drift、structure、forbidden-assets、secret scan、相关 lint、TypeScript typecheck、JavaScript tests 与受影响包 build 通过。
- Ruff lint、Ruff format 与旧配种来源兼容性测试通过。

## 已知限制

- 根目录 `pnpm check` 在全仓 Prettier 阶段被 162 个既有 Windows 换行差异阻断；本次变更文件已单独执行格式检查。
- Web 的 Next.js build 已完成编译、类型检查与静态页面生成，随后在 Windows standalone symlink 创建阶段因 `EPERM` 失败。
- Agent 全量 mypy 仍报告 18 个既有 POSIX 属性错误；全量 pytest 在 Windows 收集阶段因 `resource` / `fcntl` 不可用产生 7 个错误。与本次配种性别兼容变更直接相关的 Python 测试已通过。
- 当前 Node.js 为 `v24.16.0`，仓库声明目标为 Node.js 22.x；pnpm 因此输出 engine warning。
