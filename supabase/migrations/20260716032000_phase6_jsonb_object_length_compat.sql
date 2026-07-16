create function public.jsonb_object_length(p_value jsonb)
returns integer
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select count(*)::integer from jsonb_object_keys(p_value);
$$;

revoke all on function public.jsonb_object_length(jsonb)
  from public, anon, authenticated, service_role;

comment on function public.jsonb_object_length(jsonb) is
  'Private migration compatibility helper for the Phase 6 exact four-profile gate.';
