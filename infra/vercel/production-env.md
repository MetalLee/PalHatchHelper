# Vercel production 环境变量清单

在 Vercel Production 环境中配置以下变量，值通过 Vercel 控制台或受控 CLI 输入，不写入 Git：

| 变量                            | 可见范围 | 用途                    |
| ------------------------------- | -------- | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | 浏览器   | Supabase HTTPS 项目地址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器   | 受 RLS 保护的 anon key  |
| `NEXT_PUBLIC_APP_URL`           | 浏览器   | 正式 HTTPS 自定义域名   |
| `SUPABASE_SERVICE_ROLE_KEY`     | 仅服务端 | Steam 账户与 Sync RPC   |
| `STEAM_WEB_API_KEY`             | 仅服务端 | 可选 Steam 展示资料     |
| `ENABLE_PASSWORD_LOGIN`         | 仅服务端 | 正式环境固定为 `false`  |
| `SYNC_MAX_PAYLOAD_BYTES`        | 仅服务端 | 上传上限，默认 5242880  |
| `SYNC_PAIRING_CODE_TTL_SECONDS` | 仅服务端 | 配对码 TTL，默认 600    |

`NEXT_PUBLIC_APP_URL` 是 Steam realm/return_to 和 Sync API base URL 的唯一来源，不配置重复的
`PALBEACON_PUBLIC_URL`。`STEAM_WEB_API_KEY` 缺失或接口暂时失败时仍允许登录，只使用安全显示名兜底。

`VERCEL_GIT_COMMIT_SHA` 由 Vercel 注入，应用只把它作为非秘密部署版本显示。任何 Service Role、Steam
API Key、AI Key、Agent Token、数据库密码或服务器凭证都不得带 `NEXT_PUBLIC_` 前缀。Service Role 只由
Server Route 使用，不得进入浏览器 bundle、响应、URL 或日志。

生产发布前运行仓库 secret scan，并检查 Vercel 环境变量名称列表；检查时不打印变量值。
