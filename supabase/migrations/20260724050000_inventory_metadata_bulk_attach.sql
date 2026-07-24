create or replace function private.attach_pal_snapshot_source_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_ownership_scope text;
begin
  v_ownership_scope := case
    when new.owner_player_id is not null then 'player'
    when new.owner_player_id is null
      and new.guild_id is not null
      and new.location_type = 'base'
      then 'guild'
    else 'unresolved'
  end;
  new.raw_metadata := coalesce(new.raw_metadata, '{}'::jsonb)
    || jsonb_build_object('ownership_scope', v_ownership_scope);
  if v_ownership_scope = 'guild' then
    new.raw_metadata := new.raw_metadata || jsonb_build_object(
      'resolution_status', 'resolved',
      'shared_eligible', true,
      'warning_codes',
        coalesce(new.raw_metadata -> 'warning_codes', '[]'::jsonb)
          - 'OWNER_UNRESOLVED'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.attach_pal_snapshot_source_metadata()
  from public, anon, authenticated, service_role;

do $migration$
declare
  v_function regprocedure :=
    'private.publish_inventory_snapshot(uuid,jsonb)'::regprocedure;
  v_definition text;
  v_original text;
begin
  v_definition := pg_get_functiondef(v_function);
  v_original := v_definition;

  v_definition := replace(
    v_definition,
    '      location_name,' || chr(10)
      || '      raw_metadata',
    '      location_name,' || chr(10)
      || '      is_boss,' || chr(10)
      || '      location_id,' || chr(10)
      || '      location_slot_index,' || chr(10)
      || '      location_access_scope,' || chr(10)
      || '      raw_metadata'
  );

  v_definition := replace(
    v_definition,
    '      v_record ->> ''location_name'',' || chr(10)
      || '      jsonb_build_object(',
    '      v_record ->> ''location_name'',' || chr(10)
      || '      case' || chr(10)
      || '        when jsonb_typeof(v_record -> ''is_boss'') = ''boolean''' || chr(10)
      || '          then (v_record ->> ''is_boss'')::boolean' || chr(10)
      || '        else null' || chr(10)
      || '      end,' || chr(10)
      || '      case' || chr(10)
      || '        when jsonb_typeof(v_record -> ''location_id'') = ''string''' || chr(10)
      || '          then nullif(v_record ->> ''location_id'', '''')' || chr(10)
      || '        else null' || chr(10)
      || '      end,' || chr(10)
      || '      case' || chr(10)
      || '        when jsonb_typeof(v_record -> ''location_slot_index'') = ''number''' || chr(10)
      || '          then (v_record ->> ''location_slot_index'')::integer' || chr(10)
      || '        else null' || chr(10)
      || '      end,' || chr(10)
      || '      case' || chr(10)
      || '        when v_record ->> ''location_access_scope''' || chr(10)
      || '          in (''player'', ''guild'', ''unresolved'')' || chr(10)
      || '          then v_record ->> ''location_access_scope''' || chr(10)
      || '        else ''unresolved''' || chr(10)
      || '      end,' || chr(10)
      || '      jsonb_build_object('
  );

  v_definition := replace(
    v_definition,
    '        ''warning_codes'', coalesce(v_record -> ''warning_codes'', ''[]''::jsonb)'
      || chr(10)
      || '      )' || chr(10)
      || '    );',
    '        ''warning_codes'', coalesce(v_record -> ''warning_codes'', ''[]''::jsonb)'
      || chr(10)
      || '      )' || chr(10)
      || '      || case' || chr(10)
      || '        when jsonb_typeof(v_record -> ''metadata'') = ''object''' || chr(10)
      || '          and nullif(' || chr(10)
      || '            v_record #>> ''{metadata,source_internal_name}'',' || chr(10)
      || '            ''''' || chr(10)
      || '          ) is not null' || chr(10)
      || '        then jsonb_build_object(' || chr(10)
      || '          ''source_internal_name'',' || chr(10)
      || '            left(' || chr(10)
      || '              v_record #>> ''{metadata,source_internal_name}'',' || chr(10)
      || '              120' || chr(10)
      || '            ),' || chr(10)
      || '          ''source_passive_skill_internal_names'', case' || chr(10)
      || '            when jsonb_typeof(' || chr(10)
      || '              v_record' || chr(10)
      || '                #> ''{metadata,source_passive_skill_internal_names}''' || chr(10)
      || '            ) = ''array''' || chr(10)
      || '              then coalesce((' || chr(10)
      || '                select jsonb_agg(' || chr(10)
      || '                  left(source_name.value, 120)' || chr(10)
      || '                  order by source_name.ordinality' || chr(10)
      || '                )' || chr(10)
      || '                from jsonb_array_elements_text(' || chr(10)
      || '                  v_record' || chr(10)
      || '                    #> ''{metadata,source_passive_skill_internal_names}''' || chr(10)
      || '                ) with ordinality as source_name(value, ordinality)' || chr(10)
      || '                where source_name.ordinality <= 64' || chr(10)
      || '              ), ''[]''::jsonb)' || chr(10)
      || '            else ''[]''::jsonb' || chr(10)
      || '          end' || chr(10)
      || '        )' || chr(10)
      || '        else ''{}''::jsonb' || chr(10)
      || '      end' || chr(10)
      || '    );'
  );

  if v_definition = v_original
    or position('      is_boss,' in v_definition) = 0
    or position('      location_slot_index,' in v_definition) = 0
    or position('source_passive_skill_internal_names' in v_definition) = 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_BULK_METADATA_PATCH_FAILED',
      detail = v_function::text;
  end if;

  execute v_definition;
end;
$migration$;

create or replace function public.publish_inventory_snapshot(
  p_world_id uuid,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  return private.publish_inventory_snapshot(p_world_id, p_snapshot);
end;
$$;

revoke all on function public.publish_inventory_snapshot(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_inventory_snapshot(uuid, jsonb)
  to service_role;

comment on function public.publish_inventory_snapshot(uuid, jsonb) is
  'Publishes one canonical snapshot without transaction-wide metadata GUCs; precise location and audited source fields are inserted directly in the immutable row.';
