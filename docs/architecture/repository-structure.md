# 仓库结构

```text
apps/web             Next.js App Router 前端与健康接口
apps/agent           Python 3.12 FastAPI 私有 Agent
packages/contracts   JSON Schema 与生成/验证流程
packages/pal-catalog 版本化显示元数据包边界
packages/ui          小型共享 UI 组件
supabase             本地配置、迁移、数据库测试与 Edge Function 边界
data                 仅存脱敏测试 fixture；运行快照被 Git 忽略
infra/agent          Agent Compose 模板
infra/vercel         Vercel 部署边界说明
docs                 架构、运维、ADR、正式规格和计划
scripts              仓库结构与秘密扫描检查
```

JavaScript 依赖由根 pnpm lockfile 固定。Python Agent 使用自己的 `pyproject.toml` 与 `uv.lock`，避免把运行时依赖混入前端。根脚本统一编排两套工具链。

业务 DTO 的源文件放在 `packages/contracts/schema`。生成的 TypeScript 文件放在该包 `src/generated`；Python 模型在 Phase 1 接入同源生成，本阶段的 Pydantic 示例通过共享 Schema fixture 验证字段与语义。
