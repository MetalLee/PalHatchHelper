# Agent Compose 骨架

本目录只描述未来 Agent 服务，不执行生产部署。Compose：

- 只把容器端口映射到宿主机 `127.0.0.1:18765`。
- 使用镜像内 UID/GID 10001 的非 root 用户。
- 不声明或连接 Palworld Docker 网络。
- API service 不挂载存档；独立、无端口的 `save-worker` profile 只接受部署人员明确配置的 Compose 目录和存档目录只读 bind mount，且从不挂载 Docker socket。
- 丢弃 capabilities、禁止提权、使用只读根文件系统并限制 CPU、内存和 PID；Save Worker 的 Parser 临时输出另受 64 MB tmpfs 限制。
- 只从环境变量获取密钥；示例文件全部为虚假值。

本地仅验证配置或构建：

```bash
docker compose --env-file infra/agent/.env.example -f infra/agent/docker-compose.yml config
docker build -f apps/agent/Dockerfile -t palhatch-agent:phase3 apps/agent
```

同一镜像保留 `api`、`job-worker`、`save-worker` 三种命令。Compose 默认只启动 API；`docker compose --profile save-worker ...` 才会纳入独立 Save Worker，且缺少明确宿主机路径时 `create_host_path: false` 会拒绝创建或猜测目录。Phase 3 仍无真实配种 Handler，`job-worker` 默认拒绝领取。不要把本模板复制到 `/opt/services/palworld-manager`，也不要执行生产部署。
