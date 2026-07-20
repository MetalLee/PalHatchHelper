create or replace function private.breeding_route_view(p_route jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_step jsonb;
  v_steps jsonb := '[]'::jsonb;
begin
  for v_step in
    select value from jsonb_array_elements(coalesce(p_route->'steps', '[]'::jsonb))
  loop
    v_step := jsonb_set(
      jsonb_set(v_step, '{parent_a}', private.breeding_parent_view(v_step->'parent_a')),
      '{parent_b}', private.breeding_parent_view(v_step->'parent_b')
    );
    v_steps := v_steps || jsonb_build_array(v_step);
  end loop;

  return jsonb_set(p_route, '{steps}', v_steps) || jsonb_build_object(
    'feasibility_status', coalesce(p_route->>'feasibility_status', 'ready'),
    'adoptable', coalesce((p_route->>'adoptable')::boolean, true),
    'missing_pal_count', coalesce((p_route->>'missing_pal_count')::integer, 0),
    'missing_requirements', coalesce(p_route->'missing_requirements', '[]'::jsonb)
  );
end;
$$;

revoke all on function private.breeding_route_view(jsonb)
  from public, anon, authenticated;

comment on function private.breeding_route_view(jsonb) is
  'Returns a browser-safe route projection and supplies inventory-feasibility defaults for immutable historical v2 payloads.';
