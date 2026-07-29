# Steam 登录孤儿账号恢复

Steam OpenID 已验证、但 `profiles` 或 `steam_identities` 初始化失败的旧请求，可能在 Supabase Auth 中留下形如
`steam+<steamId>@auth.palbeacon.invalid` 的用户。新代码不会猜测或自动删除这些既有账号。

## 只读检测

在执行任何人工操作前，可在 Supabase SQL Editor 运行以下只读查询：

```sql
select
  users.id,
  users.email,
  profiles.id is not null as has_profile,
  identities.steam_id is not null as has_steam_identity,
  users.created_at
from auth.users as users
left join public.profiles as profiles
  on profiles.id = users.id
left join public.steam_identities as identities
  on identities.user_id = users.id
where users.email like 'steam+%@auth.palbeacon.invalid'
order by users.created_at desc;
```

只有同时满足以下条件的账号才符合本次已知孤儿特征：

```text
has_profile = false
has_steam_identity = false
```

## 人工恢复步骤

1. 先按受控发布流程应用 `20260729030000_grant_service_role_profiles_write.sql`，并确认数据库权限测试通过。
2. 在 Supabase Dashboard 的 Authentication → Users 中，逐个核对并人工删除确认无 profile、无 Steam identity 关联的孤儿测试用户。
3. 不删除已经有 profile 或 Steam identity 的账号；这些账号可在下一次 Steam 登录时复用。
4. 使用无痕窗口重新进行 Steam 登录。

不要直接批量删除 `auth.users`，不要自动清理已有用户，也不要仅凭内部邮箱格式判断账号可删除。
