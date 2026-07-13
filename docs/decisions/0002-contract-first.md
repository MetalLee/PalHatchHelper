# ADR 0002：共享契约优先

- 状态：接受
- 日期：2026-07-13

## 背景

Next.js 与 Python Agent 交换状态、任务和算法结果。手工维护两套 DTO 容易在字段名、枚举和时间格式上漂移。

## 决策

JSON Schema/OpenAPI 是业务字段的规范源。TypeScript 类型由 Schema 生成；Pydantic 模型由同一 Schema 生成或在自动测试中逐字段验证。Phase 0 用 `system-status.schema.json` 展示生成与双端验证边界，Phase 1 固化生成流水线。

## 理由

共享契约提供机器可检查的必填字段、枚举和格式，能在 CI 中阻止漂移，并为数据库 RPC、Web 和 Agent 保留语言独立边界。

## 后果

契约变更先修改 Schema，再生成两端产物并运行兼容性测试。不得直接编辑生成文件或在两端新增同名手写 DTO。
