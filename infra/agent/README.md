# Agent Compose 骨架

本目录只描述未来 Agent 服务，不执行生产部署。Compose：

- 只把容器端口映射到宿主机 `127.0.0.1:18765`。
- 使用镜像内 UID/GID 10001 的非 root 用户。
- 不声明或连接 Palworld Docker 网络。
- 不挂载 `/opt/palworld`、真实存档或 Docker socket。
- 丢弃 capabilities、禁止提权、使用只读根文件系统并限制 CPU、内存和 PID。
- 只从环境变量获取密钥；示例文件全部为虚假值。

本地仅验证配置或构建：

```bash
docker compose --env-file infra/agent/.env.example -f infra/agent/docker-compose.yml config
docker build -f apps/agent/Dockerfile -t palhatch-agent:phase0 apps/agent
```

不要在 Phase 0 执行 `docker compose up`，也不要把本模板复制到 `/opt/services/palworld-manager`。
