do $migration$
declare
  v_function regprocedure :=
    'public.list_available_pals_page_v2(text,text,text,public.pal_gender,text,public.pal_location_type,boolean,uuid,uuid,integer,integer)'::regprocedure;
  v_definition text;
  v_updated_definition text;
begin
  v_definition := pg_get_functiondef(v_function);
  v_updated_definition := replace(
    v_definition,
    'and pal.pal_id = item.pal_id',
    $replacement$and pal.pal_id = case
       when left(item.pal_id, 5) = 'boss_' then substr(item.pal_id, 6)
       else item.pal_id
     end$replacement$
  );

  if v_updated_definition = v_definition then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_V2_CATALOG_JOIN_NOT_FOUND',
      detail = v_function::text;
  end if;

  execute v_updated_definition;
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
  'Returns random-access inventory pages and full-pool facets; boss-prefixed inventory IDs resolve through their base catalog Pal ID.';
