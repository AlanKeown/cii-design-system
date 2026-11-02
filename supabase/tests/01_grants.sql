begin;
\ir _helpers.psql
select plan(11);

select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null,
  'Every public table has RLS enabled'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'),
  0,
  'Visitors who are not signed in have no table privileges'
);

select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  array['keepalive'],
  'Visitors who are not signed in can execute only keepalive()'
);

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'The private schema is closed to anon');

select ok(
  not has_function_privilege('authenticated', 'private.purge_inactive_orgs()', 'execute')
  and not has_function_privilege('authenticated', 'private.purge_dormant_accounts()', 'execute'),
  'Signed-in users cannot run the cleanup jobs'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public'
     and privilege_type in ('DELETE', 'TRUNCATE')
     and table_name in ('members', 'programs', 'events', 'donations', 'cases', 'audit_log', 'memberships', 'invitations')),
  0,
  'Signed-in users cannot delete records, memberships, invitations or audit entries'
);

select is(
  (select array_agg(privilege_type::text order by privilege_type) from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public' and table_name = 'audit_log'),
  array['SELECT'],
  'Signed-in users can only read the audit log'
);

set local role anon;
select isnt(public.keepalive(), null, 'keepalive() works without signing in');
select throws_ok('select public.ensure_workspace()', '42501', null, 'ensure_workspace() refuses visitors who are not signed in');
reset role;

select is(
  (select beat_at from private.heartbeat),
  now(),
  'keepalive() records the heartbeat'
);

select is(
  (select array_agg(jobname::text order by jobname) from cron.job),
  array['expire-invitations', 'purge-dormant-accounts', 'purge-inactive-orgs', 'trim-audit-log'],
  'Cleanup jobs are scheduled'
);

select * from finish();
rollback;
