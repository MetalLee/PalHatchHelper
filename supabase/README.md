# Supabase 本地开发

此目录包含 Phase 1 的可重放迁移、确定性本地 Seed 和 pgTAP 权限/RPC 测试。它只面向 Supabase CLI 本地实例，不包含远程项目引用、Service Role Key 或生产数据。

从仓库根目录执行：

```bash
supabase start
supabase db reset
supabase db lint
supabase test db
```

详细身份矩阵、安全边界和类型生成见 `docs/operations/supabase-local-development.md`。
