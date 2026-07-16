# Vercel 生产配置边界

`apps/web` 是未来 Vercel Root Directory。构建命令为 `pnpm --filter @palhatch/web build`，Install Command 为 `pnpm install --frozen-lockfile`。

生产项目的 Root Directory 固定为 `apps/web`，配置由 [`apps/web/vercel.json`](../../apps/web/vercel.json) 提供。Build Command 使用 `pnpm build`，Install Command 使用 `pnpm install --frozen-lockfile`，Node.js 固定为仓库声明的 22.x。

允许暴露给浏览器的生产变量只有：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

禁止创建 `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_OPENAI_API_KEY`、`NEXT_PUBLIC_AGENT_TOKEN` 或任何其他公开秘密。Agent 的 Service Role 和 AI 凭证只存在于权限为 `0600` 的服务器 `.env.production`。

服务端由 Vercel 自动提供 `VERCEL_GIT_COMMIT_SHA`，健康路由 `/api/health` 将其作为部署版本显示。用户数据路由通过动态渲染、`noStore()`、`Cache-Control: private, no-store` 和 `Vary: Cookie` 禁止跨用户缓存。

## 自定义域名

在 Vercel 项目 Settings → Domains 中添加正式域名，按 Vercel 给出的 DNS 记录配置并等待证书生效。部署前确认 `NEXT_PUBLIC_APP_URL` 与正式 HTTPS 域名完全一致；部署后以 `vercel inspect <domain> --json` 和浏览器健康检查确认域名已经指向本次 production deployment。不得在仓库写入域名验证 Token。
