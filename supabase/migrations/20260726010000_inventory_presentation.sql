do $migration$
declare
  v_function constant regprocedure :=
    'public.list_available_pals_page_v2(text,text,text,public.pal_gender,text,public.pal_location_type,boolean,uuid,uuid,integer,integer)'::regprocedure;
  v_definition text;
  v_original text;
begin
  v_definition := pg_get_functiondef(v_function);
  v_original := v_definition;

  v_definition := replace(
    v_definition,
    '      pal.encyclopedia_no,' || chr(10),
    '      pal.encyclopedia_no,' || chr(10)
      || '      coalesce(pal.element_types, array[]::text[]) as element_types,'
      || chr(10)
  );
  v_definition := replace(
    v_definition,
    '    order by filtered.pal_id, filtered.pal_instance_uid' || chr(10),
    '    order by filtered.encyclopedia_no nulls last,' || chr(10)
      || '      filtered.pal_id,' || chr(10)
      || '      filtered.pal_instance_uid' || chr(10)
  );
  v_definition := replace(
    v_definition,
    '          ''encyclopedia_no'', page.encyclopedia_no,' || chr(10),
    '          ''encyclopedia_no'', page.encyclopedia_no,' || chr(10)
      || '          ''element_types'', page.element_types,' || chr(10)
  );
  v_definition := replace(
    v_definition,
    '        ) order by page.pal_id, page.pal_instance_uid' || chr(10),
    '        ) order by page.encyclopedia_no nulls last,' || chr(10)
      || '          page.pal_id,' || chr(10)
      || '          page.pal_instance_uid' || chr(10)
  );

  if v_definition = v_original
    or position(
      'coalesce(pal.element_types, array[]::text[]) as element_types'
      in v_definition
    ) = 0
    or position(
      'order by filtered.encyclopedia_no nulls last'
      in v_definition
    ) = 0
    or position(
      '''element_types'', page.element_types'
      in v_definition
    ) = 0
    or position(
      'order by page.encyclopedia_no nulls last'
      in v_definition
    ) = 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_PRESENTATION_PATCH_FAILED',
      detail = v_function::text;
  end if;

  execute v_definition;
end;
$migration$;

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
  'Returns stable inventory pages ordered by encyclopedia number with catalog elements.';
