# ADR 0004：版本化游戏目录的本地制品、Storage 与关系投影

- 状态：接受
- 日期：2026-07-14

## 背景

配种路线不仅依赖配方，还依赖同一游戏构建中的帕鲁、被动、主动技能、帕鲁技能关系、伙伴技能和本地化。历史任务必须精确重放当时的事实集合，而目录规模、许可边界和更新频率都不适合把真实全量生产目录直接提交到代码仓库。

## 决策

采用三层结构：Agent 自有数据目录保存只读原始提取结果；经过共享 Schema 校验、规范 JSONL、排序和 hash 的目录形成不可变版本包；Supabase PostgreSQL 用带 `version_id` 的关系表投影高频查询字段。完整标准化包以私有 `tar.gz` 存入 `game-catalog-artifacts`，PostgreSQL 只保存版本元数据、validation report 和可查询关系，不保存整个目录的单一 JSONB。

每个任务在创建事务中固定精确 `game_data_version_id`。Agent 按进程内缓存、SQLite、normalized、Storage、数据库投影的顺序加载该 UUID；缺失或损坏时返回稳定错误，禁止回退到当前活动、最新 published 或本地最近版本。

## 理由

不把全量目录提交到 Git，能避免仓库膨胀、来源许可不清和每次游戏更新产生巨型 diff；Git 只保留完全虚构的最小测试 fixture。单个 JSONB 无法自然提供帕鲁/被动搜索、父母组合唯一性、复合外键、RLS 和索引，也会迫使每次查询反序列化整个版本。制品保留可审计的完整输入，私有 Storage 支持 Agent 跨机器恢复，关系投影给浏览器和数据库校验提供稳定查询面，SQLite 则降低运行时重复下载和解析成本。

任务必须固定精确版本，因为发布和回滚只代表“现在使用哪个版本”，不能改变旧任务的事实。静默回退会生成看似成功但不可复现的历史结果，因此被明确禁止。

## 兼容迁移

Phase 2 的 `breeding_data_sources`、`breeding_data_versions`、`breeding_recipes`、`worlds.active_breeding_version_id` 和 `breeding_jobs.breeding_data_version_id` 暂不删除。前向迁移优先复用旧 UUID并回填 `game_data_*`；兼容触发器覆盖迁移后仍由旧 fixture/代码产生的写入。新版本发布时生成同 UUID 的旧配种投影并同步 world 指针；新任务双写旧字段，但 `game_data_version_id` 是权威字段。未来只有在所有消费者完成迁移且历史引用审计通过后，才可用单独 ADR 和补偿迁移移除旧模型。

## 不在本阶段实现真实游戏包解析

游戏包格式、第三方工具许可、资源限制和构建兼容性需要独立评审。Phase 2.5 只接收已结构化输入并验证完整数据链，未集成 CUE4Parse、FModel、retoc，也没有 `catalog extract` 命令。这样可以先验证版本、发布、回滚和历史复现边界，而不会把未经证明的提取结果误当成游戏事实。

## 后果

运维需要管理 Agent 自有数据目录和私有 Bucket 的保留策略；制品与关系投影会占用重复存储，但换来可重建缓存、关系约束和独立回滚。导入必须先上传不可变制品、分批 staging、事务 finalize，再由管理员发布。任何新增压缩格式都通过 manifest 的 `compression` 协商；本阶段只生产标准库支持的 `tar.gz`。
