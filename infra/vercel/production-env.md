# Vercel production 环境变量清单

在 Vercel Production 环境中只配置以下浏览器变量，值通过 Vercel 控制台或受控 CLI 输入，不写入 Git：

| 变量                            | 可见范围 | 用途                    |
| ------------------------------- | -------- | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | 浏览器   | Supabase HTTPS 项目地址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器   | 受 RLS 保护的 anon key  |
| `NEXT_PUBLIC_APP_URL`           | 浏览器   | 正式 HTTPS 自定义域名   |

`VERCEL_GIT_COMMIT_SHA` 由 Vercel 注入，应用只把它作为非秘密部署版本显示。任何 Service Role、AI Key、Agent Token、数据库密码或服务器凭证都不得带 `NEXT_PUBLIC_` 前缀，也不得加入 Vercel Web 项目。

生产发布前运行仓库 secret scan，并检查 Vercel 环境变量名称列表；检查时不打印变量值。
