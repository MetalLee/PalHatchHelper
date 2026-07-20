do $migration$
declare
  v_function regprocedure :=
    'public.list_available_pals_page(text,text,text,public.pal_gender,text,public.pal_location_type,boolean,uuid,uuid,text,text,integer)'::regprocedure;
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
      message = 'INVENTORY_CATALOG_JOIN_NOT_FOUND',
      detail = v_function::text;
  end if;

  execute v_updated_definition;
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
  'Returns a snapshot-bound, catalog-enriched inventory page; boss-prefixed inventory IDs resolve through their base catalog Pal ID and owner names use original game nicknames.';
