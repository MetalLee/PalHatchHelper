begin;
set local search_path = public, extensions;

select plan(10);

select ok(
  has_table_privilege('service_role', 'public.profiles', 'select'),
  'service role can read profiles'
);
select ok(
  has_table_privilege('service_role', 'public.profiles', 'insert'),
  'service role can insert profiles for Steam account initialization'
);
select ok(
  has_table_privilege('service_role', 'public.profiles', 'update'),
  'service role can upsert profiles for Steam account initialization'
);
select ok(
  not has_table_privilege('service_role', 'public.profiles', 'delete'),
  'service role is not granted profile deletion'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'insert'),
  'anonymous users cannot insert profiles'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'update'),
  'anonymous users cannot update profiles'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'insert'),
  'authenticated users cannot insert profiles directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'update'),
  'authenticated users cannot update profiles directly'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000099',
  'authenticated',
  'authenticated',
  'steam+76561198000000099@auth.palbeacon.invalid',
  extensions.crypt('palhatch-local-fixture', '$2a$06$abcdefghijklmnopqrstuu'),
  '2026-07-29T00:00:00Z',
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Steam Permission Fixture"}',
  '2026-07-29T00:00:00Z',
  '2026-07-29T00:00:00Z',
  '', '', '', ''
);

delete from public.profiles
where id = '00000000-0000-4000-8000-000000000099';

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select lives_ok(
  $$
    insert into public.profiles (id, display_name)
    values (
      '00000000-0000-4000-8000-000000000099',
      'Steam Permission Fixture'
    )
    on conflict (id) do update
      set display_name = excluded.display_name
  $$,
  'service role can execute the Steam profile upsert path'
);

reset role;
select is(
  (
    select role
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000099'
  ),
  'player'::public.profile_role,
  'Steam profile upsert keeps the default player role'
);

delete from auth.users
where id = '00000000-0000-4000-8000-000000000099';

select * from finish();
rollback;
