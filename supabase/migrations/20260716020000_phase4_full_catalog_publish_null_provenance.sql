create or replace function private.validate_breeding_candidate_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_base_hash text;
  v_provenance jsonb;
begin
  if new.active_game_data_version_id is not distinct from old.active_game_data_version_id then
    return new;
  end if;
  -- A rollback selects a previously published, complete catalog version. It must
  -- not be interpreted as publishing a breeding-only candidate onto the current
  -- catalog base.
  if current_setting('app.game_data_rollback', true) = 'true' then
    return new;
  end if;
  select manifest->'breeding_source_provenance' into v_provenance
    from public.game_data_versions where id = new.active_game_data_version_id;
  -- Shared manifests serialize an absent optional value as JSON null. Only an
  -- object denotes a breeding-only candidate that must match the active base.
  if v_provenance is null or v_provenance = 'null'::jsonb then
    return new;
  end if;
  select content_hash into v_base_hash from public.game_data_versions
   where id = old.active_game_data_version_id;
  if v_base_hash is null
    or v_provenance->>'base_content_hash' <> v_base_hash
    or not private.breeding_base_catalog_matches(
      old.active_game_data_version_id,
      new.active_game_data_version_id
    )
  then
    raise exception using errcode = 'P0001', message = 'BREEDING_BASE_CATALOG_MISMATCH';
  end if;
  return new;
end;
$$;

comment on function private.validate_breeding_candidate_publish() is
  'Fail-closed breeding-only publish guard; an absent or JSON-null provenance marks a full catalog.';
