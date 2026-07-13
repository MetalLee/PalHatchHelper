# @palhatch/contracts

`schema/` 是跨语言契约的规范源。运行 `pnpm --filter @palhatch/contracts generate` 从健康与 readiness Schema 生成 TypeScript 类型，测试使用 Ajv 验证运行时数据。CI 在生成后检查 `src/generated` 的 Git 差异，禁止提交过期生成文件。

Python 在 Phase 0 用 `jsonschema` 验证 Pydantic `SystemStatus` 的序列化结果。Phase 1 将接入同一 Schema 到 Pydantic 的生成脚本，并让 CI 在生成后执行 `git diff --exit-code`，从而禁止手工维护不一致 DTO。
