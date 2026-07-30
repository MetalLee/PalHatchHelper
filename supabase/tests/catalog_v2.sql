begin;
set local search_path = public, extensions;

select plan(15);

select enum_has_labels(
  'public',
  'game_data_entity_type',
  array[
    'pals',
    'passive_skills',
    'active_skills',
    'pal_active_skills',
    'partner_skills',
    'breeding_recipes',
    'localizations',
    'items',
    'item_recipes'
  ],
  'Catalog 2.0 stages exactly nine entity types'
);

select has_column(
  'public', 'catalog_passive_skills', 'description_template_key',
  'passive skills retain the source description template key'
);
select has_column(
  'public', 'catalog_passive_skills', 'effects',
  'passive skills retain structured effect facts'
);
select has_table('public', 'catalog_items', 'Catalog 2.0 item projection exists');
select has_column(
  'public', 'catalog_items', 'legacy_item_ids',
  'item redirects are retained as canonical legacy aliases'
);
select has_table('public', 'catalog_item_recipes', 'Catalog 2.0 item recipe projection exists');
select has_table(
  'public', 'catalog_item_recipe_ingredients',
  'Catalog 2.0 item recipe ingredient projection exists'
);
select col_is_pk(
  'public', 'catalog_items', array['version_id', 'item_id'],
  'items are fixed to one immutable game-data version'
);
select col_is_pk(
  'public', 'catalog_item_recipes', array['version_id', 'recipe_id'],
  'recipes are fixed to one immutable game-data version'
);
select col_is_pk(
  'public', 'catalog_item_recipe_ingredients',
  array['version_id', 'recipe_id', 'slot'],
  'ingredient slots are deterministic within one recipe version'
);
select has_fk(
  'public', 'catalog_item_recipes',
  'recipes reference products from the same immutable catalog version'
);
select has_fk(
  'public', 'catalog_item_recipe_ingredients',
  'ingredients reference their immutable recipe and item facts'
);
select table_privs_are(
  'public', 'catalog_items', 'anon', array[]::text[],
  'anonymous users have no direct item catalog privileges'
);
select table_privs_are(
  'public', 'catalog_item_recipes', 'authenticated', array['SELECT'],
  'authenticated users only receive read access to recipe facts'
);
select table_privs_are(
  'public', 'catalog_item_recipe_ingredients', 'service_role', array['SELECT'],
  'service role only receives direct read access; writes stay behind RPCs'
);

select * from finish();
rollback;
