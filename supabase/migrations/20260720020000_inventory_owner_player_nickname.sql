do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_updated_definition text;
begin
  foreach v_function in array array[
    'public.list_available_pals(text)'::regprocedure,
    'public.list_available_pals_page(text,text,text,public.pal_gender,text,public.pal_location_type,boolean,uuid,uuid,text,text,integer)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_function);
    v_updated_definition := replace(
      v_definition,
      'coalesce(owner_profile.display_name, owner.nickname) as owner_display_name',
      'owner.nickname as owner_display_name'
    );

    if v_updated_definition = v_definition then
      raise exception using
        errcode = 'P0001',
        message = 'INVENTORY_OWNER_PROJECTION_NOT_FOUND',
        detail = v_function::text;
    end if;

    execute v_updated_definition;
  end loop;
end;
$migration$;

comment on function public.list_available_pals(text) is
  'Returns the authorized latest inventory projection; owner_display_name is always the original game player nickname.';

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
  'Returns a snapshot-bound, catalog-enriched inventory page; owner_display_name is always the original game player nickname.';
