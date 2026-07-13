# ADR 0001：pnpm workspace 与 uv 单仓工具链

- 状态：接受
- 日期：2026-07-13

## 背景

仓库同时包含 Next.js、多个 TypeScript 共享包和 Python Agent，需要可重复安装、清晰依赖边界与统一验证。

## 决策

Node.js 22 项目使用 pnpm workspace 和单一 `pnpm-lock.yaml`。Python 3.12 Agent 使用 uv、独立 `pyproject.toml` 和 `uv.lock`。根 `pnpm check` 编排两套工具链，CI 仍拆分 Web 与 Agent job 以便定位失败和缓存依赖。

## 理由

pnpm 的 workspace 协议能明确内部包关系并节省安装空间；严格 lockfile 适合 CI。uv 能快速、可复现地解析 Python 应用与开发依赖，不需要把 Python 包伪装成 Node workspace。

## 后果

开发者需要 Node/pnpm 和 Python/uv。两份 lockfile 都必须提交；依赖更新应在对应生态内完成并运行全量检查。
