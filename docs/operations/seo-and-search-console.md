# PalBeacon SEO 与搜索引擎运维

## 正式域名

1. 在 Vercel 将 `www.palbeacon.app` 设置为 Primary Domain。
2. 将 apex 域名配置为永久跳转：`palbeacon.app → www.palbeacon.app`。
3. 不在 Next.js middleware 中实现 Host 跳转，以免影响 localhost、Vercel Preview、Steam OpenID 与 Supabase Auth 回调。

## Google Search Console

1. 添加网域资源 `palbeacon.app`。
2. 按 Google 提供的值，在 DNSPod 添加 TXT 验证记录。
3. 将验证值保存为 Vercel 服务端环境变量 `GOOGLE_SITE_VERIFICATION`；不要添加 `NEXT_PUBLIC_` 前缀，也不要把真实 token 提交到仓库。
4. 部署后提交 `https://www.palbeacon.app/sitemap.xml`。
5. 分别检查并请求编入索引：
   - `https://www.palbeacon.app/zh`
   - `https://www.palbeacon.app/en`
6. 直接检查以下公开资源：
   - `https://www.palbeacon.app/robots.txt`
   - `https://www.palbeacon.app/sitemap.xml`
7. 在网址检查中确认网页允许抓取、用户声明 canonical、Google 选择的 canonical、hreflang、最近抓取时间和移动端渲染结果。

部署成功不等于搜索引擎会立即收录。抓取、canonical 选择和最终收录时间由搜索引擎决定。

## Bing Webmaster Tools

可以从 Google Search Console 导入站点，也可以单独验证并提交同一个 sitemap。单独验证时，将 Bing 提供的值保存为服务端环境变量 `BING_SITE_VERIFICATION`，不要提交真实 token。
