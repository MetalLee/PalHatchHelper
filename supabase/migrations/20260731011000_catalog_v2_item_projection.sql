alter table public.catalog_passive_skills
  add column description_template_key text,
  add column effects jsonb not null default '[]'::jsonb,
  add constraint catalog_passive_effects_check check (jsonb_typeof(effects) = 'array');

create table public.catalog_items (
  version_id uuid not null references public.game_data_versions(id) on delete restrict,
  item_id text not null,
  name_key text not null,
  description_key text,
  type_a text not null,
  type_b text not null,
  max_stack_count integer not null,
  enable_handcraft boolean not null,
  is_legal boolean not null,
  restore_health integer not null,
  restore_sanity integer not null,
  restore_satiety integer not null,
  corruption_factor numeric not null,
  legacy_item_ids text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  primary key (version_id, item_id),
  constraint catalog_items_id_check check (item_id ~ '^[a-z0-9][a-z0-9._-]*$'),
  constraint catalog_items_stack_check check (max_stack_count > 0),
  constraint catalog_items_corruption_check check (corruption_factor >= 0),
  constraint catalog_items_legacy_ids_check check (array_position(legacy_item_ids, null) is null),
  constraint catalog_items_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index catalog_items_type_idx on public.catalog_items(version_id, type_a, type_b, item_id);

create table public.catalog_item_recipes (
  version_id uuid not null,
  recipe_id text not null,
  product_item_id text not null,
  product_count integer not null,
  craft_kind text not null,
  work_amount numeric not null,
  workable_attribute integer not null,
  energy_type text,
  energy_amount integer not null,
  unlock_item_id text,
  deny_recipe_chain text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  primary key (version_id, recipe_id),
  constraint catalog_item_recipes_product_fkey
    foreign key (version_id, product_item_id)
    references public.catalog_items(version_id, item_id) on delete restrict,
  constraint catalog_item_recipes_unlock_fkey
    foreign key (version_id, unlock_item_id)
    references public.catalog_items(version_id, item_id) on delete restrict,
  constraint catalog_item_recipes_id_check check (recipe_id ~ '^[a-z0-9][a-z0-9._-]*$'),
  constraint catalog_item_recipes_product_count_check check (product_count > 0),
  constraint catalog_item_recipes_kind_check check (craft_kind in ('handcraft', 'cooking', 'other')),
  constraint catalog_item_recipes_work_check check (work_amount >= 0 and workable_attribute >= 0),
  constraint catalog_item_recipes_energy_check check (energy_amount >= 0),
  constraint catalog_item_recipes_deny_check check (array_position(deny_recipe_chain, null) is null),
  constraint catalog_item_recipes_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index catalog_item_recipes_product_idx
  on public.catalog_item_recipes(version_id, product_item_id, recipe_id);

create table public.catalog_item_recipe_ingredients (
  version_id uuid not null,
  recipe_id text not null,
  slot integer not null,
  item_id text not null,
  count integer not null,
  primary key (version_id, recipe_id, slot),
  constraint catalog_item_recipe_ingredients_recipe_fkey
    foreign key (version_id, recipe_id)
    references public.catalog_item_recipes(version_id, recipe_id) on delete restrict,
  constraint catalog_item_recipe_ingredients_item_fkey
    foreign key (version_id, item_id)
    references public.catalog_items(version_id, item_id) on delete restrict,
  constraint catalog_item_recipe_ingredients_slot_check check (slot between 1 and 5),
  constraint catalog_item_recipe_ingredients_count_check check (count > 0)
);

create index catalog_item_recipe_ingredients_item_idx
  on public.catalog_item_recipe_ingredients(version_id, item_id, recipe_id);

create trigger catalog_items_protect_published
  before insert or update or delete on public.catalog_items
  for each row execute function public.protect_published_catalog_projection();
create trigger catalog_item_recipes_protect_published
  before insert or update or delete on public.catalog_item_recipes
  for each row execute function public.protect_published_catalog_projection();
create trigger catalog_item_recipe_ingredients_protect_published
  before insert or update or delete on public.catalog_item_recipe_ingredients
  for each row execute function public.protect_published_catalog_projection();

revoke all on table
  public.catalog_items,
  public.catalog_item_recipes,
  public.catalog_item_recipe_ingredients
from public, anon, authenticated, service_role;

grant select on table
  public.catalog_items,
  public.catalog_item_recipes,
  public.catalog_item_recipe_ingredients
to authenticated, service_role;

alter table public.catalog_items enable row level security;
alter table public.catalog_item_recipes enable row level security;
alter table public.catalog_item_recipe_ingredients enable row level security;

create policy catalog_items_current_select
  on public.catalog_items for select to authenticated
  using (
    (select public.is_admin())
    or version_id in (
      select world.active_game_data_version_id
        from public.worlds as world
        join public.players as player on player.world_id = world.id
        join public.game_data_versions as version
          on version.id = world.active_game_data_version_id and version.status = 'published'
       where player.id = (select public.current_player_id())
    )
  );

create policy catalog_item_recipes_current_select
  on public.catalog_item_recipes for select to authenticated
  using (
    (select public.is_admin())
    or version_id in (
      select world.active_game_data_version_id
        from public.worlds as world
        join public.players as player on player.world_id = world.id
        join public.game_data_versions as version
          on version.id = world.active_game_data_version_id and version.status = 'published'
       where player.id = (select public.current_player_id())
    )
  );

create policy catalog_item_recipe_ingredients_current_select
  on public.catalog_item_recipe_ingredients for select to authenticated
  using (
    (select public.is_admin())
    or version_id in (
      select world.active_game_data_version_id
        from public.worlds as world
        join public.players as player on player.world_id = world.id
        join public.game_data_versions as version
          on version.id = world.active_game_data_version_id and version.status = 'published'
       where player.id = (select public.current_player_id())
    )
  );

create or replace function public.finalize_catalog_import(p_import_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version_id uuid;
  v_status public.game_data_import_status;
  v_manifest jsonb;
  v_expected integer;
  v_actual integer;
  v_entity public.game_data_entity_type;
  v_entities public.game_data_entity_type[];
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  select run.version_id, run.status, run.manifest
    into v_version_id, v_status, v_manifest
    from public.game_data_import_runs as run
   where run.id = p_import_run_id
   for update;
  if v_version_id is null then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_IMPORT_NOT_FOUND';
  end if;
  if v_status = 'finalized' then
    return v_version_id;
  end if;
  if not exists (
    select 1 from public.game_data_versions as version
     where version.id = v_version_id and version.status = 'staging'
     for update
  ) then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_NOT_STAGING';
  end if;

  v_entities := array[
    'pals', 'passive_skills', 'active_skills', 'pal_active_skills',
    'partner_skills', 'breeding_recipes', 'localizations'
  ]::public.game_data_entity_type[];
  if v_manifest->>'schema_version' = '2.0.0' then
    v_entities := v_entities || array['items', 'item_recipes']::public.game_data_entity_type[];
  end if;

  foreach v_entity in array v_entities
  loop
    v_expected := coalesce((v_manifest->'counts'->>v_entity::text)::integer, -1);
    select coalesce(sum(batch.record_count), 0)::integer
      into v_actual
      from public.game_data_import_batches as batch
     where batch.import_run_id = p_import_run_id
       and batch.entity_type = v_entity;
    if v_expected <= 0 or v_actual <> v_expected then
      raise exception using errcode = 'P0001', message = 'GAME_DATA_IMPORT_COUNT_MISMATCH';
    end if;
  end loop;

  delete from public.catalog_item_recipe_ingredients where version_id = v_version_id;
  delete from public.catalog_item_recipes where version_id = v_version_id;
  delete from public.catalog_items where version_id = v_version_id;
  delete from public.catalog_pal_active_skills where version_id = v_version_id;
  delete from public.catalog_partner_skills where version_id = v_version_id;
  delete from public.catalog_breeding_recipes where version_id = v_version_id;
  delete from public.catalog_localizations where version_id = v_version_id;
  delete from public.catalog_passive_skills where version_id = v_version_id;
  delete from public.catalog_active_skills where version_id = v_version_id;
  delete from public.catalog_pals where version_id = v_version_id;

  insert into public.catalog_pals (
    version_id, pal_id, encyclopedia_no, name_key, element_types, rarity, breeding_power, metadata
  )
  select v_version_id, record->>'pal_id', (record->>'encyclopedia_no')::integer,
    record->>'name_key', array(select value from jsonb_array_elements_text(record->'element_types') as element(value) order by value),
    (record->>'rarity')::integer, (record->>'breeding_power')::integer,
    coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'pals';

  insert into public.catalog_passive_skills (
    version_id, passive_skill_id, name_key, description_key,
    description_template_key, effects, rank, is_negative, metadata
  )
  select v_version_id, record->>'passive_skill_id', record->>'name_key',
    record->>'description_key', record->>'description_template_key',
    coalesce(record->'effects', '[]'::jsonb), (record->>'rank')::integer,
    (record->>'is_negative')::boolean, coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'passive_skills';

  insert into public.catalog_active_skills (
    version_id, active_skill_id, name_key, element_type, power, cooldown_seconds, metadata
  )
  select v_version_id, record->>'active_skill_id', record->>'name_key', record->>'element_type',
    (record->>'power')::integer, (record->>'cooldown_seconds')::numeric,
    coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'active_skills';

  insert into public.catalog_pal_active_skills (
    version_id, pal_id, active_skill_id, learn_level, is_exclusive, metadata
  )
  select v_version_id, record->>'pal_id', record->>'active_skill_id',
    (record->>'learn_level')::integer, (record->>'is_exclusive')::boolean,
    coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'pal_active_skills';

  insert into public.catalog_partner_skills (
    version_id, partner_skill_id, pal_id, name_key, description_key, metadata
  )
  select v_version_id, record->>'partner_skill_id', record->>'pal_id', record->>'name_key',
    record->>'description_key', coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'partner_skills';

  insert into public.catalog_localizations (version_id, locale, text_key, text)
  select v_version_id, record->>'locale', record->>'text_key', record->>'text'
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'localizations';

  insert into public.catalog_breeding_recipes (
    version_id, parent_a_pal_id, parent_a_gender, parent_b_pal_id, parent_b_gender,
    child_pal_id, recipe_type, metadata
  )
  select v_version_id,
    least(record->>'parent_a_pal_id', record->>'parent_b_pal_id'),
    case when record->>'parent_a_pal_id' <= record->>'parent_b_pal_id'
      then coalesce(record->>'parent_a_gender', 'any') else coalesce(record->>'parent_b_gender', 'any') end,
    greatest(record->>'parent_a_pal_id', record->>'parent_b_pal_id'),
    case when record->>'parent_a_pal_id' <= record->>'parent_b_pal_id'
      then coalesce(record->>'parent_b_gender', 'any') else coalesce(record->>'parent_a_gender', 'any') end,
    record->>'child_pal_id', (record->>'recipe_type')::public.breeding_recipe_type,
    coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'breeding_recipes';

  insert into public.catalog_items (
    version_id, item_id, name_key, description_key, type_a, type_b, max_stack_count,
    enable_handcraft, is_legal, restore_health, restore_sanity, restore_satiety,
    corruption_factor, legacy_item_ids, metadata
  )
  select v_version_id, record->>'item_id', record->>'name_key', record->>'description_key',
    record->>'type_a', record->>'type_b', (record->>'max_stack_count')::integer,
    (record->>'enable_handcraft')::boolean, (record->>'is_legal')::boolean,
    (record->>'restore_health')::integer, (record->>'restore_sanity')::integer,
    (record->>'restore_satiety')::integer, (record->>'corruption_factor')::numeric,
    array(select value from jsonb_array_elements_text(coalesce(record->'legacy_item_ids', '[]'::jsonb)) as legacy(value) order by value),
    coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'items';

  insert into public.catalog_item_recipes (
    version_id, recipe_id, product_item_id, product_count, craft_kind, work_amount,
    workable_attribute, energy_type, energy_amount, unlock_item_id, deny_recipe_chain, metadata
  )
  select v_version_id, record->>'recipe_id', record->>'product_item_id',
    (record->>'product_count')::integer, record->>'craft_kind',
    (record->>'work_amount')::numeric, (record->>'workable_attribute')::integer,
    record->>'energy_type', (record->>'energy_amount')::integer, record->>'unlock_item_id',
    array(select value from jsonb_array_elements_text(record->'deny_recipe_chain') as denied(value) order by value),
    coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'item_recipes';

  insert into public.catalog_item_recipe_ingredients (version_id, recipe_id, slot, item_id, count)
  select v_version_id, record->>'recipe_id', (ingredient->>'slot')::integer,
    ingredient->>'item_id', (ingredient->>'count')::integer
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  cross join lateral jsonb_array_elements(record->'ingredients') as recipe_ingredient(ingredient)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'item_recipes';

  if exists (
    select 1
      from (
        select name_key as text_key from public.catalog_pals where version_id = v_version_id
        union select name_key from public.catalog_passive_skills where version_id = v_version_id
        union select description_key from public.catalog_passive_skills where version_id = v_version_id and description_key is not null
        union select name_key from public.catalog_active_skills where version_id = v_version_id
        union select name_key from public.catalog_partner_skills where version_id = v_version_id
        union select description_key from public.catalog_partner_skills where version_id = v_version_id and description_key is not null
        union select name_key from public.catalog_items where version_id = v_version_id
        union select description_key from public.catalog_items where version_id = v_version_id and description_key is not null
      ) as required_key
     where not exists (
       select 1 from public.catalog_localizations as localization
        where localization.version_id = v_version_id
          and localization.text_key = required_key.text_key
     )
  ) then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_LOCALIZATION_REFERENCE_INVALID';
  end if;

  update public.game_data_versions
     set status = 'validated', validated_at = now(),
         validation_report = jsonb_build_object(
           'valid', true, 'schema_version', v_manifest->>'schema_version',
           'content_hash', v_manifest->>'content_hash', 'counts', v_manifest->'counts',
           'errors', jsonb_build_array(), 'warnings', jsonb_build_array()
         )
   where id = v_version_id;
  update public.game_data_import_runs
     set status = 'finalized', finalized_at = now()
   where id = p_import_run_id;
  return v_version_id;
end;
$$;

create or replace function public.load_game_catalog_projection(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_manifest jsonb;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select version.manifest into v_manifest
    from public.game_data_versions as version
   where version.id = p_version_id and version.status in ('validated', 'published');
  if v_manifest is null then return null; end if;
  return jsonb_build_object(
    'manifest', v_manifest,
    'pals', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by pal_id) from public.catalog_pals as row_value where version_id = p_version_id), '[]'::jsonb),
    'passive_skills', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by passive_skill_id) from public.catalog_passive_skills as row_value where version_id = p_version_id), '[]'::jsonb),
    'active_skills', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by active_skill_id) from public.catalog_active_skills as row_value where version_id = p_version_id), '[]'::jsonb),
    'pal_active_skills', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by pal_id, active_skill_id, learn_level) from public.catalog_pal_active_skills as row_value where version_id = p_version_id), '[]'::jsonb),
    'partner_skills', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by partner_skill_id) from public.catalog_partner_skills as row_value where version_id = p_version_id), '[]'::jsonb),
    'breeding_recipes', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by parent_a_pal_id, parent_b_pal_id, recipe_type) from public.catalog_breeding_recipes as row_value where version_id = p_version_id), '[]'::jsonb),
    'localizations', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by locale, text_key) from public.catalog_localizations as row_value where version_id = p_version_id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by item_id) from public.catalog_items as row_value where version_id = p_version_id), '[]'::jsonb),
    'item_recipes', coalesce((
      select jsonb_agg(
        (to_jsonb(recipe) - 'version_id') || jsonb_build_object(
          'ingredients', coalesce((
            select jsonb_agg(to_jsonb(ingredient) - array['version_id', 'recipe_id'] order by slot)
              from public.catalog_item_recipe_ingredients as ingredient
             where ingredient.version_id = recipe.version_id and ingredient.recipe_id = recipe.recipe_id
          ), '[]'::jsonb)
        ) order by recipe.recipe_id
      )
      from public.catalog_item_recipes as recipe where recipe.version_id = p_version_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.finalize_catalog_import(uuid) from public, anon, authenticated;
revoke all on function public.load_game_catalog_projection(uuid) from public, anon, authenticated;
grant execute on function public.finalize_catalog_import(uuid) to service_role;
grant execute on function public.load_game_catalog_projection(uuid) to service_role;
