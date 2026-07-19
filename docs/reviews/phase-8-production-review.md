# Phase 8 生产部署评审

评审日期：2026-07-20

```yaml
phase_8:
  admin_implementation: completed
  automated_gates: passed
  production_deploy: completed
  end_to_end_acceptance: completed
  first_release: completed
```

## 结论

Phase 8 管理员功能、数据库命令队列、非秘密运行设置和生产部署文件已在真实 Supabase、Vercel 与腾讯云 Agent 环境完成部署和验收。Palworld 与 mihomo 未被停止、重启、升级或修改。

## 自动化门禁

- PR #9 required CI 全部通过：Local Supabase database、Phase 5 browser acceptance、Python Agent、Structure/docs/secrets、Web/workspace 和 Vercel。
- 本次数据库修复在旧函数上先出现 2/35 失败，再在新增 migration 后达到 35/35；完整 Supabase 测试为 360 项通过。
- `supabase db lint` 只有 `persist_breeding_algorithm_result` 和 `resume_execution_plan` 的两条既有类型转换警告。
- 契约、Agent 类型与 lint、Web 构建、Playwright、secret scan、Compose config 均由本次提交 CI 或生产验证覆盖。

## 生产变更

- 应用 migration `20260720010000_allow_terminal_breeding_job_recreation.sql`。
- 修复任务创建语义：活动同指纹任务继续幂等复用；失败、完成或取消的历史任务不会阻止新任务。
- 部署 Agent 镜像 `78355c8@sha256:9e5959db…78a65`。
- 部署 Vercel `dpl_B1H2MzVqa9oYr62WpLEwNniNA5CB` 并把生产 alias 指向该版本。
- 写入一条 `healthy` deployment record，管理员概览显示部署 SHA `78355c8aa279e6abd5526917a9a1305f3bbd0d87`。

## Smoke 结果

| 范围                                   | 结果 |
| -------------------------------------- | ---- |
| Supabase migration / RLS               | 通过 |
| 真实目录 hash / 七类 counts            | 通过 |
| Agent API / 三个 Worker                | 通过 |
| 非 root、只读存档、loopback 端口       | 通过 |
| 管理员六路由及普通玩家拒绝             | 通过 |
| 绑定、存档、目录、任务、设置、审计     | 通过 |
| 玩家库存、共享、任务、路线、采用、推进 | 通过 |
| Template Provider 降级与自检           | 通过 |
| Service Role 与日志秘密扫描            | 通过 |
| Palworld / mihomo 不受影响             | 通过 |

## 回滚评审

部署过程实际演练了任务入口关闭、Vercel 回滚和 Agent previous-image 回滚，均验证成功。当前回滚引用记录在发布文档与生产备份中。目录只有一个 published version，不能伪造 previous pointer；数据库恢复必须使用向前补偿 migration 或受控备份恢复。

## 遗留限制

- 没有独立 Staging，第一版直接使用现有生产资源并依靠 dry-run、CI、备份和分层 smoke 控制风险。
- 外部 AI 不可用时由 Template Provider 降级。
- 生产域名为 Vercel project alias，独立品牌域名待后续配置。
- 子代确认和游戏操作始终由玩家人工完成。
