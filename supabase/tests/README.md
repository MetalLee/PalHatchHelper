# 数据库测试

`000_setup.sql` 只安装本地 pgTAP 扩展；`schema.sql`、`rls.sql`、`rpc.sql` 分别验证结构约束、身份矩阵和原子操作。所有身份和数据均来自 `supabase/seed.sql` 的虚构 fixture。

```bash
supabase db reset
supabase test db
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' pnpm database:test:concurrency
```

测试通过 JWT claims 切换 `admin`、三名玩家、未绑定用户和 `service_role`。不得把测试 UUID、邮箱或本地密码当作生产身份或凭证。

最后一条命令使用两个独立连接验证 `FOR UPDATE SKIP LOCKED` 的真实并发领取行为，以及不同 fingerprint 竞争同一幂等键时的冲突行为；结束时回滚租约事务并清理临时任务。
