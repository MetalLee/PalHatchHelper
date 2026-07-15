# 游戏静态目录操作手册

Phase 2.5 只处理已经结构化的目录输入，不读取真实游戏包。仓库内 `data/catalog-fixtures/minimal-valid` 是完全虚构数据。

## 本地目录

`PALHATCH_DATA_DIR` 指向 Agent 自有数据根目录。开发测试使用临时目录；生产部署建议显式设置为 `/opt/services/palworld-manager/data`，但代码不写死该路径。Agent 会在其下创建 `game-catalog/extraction`、`normalized`、`bundles`、`cache` 和 `runtime`。

```dotenv
PALHATCH_DATA_DIR=./data
GAME_CATALOG_BUCKET=game-catalog-artifacts
GAME_CATALOG_CACHE_MAX_VERSIONS=2
```

## CLI

离线校验不需要 Supabase：

```bash
cd apps/agent
uv run pal-hatch-helper catalog validate \
  --input ../../data/catalog-fixtures/minimal-valid
```

以下命令只允许连接显式配置的测试 Supabase，并使用 Service Role。不要在 shell 历史、日志或提交文件中写入真实密钥：

```bash
uv run pal-hatch-helper catalog stage --input <normalized-dir>
uv run pal-hatch-helper catalog publish --world-id <uuid> --version-id <uuid>
uv run pal-hatch-helper catalog rollback --world-id <uuid> --version-id <uuid>
uv run pal-hatch-helper catalog warm-cache --version-id <uuid>
uv run pal-hatch-helper catalog inspect --version-id <uuid>
uv run pal-hatch-helper catalog diff --from-version-id <uuid> --to-version-id <uuid>
```

`stage` 按 JSONL 类别分批写入并在数据库事务中 finalize。相同 `content_hash` 重试复用已有版本；批次幂等键相同但内容不同会失败。`publish` 要求七类投影均非空且版本为 validated。`rollback` 只切换指定世界指针。

Phase 4A 配种来源的 staging、特殊配方优先级和人工审核流程见 [`breeding-data.md`](./breeding-data.md)。

完整 Windows 游戏资产发现与七类目录提取是独立的离线工具链，见 [`full-game-catalog-extraction-windows.md`](./full-game-catalog-extraction-windows.md)。Linux Agent 仍不读取游戏包；Windows 输出在真实性审核和明确批准前不得 stage 或 publish。

## 精确版本故障处理

`GAME_DATA_VERSION_NOT_FOUND`、`GAME_DATA_ARTIFACT_MISSING`、`GAME_DATA_HASH_MISMATCH`、`GAME_DATA_SCHEMA_UNSUPPORTED` 和 `GAME_DATA_CACHE_CORRUPTED` 都是稳定错误码。缓存元数据不匹配或 SQLite 损坏时可删除 `cache/<version-id>.sqlite` 后从同一精确版本重建；不得改用当前世界版本或其他本地版本。制品/hash/关系本身损坏时停止加载并调查，不通过清缓存掩盖事实错误。

## 禁止上传

Bucket 只能保存标准化目录包、manifest 和 validation report。禁止上传 `.pak`、`.utoc`、`.ucas`、游戏安装目录、完整存档、图标、音频、模型或其他游戏二进制资产。
