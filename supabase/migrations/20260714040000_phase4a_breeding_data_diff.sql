-- Phase 4A only adds a read-only diff over already validated immutable versions.
-- Staging/finalize and publish/rollback remain separate explicit operations.

create function public.get_breeding_data_diff(
  p_from_version_id uuid,
  p_to_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_from_hash text;
  v_to_hash text;
  v_added jsonb;
  v_removed jsonb;
  v_changed jsonb;
  v_unchanged integer;
begin
  if not (public.is_admin() or private.is_service_role()) then
    raise exception using errcode = 'P0001', message = 'ADMIN_REQUIRED';
  end if;
  if p_from_version_id is null or p_to_version_id is null then
    raise exception using errcode = 'P0001', message = 'INVALID_GAME_DATA_VERSION';
  end if;

  select version.content_hash into v_from_hash
    from public.game_data_versions as version
   where version.id = p_from_version_id
     and version.status in ('validated', 'published');
  select version.content_hash into v_to_hash
    from public.game_data_versions as version
   where version.id = p_to_version_id
     and version.status in ('validated', 'published');
  if v_from_hash is null or v_to_hash is null then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_NOT_VALIDATED';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'parent_a_pal_id', current.parent_a_pal_id,
        'parent_b_pal_id', current.parent_b_pal_id,
        'child_pal_id', current.child_pal_id,
        'recipe_type', current.recipe_type,
        'metadata', current.metadata
      ) order by current.parent_a_pal_id, current.parent_b_pal_id, current.recipe_type
    ),
    '[]'::jsonb
  ) into v_added
  from public.catalog_breeding_recipes as current
  where current.version_id = p_to_version_id
    and not exists (
      select 1 from public.catalog_breeding_recipes as previous
       where previous.version_id = p_from_version_id
         and previous.parent_a_pal_id = current.parent_a_pal_id
         and previous.parent_b_pal_id = current.parent_b_pal_id
         and previous.recipe_type = current.recipe_type
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'parent_a_pal_id', previous.parent_a_pal_id,
        'parent_b_pal_id', previous.parent_b_pal_id,
        'child_pal_id', previous.child_pal_id,
        'recipe_type', previous.recipe_type,
        'metadata', previous.metadata
      ) order by previous.parent_a_pal_id, previous.parent_b_pal_id, previous.recipe_type
    ),
    '[]'::jsonb
  ) into v_removed
  from public.catalog_breeding_recipes as previous
  where previous.version_id = p_from_version_id
    and not exists (
      select 1 from public.catalog_breeding_recipes as current
       where current.version_id = p_to_version_id
         and current.parent_a_pal_id = previous.parent_a_pal_id
         and current.parent_b_pal_id = previous.parent_b_pal_id
         and current.recipe_type = previous.recipe_type
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'parent_a_pal_id', previous.parent_a_pal_id,
        'parent_b_pal_id', previous.parent_b_pal_id,
        'recipe_type', previous.recipe_type,
        'before_child_pal_id', previous.child_pal_id,
        'after_child_pal_id', current.child_pal_id,
        'metadata_changed', previous.metadata is distinct from current.metadata
      ) order by previous.parent_a_pal_id, previous.parent_b_pal_id, previous.recipe_type
    ) filter (
      where previous.child_pal_id is distinct from current.child_pal_id
         or previous.metadata is distinct from current.metadata
    ),
    '[]'::jsonb
  ), count(*) filter (
    where previous.child_pal_id = current.child_pal_id
      and previous.metadata = current.metadata
  )::integer
  into v_changed, v_unchanged
  from public.catalog_breeding_recipes as previous
  join public.catalog_breeding_recipes as current
    on current.version_id = p_to_version_id
   and current.parent_a_pal_id = previous.parent_a_pal_id
   and current.parent_b_pal_id = previous.parent_b_pal_id
   and current.recipe_type = previous.recipe_type
  where previous.version_id = p_from_version_id;

  return jsonb_build_object(
    'schema_version', '1.0.0',
    'from_content_hash', v_from_hash,
    'to_content_hash', v_to_hash,
    'added', v_added,
    'removed', v_removed,
    'changed', v_changed,
    'counts', jsonb_build_object(
      'added', jsonb_array_length(v_added),
      'removed', jsonb_array_length(v_removed),
      'changed', jsonb_array_length(v_changed),
      'unchanged', v_unchanged
    )
  );
end;
$$;

revoke all on function public.get_breeding_data_diff(uuid, uuid) from public, anon;
grant execute on function public.get_breeding_data_diff(uuid, uuid)
  to authenticated, service_role;

comment on function public.get_breeding_data_diff(uuid, uuid) is
  'Admin-only deterministic recipe diff. It never imports, publishes, or changes an active pointer.';
