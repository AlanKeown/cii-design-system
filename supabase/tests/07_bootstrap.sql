begin;
\ir _helpers.psql
select plan(7);
select pg_temp.make_user('d0000000-0000-4000-8000-000000000004', 'bootstrap@example.test');
select ok(not has_function_privilege('anon', 'public.bootstrap_demo_workspace(jsonb,uuid)', 'execute'), 'Anonymous callers cannot bootstrap workspaces');
select pg_temp.login('d0000000-0000-4000-8000-000000000004');
select throws_ok($$select * from public.bootstrap_demo_workspace('{"Members":5}'::jsonb)$$, '22023', null, 'Invalid seed fails the entire bootstrap');
select is((select count(*) from public.profiles where id = auth.uid()), 0::bigint, 'Failed bootstrap rolls back the profile');
select is((select count(*) from public.organisations where created_by = auth.uid()), 0::bigint, 'Failed bootstrap rolls back the organisation');
select is((select created from public.bootstrap_demo_workspace(pg_temp.demo())), true, 'First successful bootstrap creates a workspace');
select is((select count(*) from public.members), 3::bigint, 'The same transaction seeds its member records');
select is((select created from public.bootstrap_demo_workspace('[]'::jsonb)), false, 'Existing workspaces are reused without reseeding');
select * from finish();
rollback;
