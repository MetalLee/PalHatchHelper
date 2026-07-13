# Supabase 本地开发

## 安全前提

只运行仓库 `supabase/config.toml` 定义的本地实例。不要执行 `supabase link`、`supabase db push` 或带 project ID 的命令，不要读取生产 URL、anon key 或 Service Role Key。本阶段没有执行生产迁移。

需要 Docker Engine、Supabase CLI、Node.js 22 和 pnpm 9。确认工具：

```bash
docker --version
supabase --version
node --version
pnpm --version
```

若 Docker 或 CLI 缺失，按各自官方文档安装到开发机；不要使用 sudo 自动安装，也不要把临时凭证写入仓库。

## 启动、重建和停止

从仓库根目录运行：

```bash
supabase start
supabase db reset
supabase status
```

`db reset` 删除本地开发数据库，按时间戳重放全部迁移，再执行 `supabase/seed.sql`。Seed 只包含 `.invalid` 邮箱、固定虚构 UUID/游戏 UID 和少量测试数据，不可复制到生产。

停止本项目本地服务：

```bash
supabase stop
```

这些命令不得用于 `/opt/palworld`，也不会启动 Agent Worker、解析器或配种算法。

## 数据库测试和 lint

```bash
supabase db reset
supabase db lint
supabase test db
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' pnpm database:test:concurrency
```

测试文件按名称执行：`000_setup.sql` 安装本地 pgTAP，随后验证 schema、RLS 和 RPC。身份矩阵包括 admin、player_a、同公会 player_b、其他公会 player_c、unbound_user 和 service_role。每个用例在事务中执行并 rollback。

并发检查使用两个独立本地数据库连接：一组在 Worker A 持有未提交租约时让 Worker B 同时领取，断言两者不会获得同一任务；另一组让两个不同请求竞争同一幂等键，断言 fingerprint 冲突不会被复用。测试清理临时任务并回滚租约事务，不改变 Seed。

## 共享契约生成

JSON Schema 到 TypeScript/Pydantic：

```bash
pnpm contracts:generate
git diff --exit-code -- packages/contracts/src/generated apps/agent/src/pal_hatch_helper/generated
```

数据库类型的标准 Supabase CLI 命令是：

```bash
supabase gen types typescript --local --schema public > packages/contracts/src/database.types.ts
pnpm exec prettier --write packages/contracts/src/database.types.ts
```

仓库还提供 catalog 生成器，便于明确指定本地实例并强制拒绝非回环主机：

```bash
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' pnpm database:types
```

生成后必须执行：

```bash
pnpm typecheck
pnpm test
git diff --check
```

不得把包含密码的 DATABASE_URL 写入文件、日志或 Git。上例只使用 Supabase CLI 的本地默认开发实例。

## Service Role 边界

本地 CLI 会显示本地测试 key，只能用于本机测试。Service Role：

- 永不进入浏览器、Next.js public 环境变量或提交文件；
- 只供未来私有 Agent 通过 HTTPS 主动访问 Supabase；
- 领取/心跳/完成/失败/回收必须调用专用 RPC；
- RPC 同时验证 JWT `role=service_role`，authenticated 没有 execute 权限。

Phase 1 不实现或运行真实 Agent Worker。

## 常见问题

- `supabase` 或 `docker: command not found`：对应验证未执行，不能标记通过；安装后重跑 start/reset/test。
- 54320–54323 端口冲突：先 `supabase stop` 并检查本机开发进程；不要修改为公网监听。
- 生成结果有 diff：确认已 reset 到最新迁移，重新生成两类契约并审查数据库变化。
- RLS 测试失败：不要临时给 authenticated 扩大表权限；检查 grant、policy、JWT claims 和 RPC 所有权验证。
