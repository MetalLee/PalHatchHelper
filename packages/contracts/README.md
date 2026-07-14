# @palhatch/contracts

`schema/` 是跨语言业务契约的规范源。运行 `pnpm contracts:generate` 从 JSON Schema 同时生成 `src/generated` 的 TypeScript 类型和 Agent `generated/contracts.py` 的 Pydantic 模型。测试使用 Ajv 与 Pydantic 验证同一边界，CI 检查两端生成差异。

`game-catalog.schema.json` 同时定义 manifest、统一游戏版本和七类目录记录；`packages/pal-catalog` 与 Agent 只消费生成类型，不各自维护 DTO。

`src/database.types.ts` 来自本地数据库 catalog。标准 Supabase 环境可使用官方 CLI 生成；仓库的 `pnpm database:types` 提供强制回环地址的可复现生成器，拒绝远程数据库 URL。生成后必须执行 TypeScript typecheck 和 Git 差异检查。
