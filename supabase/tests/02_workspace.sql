begin;
\ir _helpers.psql
select plan(14);
select pg_temp.setup();

select is(
  (select role::text || ' owner=' || is_owner from public.memberships where user_id = pg_temp.ann()),
  'Admin owner=true',
  'ensure_workspace() makes a new user the Admin and owner of a new organisation'
);

select is(
  (select display_name from public.profiles where id = pg_temp.ann()),
  'ann',
  'The default display name is the part of the email before the @'
);

select pg_temp.login(pg_temp.ann());

select is(
  (select row(w.org_id, w.created)::text from public.ensure_workspace() w),
  row(pg_temp.org('a'), false)::text,
  'ensure_workspace() is idempotent and returns the existing organisation'
);

select is(
  (select array[
     (select count(*) from public.programs where org_id = pg_temp.org('a')),
     (select count(*) from public.members where org_id = pg_temp.org('a')),
     (select count(*) from public.events where org_id = pg_temp.org('a')),
     (select count(*) from public.donations where org_id = pg_temp.org('a')),
     (select count(*) from public.cases where org_id = pg_temp.org('a'))
   ]::int[]),
  array[2, 3, 1, 1, 1],
  'seed_demo_workspace() loads every module'
);

select is(
  (select program_id from public.members where org_id = pg_temp.org('a') and id = 'M-1001'),
  'P-101',
  'Seeding maps camelCase links such as programId'
);

select is(
  (select array_agg(action order by action) from public.audit_log where org_id = pg_temp.org('a')),
  array['Reset'],
  'Seeding writes one Reset entry instead of one per row'
);

insert into public.members (org_id, name, status, date, updated_by)
values (pg_temp.org('a'), 'New member', 'Active', '2026-11-01', pg_temp.ben());

select is(
  (select id from public.members where org_id = pg_temp.org('a') and name = 'New member'),
  'M-1004',
  'A record sent without an ID gets the next code for its organisation'
);

select is(
  (select updated_by from public.members where org_id = pg_temp.org('a') and name = 'New member'),
  pg_temp.ann(),
  'updated_by is set from the session, not from the client'
);

select throws_ok(
  format($$update public.members set id = 'M-9999' where org_id = %L and id = 'M-1004'$$, pg_temp.org('a')),
  '42501', null,
  'Record codes cannot be changed'
);

select throws_ok(
  format($$update public.members set org_id = %L where org_id = %L and id = 'M-1004'$$, pg_temp.org('c'), pg_temp.org('a')),
  '42501', null,
  'Records cannot be moved to another organisation'
);

select pg_temp.login(pg_temp.ben());
select throws_ok(
  format($$select public.seed_demo_workspace(%L, '{}')$$, pg_temp.org('a')),
  '42501', null,
  'Only the owner can reset an organisation'
);

select pg_temp.login(pg_temp.ann());
select throws_ok(
  format(
    $$select public.seed_demo_workspace(%L, jsonb_build_object('Members', (select jsonb_agg(jsonb_build_object('id', 'M-' || g)) from generate_series(1, 201) g)))$$,
    pg_temp.org('a')
  ),
  '22023', null,
  'Seed payloads over 200 rows per module are rejected'
);

reset role;
select pg_temp.claims(pg_temp.ann());
-- Org 'a' now has 4 members; fill it to the 1,000-row cap.
insert into public.members (org_id, name, status, date)
select pg_temp.org('a'), 'Bulk ' || g, 'Active', '2026-01-01' from generate_series(1, 996) g;

select is(
  (select count(*)::int from public.members where org_id = pg_temp.org('a')),
  1000,
  'An organisation can hold 1,000 rows in a table'
);

select throws_ok(
  format($$insert into public.members (org_id, name, status, date) values (%L, 'One too many', 'Active', '2026-01-01')$$, pg_temp.org('a')),
  'P0001', 'ORG_ROW_LIMIT',
  'The 1,001st row is rejected'
);

select * from finish();
rollback;
