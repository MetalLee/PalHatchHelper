do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_original text;
  v_internal_id_query constant text :=
    '        or lower(candidate.pal_id) like ''%'' || v_query || ''%''' || chr(10);
begin
  foreach v_function in array array[
    'public.list_available_pals_page(text,text,text,public.pal_gender,text,public.pal_location_type,boolean,uuid,uuid,text,text,integer)'::regprocedure,
    'public.list_available_pals_page_v2(text,text,text,public.pal_gender,text,public.pal_location_type,boolean,uuid,uuid,integer,integer)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_function);
    v_original := v_definition;
    v_definition := replace(v_definition, v_internal_id_query, '');
    v_definition := replace(
      v_definition,
      'coalesce(pal_localization.text, item.pal_id) as pal_display_name',
      'coalesce(pal_localization.text, ''名称暂不可用'') as pal_display_name'
    );
    v_definition := replace(
      v_definition,
      'coalesce(passive_localization.text, passive_id.value)',
      'coalesce(passive_localization.text, ''被动名称暂不可用'')'
    );
    v_definition := replace(
      v_definition,
      'coalesce(localization.text, passive_id.value) as label',
      'coalesce(localization.text, ''被动名称暂不可用'') as label'
    );

    if v_definition = v_original
      or position('lower(candidate.pal_id) like' in v_definition) > 0
      or position('coalesce(pal_localization.text, item.pal_id)' in v_definition) > 0
      or position('coalesce(passive_localization.text, passive_id.value)' in v_definition) > 0
      or position('coalesce(localization.text, passive_id.value)' in v_definition) > 0
    then
      raise exception using
        errcode = 'P0001',
        message = 'PLAYER_INVENTORY_INTERNAL_ID_SEARCH_PATCH_FAILED',
        detail = v_function::text;
    end if;

    execute v_definition;
  end loop;
end;
$migration$;

comment on function public.list_available_pals_page(
  text,
  text,
  text,
  public.pal_gender,
  text,
  public.pal_location_type,
  boolean,
  uuid,
  uuid,
  text,
  text,
  integer
) is
  'Returns a browser-safe inventory page; player search accepts localized names and encyclopedia numbers, and missing localization never falls back to internal IDs.';

comment on function public.list_available_pals_page_v2(
  text,
  text,
  text,
  public.pal_gender,
  text,
  public.pal_location_type,
  boolean,
  uuid,
  uuid,
  integer,
  integer
) is
  'Returns stable random-access inventory pages; player search accepts localized names and encyclopedia numbers, and missing localization never falls back to internal IDs.';
