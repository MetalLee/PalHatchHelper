create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;

select plan(1);
select ok(true, 'pgTAP test environment is ready');
select * from finish();

rollback;
