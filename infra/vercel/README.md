# Vercel 生产配置边界

`apps/web` 是未来 Vercel Root Directory。构建命令为 `pnpm --filter @palhatch/web build`，Install Command 为 `pnpm install --frozen-lockfile`。

生产项目的 Root Directory 固定为 `apps/web`，配置由 [`apps/web/vercel.json`](../../apps/web/vercel.json) 提供。Build Command 使用 `pnpm build`，Install Command 使用 `pnpm install --frozen-lockfile`，Node.js 使用仓库声明的 22 或更高版本。

允许暴露给浏览器的生产变量只有：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

Web Server Route 另需服务端 `SUPABASE_SERVICE_ROLE_KEY`，并支持可选的 `STEAM_WEB_API_KEY`、
`ENABLE_PASSWORD_LOGIN=true`、`SYNC_MAX_PAYLOAD_BYTES=5242880` 和
`SYNC_PAIRING_CODE_TTL_SECONDS=600`。禁止创建 `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`、
`NEXT_PUBLIC_STEAM_WEB_API_KEY`、`NEXT_PUBLIC_OPENAI_API_KEY`、`NEXT_PUBLIC_AGENT_TOKEN` 或任何其他
公开秘密。Agent 的 Service Role 和 AI 凭证仍只存在于权限为 `0600` 的服务器 `.env.production`。

服务端由 Vercel 自动提供 `VERCEL_GIT_COMMIT_SHA`，健康路由 `/api/health` 将其作为部署版本显示。用户数据路由通过动态渲染、`noStore()`、`Cache-Control: private, no-store` 和 `Vary: Cookie` 禁止跨用户缓存。

## 自定义域名

在 Vercel 项目 Settings → Domains 中把 `www.palbeacon.app` 设为 Primary Domain，并把 `palbeacon.app` 配置为永久跳转到 `www.palbeacon.app`。按 Vercel 给出的 DNS 记录配置并等待证书生效。部署前确认 `NEXT_PUBLIC_APP_URL=https://www.palbeacon.app`；部署后以 `vercel inspect <domain> --json` 和浏览器健康检查确认域名已经指向本次 production deployment。不得在仓库写入域名验证 Token。

Steam OpenID 回调固定为 `<NEXT_PUBLIC_APP_URL>/api/auth/steam/callback`。检查登录、绑定和 Sync API 响应
均为 `private, no-store`，并检查构建产物与日志不含 Service Role、Steam Key、magic-link token hash 或设备 token。
Supabase Auth 必须启用邮箱注册，并把 `<NEXT_PUBLIC_APP_URL>/api/auth/confirm` 纳入允许的邮箱确认跳转；
关闭邮箱注册时必须同时把 `ENABLE_PASSWORD_LOGIN` 改为 `false`，避免展示不可完成的注册流程。
