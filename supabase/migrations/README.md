# 迁移规范

SQL 文件按 UTC 时间戳命名并按身份/库存、配种数据、任务结果、RLS、RPC 的依赖顺序执行。已应用迁移不得修改，只能追加向前迁移或补偿迁移。

每个 `SECURITY DEFINER` 函数必须固定 `search_path`、显式 revoke/grant 并具有负向权限测试。每张业务表必须在同阶段明确 RLS 和表级授权。完整规则与回滚顺序见 `docs/operations/database-migrations.md`。
