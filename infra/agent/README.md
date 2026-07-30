# Agent production Compose

`docker-compose.production.yml` 只管理 PalHatchHelper 的 `api`、`job-worker`、`save-worker` 和 `command-worker`。它不连接 Palworld Docker 网络、不挂载 Docker socket、不使用 host network，并且只把健康端口映射到 `127.0.0.1:18765`。

四个容器固定使用 UID/GID 10001、只读根文件系统、`cap_drop: ALL`、`no-new-privileges`、资源/PID 限额和日志轮转。Agent 数据目录可写；Palworld Compose、源存档和 Parser bundle 均只读。镜像变量必须是 `repository:git-tag@sha256:digest`，拒绝 `latest`。

Save Worker 使用 Parser 1.3.0 的单一自包含 Linux x64 可执行文件。公共 npm 包另行携带同源码的 Windows x64 Parser，但不改变 Linux Agent Compose。Compose 不再要求或挂载外部解压运行库；旧部署 `.env` 中即使暂时残留已废弃变量，也不会被新 Compose 传入容器。Parser bundle 仍必须只读挂载，并继续受独立进程、Landlock/seccomp、CPU、内存、PID、超时和 64 MiB 输出限制保护。

`.env.production.example` 只有假值。真实文件位于部署目录、权限必须为 `0600`，不得提交。开发阶段只执行静态配置检查：

```bash
docker compose \
  --env-file infra/agent/.env.production.example \
  -f infra/agent/docker-compose.production.yml \
  config --quiet
bash -n infra/agent/scripts/*.sh
```

生产部署、验证、备份、回滚和首次管理员脚本都支持 `--dry-run`。它们只显式操作上述四个服务，绝不在 `/opt/palworld` 运行 Compose；完整步骤见 [`docs/operations/production-deployment.md`](../../docs/operations/production-deployment.md)。
