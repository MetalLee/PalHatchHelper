# PalHatchHelper 生产运行手册

## 固定边界

- 不修改 `/opt/palworld/docker-compose.yml`，不对该目录执行 Compose。
- 不停止、重启或升级 Palworld、mihomo。
- 原始存档只允许只读挂载和复制，禁止修改。
- Agent API 只能绑定 `127.0.0.1:18765`；不开放新公网端口。
- 不设置系统或 Docker 全局代理；镜像仓库连接应在命令作用域内绕过代理。
- 浏览器只能使用用户 JWT，Service Role 仅供 Web Server Route、Agent 和受控运维脚本使用。
- 只新增向前 migration；不删除任务、计划、快照或目录历史。

## 日常状态检查

在仓库根目录执行：

```bash
ENV_FILE="$PWD/.env.production" infra/agent/scripts/verify-production.sh
docker compose \
  --project-name palhatchhelper-agent \
  --env-file .env.production \
  -f infra/agent/docker-compose.production.yml \
  ps
```

确认 API 为 healthy，`job-worker` 与 `command-worker` 为 running，`save-worker` 保持停止，只有
`127.0.0.1:18765` 对外映射。检查运行中容器的用户、只读根文件系统、能力、禁止提权、资源限制、
日志轮转以及 Command Worker 的 `/palworld-save` 为 `RW=false`。

## 发布顺序

1. 确认 main/发布 SHA、required CI、工作区、生产环境文件权限和目标游戏版本。
2. 运行 `infra/agent/scripts/backup-production.sh`，确认备份目录为 `0700`。
3. 用明确 project ref 检查 Supabase link；先 `supabase db push --linked --dry-run`，再执行 push。
4. 完成 RLS、RPC、目录 hash 与 counts smoke，失败时停止 Web/Agent 部署。
5. 使用 Git 短 SHA 构建并推送 Agent 镜像，记录 registry digest；禁止 `latest`。
6. 更新本地 `.env.production` 的不可变镜像、Git SHA 和 tag，权限保持 `0600`。
7. 先执行部署脚本 `--dry-run`，再执行正式部署。
8. 验证非 root 目录读写、Agent 加固和只读存档挂载。
9. 执行 Vercel production build/deploy，显式确认生产 alias 指向新 deployment。
10. 依次完成管理员、普通玩家和端到端 smoke，最后写入 `healthy` deployment record。

## Agent 部署

```bash
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
ENV_FILE="$PWD/.env.production" infra/agent/scripts/deploy-production.sh --dry-run
ENV_FILE="$PWD/.env.production" infra/agent/scripts/deploy-production.sh
```

部署脚本只允许重建 `api`、`job-worker` 和 `command-worker`。`save-worker` 不参与部署、验证或回滚，
后续存档同步由 `palbeacon-cli` 接管。失败时脚本自动使用记录的 previous immutable image 回滚这三个服务。

## 失败处置

核心 smoke 失败时按顺序执行：

1. 管理员设置关闭新任务创建。
2. 将 Vercel production alias 回滚到上一健康 deployment。
3. 执行 `infra/agent/scripts/rollback-production.sh`。
4. 仅在存在安全 previous world pointer 时回滚目录；否则保持目录并停止。
5. 数据库只使用新增补偿 migration 或受控备份恢复。
6. 保留失败任务、版本、日志安全摘要和审计记录。

回滚后重新运行 Agent 验证、Web 健康检查和普通玩家管理员拒绝测试。不要操作 Palworld 或 mihomo。

## 存档与目录

- 首次或手动同步必须走 `sync_save_once` 命令队列。
- 数量异常下降时保留待审核快照；Parser 失败时继续使用上一有效库存。
- Agent 原始快照清理仅作用于 Agent 自有目录，并遵循运行设置保留数量。
- Supabase 标准化帕鲁与物品库存明细由 Service Role 清理 RPC 按 30 分钟、小批次策略处理；
  最新有效库存、业务历史和共享偏好不得删除。五分钟公会采样独立保留 2 小时。清理积压或失败时
  先停止新增同步并检查 RPC 结果与 autovacuum，不直接执行高锁表维护。
- 目录 validate、stage、finalize、publish 和 rollback 必须使用现有 Catalog 流程，禁止直接 SQL 绕过。

## 秘密与日志

- `.env.production` 权限必须是 `0600`，不得提交 Git。
- 运维输出不得打印环境值、JWT、Service Role、数据库密码或 AI 密钥。
- 发布后扫描三个运行中的 Agent 容器日志，确认生产秘密值未出现。
- 管理员页面只允许显示 `configured`、`not_configured` 和 `last_checked_at`。
- Vercel 服务端配置 `SUPABASE_SERVICE_ROLE_KEY` 与可选的 `STEAM_WEB_API_KEY`，二者均不得使用
  `NEXT_PUBLIC_` 前缀；不得记录 magic-link token hash 或 Sync 设备 token。
- Steam 登录与 Sync API 响应保持 `private, no-store`。撤销设备后用该设备 token 的 heartbeat 和上传都应立即返回 401。

## 当前发布参考

当前生产发布、备份、目录、镜像、Vercel deployment 和回滚引用见 [v1-production-deployment.md](../releases/v1-production-deployment.md)。
