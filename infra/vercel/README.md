# Vercel 部署边界

`apps/web` 是未来 Vercel Root Directory。构建命令为 `pnpm --filter @palhatch/web build`，Install Command 为 `pnpm install --frozen-lockfile`。

Phase 0 不创建或修改 Vercel 项目。未来预览/生产变量通过 Vercel Secret 管理配置；浏览器只允许接收 `NEXT_PUBLIC_SUPABASE_URL` 与 anon key，Service Role 和 AI Key 禁止进入 Web 构建环境。
