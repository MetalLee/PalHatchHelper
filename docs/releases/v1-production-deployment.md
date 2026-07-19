# PalHatchHelper v1 生产发布记录

发布日期：2026-07-20（Asia/Shanghai）

## 发布标识

- 部署 Git SHA：`78355c8aa279e6abd5526917a9a1305f3bbd0d87`
- Supabase 最新 migration：`20260720010000_allow_terminal_breeding_job_recreation.sql`
- Agent 镜像：`ghcr.io/metallee/palhatch-agent:78355c8@sha256:9e5959db53875c4894847a795f0a3a29a93f569c6aec62af66b9875214b78a65`
- Vercel deployment：`dpl_B1H2MzVqa9oYr62WpLEwNniNA5CB`
- Vercel deployment URL：`https://pal-hatch-helper-6nct4mnqp-devil-s-claw.vercel.app`
- 生产域名：`https://pal-hatch-helper-web.vercel.app`

## 数据库与目录

Supabase dry-run 只列出 `20260720010000`，应用后 local/remote migration list 一致。生产权限烟测确认 admin 可调用管理员 RPC，普通玩家得到稳定的 `ADMIN_ACCESS_DENIED`。

活动目录版本：

- version：`b5feaeb9-5480-4ba5-b30d-a4c65531787e`
- content hash：`872e4a79af5b5043ee97d9a4287a41bba407afc96ff3b0a6de56fff827d334b3`
- package hash：`8c36cb60e4f78c3e4c7681cde602539b4b85f160d26392ed0144f728c6f191a9`
- Build：`24181105`
- 游戏版本：`v1.0.1.100619`

七类计数：

| 实体              |  数量 |
| ----------------- | ----: |
| pals              |   288 |
| passive_skills    |   115 |
| active_skills     |   227 |
| pal_active_skills |  2200 |
| partner_skills    |   287 |
| breeding_recipes  | 41617 |
| localizations     |  6234 |

## 生产验收

- 管理员六个路由、绑定历史、存档/Parser、目录、任务、设置和审计均通过 iPhone 宽度烟测。
- 普通玩家访问 `/admin` 时由服务端拒绝。
- 管理员 bootstrap 幂等完成，并已写入审计；没有创建明文密码或修改其他用户。
- 玩家库存读取、共享开关及恢复、目录状态和配种表单通过。
- 同一输入在旧失败任务终态后成功创建新任务，证明终态历史不会被错误复用。
- Worker 完成确定性任务并返回三条路线；Template Provider 降级状态符合预期。
- 玩家完成路线比较、采用方案并把首步骤标记为 `breeding`；未确认子代。
- 设置临时更新后成功回滚上一版本，最终任务创建保持开启。
- Template Provider 自检命令由 command-worker 完成，无命令失败。
- HTML、响应和 Agent 日志扫描未发现 Service Role 或生产秘密。

## 运行安全

- Agent API 仅绑定 `127.0.0.1:18765`，其余 Worker 没有主机端口。
- 四个 Agent 容器均使用 UID/GID `10001:10001`、只读根文件系统、`cap_drop: ALL` 和 `no-new-privileges`。
- 存档挂载为只读；Agent 数据目录由非 root 读写探针验证。
- Agent 未使用 host network，未挂载 Docker socket，并配置资源限制与日志轮转。
- `/opt/palworld/docker-compose.yml` SHA-256 保持 `a87dff0aff365e3f37a5cb0a14a84127587f664d8e1eff9c618656975bdb74f0`。
- Palworld 容器 ID 未变化、重启计数为 0；mihomo 启动于本次部署前且重启计数为 0。

## 备份与回滚

- 备份：`/data/projects/PalHatchHelper/data/backups/20260719T205320Z/`
- 备份目录权限：`0700`
- 上一 Vercel deployment：`dpl_7eKmtAaKiEj2W5R4rSAqGwWcN2XH`
- 上一 Agent 镜像：`ghcr.io/metallee/palhatch-agent:fd28e73@sha256:796b41c5ff46e7dbac8c46b5c76e0e54dfc87157da013e23cf9a5a5d6be741fa`
- 发布期间曾因烟测失败关闭任务入口并完成 Web/Agent 回滚；修复、CI 和 migration 通过后重新发布成功。
- 数据库变更是向前 migration；补偿时必须新增 migration，不得修改历史。

## 已知限制

- 当前只有一个 published catalog version，因此没有安全的 previous world pointer 可供目录回滚；发布失败时保留当前目录并停止后续部署。
- 外部 AI Provider 当前不可用时使用 Template Provider；AI 只解释确定性路线。
- 生产域名当前使用 Vercel project alias，尚未配置独立品牌域名。
- 系统不会自动确认子代、修改存档或操作游戏。
