do $migration$
declare
  v_source_function constant regprocedure :=
    'public.list_available_pals_page_v2(text,text,text,public.pal_gender,text,public.pal_location_type,boolean,uuid,uuid,integer,integer)'::regprocedure;
  v_definition text := pg_get_functiondef(v_source_function);
  v_original text := v_definition;
begin
  v_definition := replace(
    v_definition,
    'FUNCTION public.list_available_pals_page_v2(',
    'FUNCTION public.list_available_pals_page_v3('
  );
  v_definition := replace(
    v_definition,
    'p_passive_skill_id text DEFAULT NULL::text',
    'p_passive_skill_ids text[] DEFAULT ''{}''::text[]'
  );
  v_definition := replace(
    v_definition,
    '  v_passive_skill_id text := nullif(btrim(p_passive_skill_id), '''');',
    $replacement$  v_passive_skill_ids text[] := coalesce(
    (
      select array_agg(
        distinct btrim(passive_id.value)
        order by btrim(passive_id.value)
      )
      from unnest(coalesce(p_passive_skill_ids, array[]::text[]))
        as passive_id(value)
    ),
    array[]::text[]
  );$replacement$
  );
  v_definition := replace(
    v_definition,
    $find$    or (p_passive_skill_id is not null and (
      v_passive_skill_id is null or char_length(v_passive_skill_id) > 120
    ))$find$,
    $replacement$    or cardinality(v_passive_skill_ids) > 4
    or exists (
      select 1
      from unnest(v_passive_skill_ids) as passive_id(value)
      where passive_id.value is null
        or passive_id.value = ''
        or char_length(passive_id.value) > 120
    )$replacement$
  );
  v_definition := replace(
    v_definition,
    $find$      and (
        v_passive_skill_id is null
        or v_passive_skill_id = any(candidate.passive_skill_ids)
      )$find$,
    $replacement$      and (
        cardinality(v_passive_skill_ids) = 0
        or v_passive_skill_ids <@ candidate.passive_skill_ids
      )$replacement$
  );
  v_definition := replace(
    v_definition,
    $find$    select distinct
      passive_id.value,
      coalesce(localization.text, '被动名称暂不可用') as label
    from candidates as candidate$find$,
    $replacement$    select distinct
      passive_id.value,
      coalesce(localization.text, '被动名称暂不可用') as label,
      passive.rank,
      passive.is_negative
    from candidates as candidate$replacement$
  );
  v_definition := replace(
    v_definition,
    $find$      'passives', coalesce((
        select jsonb_agg(
          jsonb_build_object('value', option.value, 'label', option.label)
          order by option.label, option.value
        )
        from passive_options as option
      ), '[]'::jsonb),$find$,
    $replacement$      'passives', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'value', option.value,
            'label', option.label,
            'rank', option.rank,
            'is_negative', option.is_negative
          )
          order by option.label, option.value
        )
        from passive_options as option
      ), '[]'::jsonb),$replacement$
  );

  if v_definition = v_original
    or position('FUNCTION public.list_available_pals_page_v3(' in v_definition) = 0
    or position('p_passive_skill_ids text[]' in v_definition) = 0
    or position('v_passive_skill_ids <@ candidate.passive_skill_ids' in v_definition) = 0
    or position('''rank'', option.rank' in v_definition) = 0
    or position('''is_negative'', option.is_negative' in v_definition) = 0
    or position('v_passive_skill_id text :=' in v_definition) > 0
    or position('v_passive_skill_id = any' in v_definition) > 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'INVENTORY_PASSIVE_MULTISELECT_PATCH_FAILED',
      detail = v_source_function::text;
  end if;

  execute v_definition;
end;
$migration$;

revoke all on function public.list_available_pals_page_v3(
  text,
  text,
  text,
  public.pal_gender,
  text[],
  public.pal_location_type,
  boolean,
  uuid,
  uuid,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.list_available_pals_page_v3(
  text,
  text,
  text,
  public.pal_gender,
  text[],
  public.pal_location_type,
  boolean,
  uuid,
  uuid,
  integer,
  integer
) to authenticated;

comment on function public.list_available_pals_page_v3(
  text,
  text,
  text,
  public.pal_gender,
  text[],
  public.pal_location_type,
  boolean,
  uuid,
  uuid,
  integer,
  integer
) is
  'Returns stable inventory pages with rank-aware passive facets and an AND filter for at most four passive skills; V2 remains available for rollback compatibility.';
