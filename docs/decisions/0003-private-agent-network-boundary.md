# ADR 0003：私有 Agent 网络与 Phase 0 数据边界

- 状态：接受
- 日期：2026-07-13

## 背景

游戏服务器已运行 Palworld 和 mihomo，公网资源有限。任务控制面位于 Supabase，Agent 无需接受互联网入站任务。

## 决策

Agent 后续主动轮询 Supabase，只提供绑定 `127.0.0.1:18765` 的本地健康/readiness 接口，不提供公网任务 API、不加入现有 Palworld Docker 网络、不设置全局代理。Phase 0 不接入真实 Supabase，不读取或挂载真实存档，也不部署到 `/opt/services/palworld-manager`。

## 理由

主动出站减少公网攻击面和服务器网络变更。推迟真实连接能先验证 RLS、RPC、快照只读协议与 Parser 隔离，避免骨架阶段误触生产数据。

## 后果

运维通过 SSH 或本机检查健康接口。未来任务都经 Supabase 原子 RPC 领取；需要新公网端口或真实数据访问的变更必须单独评审。
