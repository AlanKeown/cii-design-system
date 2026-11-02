begin;
\ir _helpers.psql
select plan(29);
select pg_temp.setup();

-- Three checks per role: the record tables it can read, insert into and update, compared with
-- role_permissions. Board Members expect three empty lists.
create function pg_temp.check_matrix(p_role text) returns setof text language plpgsql as $$
declare
  v_org uuid := pg_temp.org('a');
  v_tables text[] := array['cases', 'donations', 'events', 'members', 'programs'];
  v_read text[];
  v_write text[];
begin
  select coalesce(array_agg(lower(rp.module::text) order by lower(rp.module::text)), '{}')
  into v_read
  from public.role_permissions rp
  where rp.role::text = p_role and lower(rp.module::text) = any (v_tables);
  select coalesce(array_agg(lower(rp.module::text) order by lower(rp.module::text)), '{}')
  into v_write
  from public.role_permissions rp
  where rp.role::text = p_role and rp.can_write and lower(rp.module::text) = any (v_tables);

  return next is(
    array(select t from unnest(v_tables) t where pg_temp.can_read(t, v_org) order by t),
    v_read, p_role || ' reads exactly its modules');
  return next is(
    array(select t from unnest(v_tables) t where pg_temp.can_insert(t, v_org) order by t),
    v_write, p_role || ' creates records in exactly its writable modules');
  return next is(
    array(select t from unnest(v_tables) t where pg_temp.can_update(t, v_org) order by t),
    v_write, p_role || ' edits records in exactly its writable modules');
end;
$$;

-- Isolation: ben owns org 'b' and has no role in org 'a'.
select pg_temp.login(pg_temp.ben());

select is(
  array(select t from unnest(array['cases', 'donations', 'events', 'members', 'programs']) t where pg_temp.can_read(t, pg_temp.org('a'))),
  '{}'::text[],
  'Another organisation''s records are invisible'
);
select is(
  array(select t from unnest(array['cases', 'donations', 'events', 'members', 'programs']) t where pg_temp.can_insert(t, pg_temp.org('a'))),
  '{}'::text[],
  'Records cannot be created in another organisation, even with its ID'
);
select is(
  pg_temp.affected(format($$update public.members set name = 'Taken over' where org_id = %L$$, pg_temp.org('a'))),
  0,
  'Records in another organisation cannot be edited'
);
select is((select count(*)::int from public.organisations where id = pg_temp.org('a')), 0, 'Another organisation is invisible');
select is((select count(*)::int from public.memberships where org_id = pg_temp.org('a')), 0, 'Another organisation''s memberships are invisible');
select is((select count(*)::int from public.profiles where id = pg_temp.ann()), 0, 'Profiles of people in other organisations are invisible');
select is((select count(*)::int from public.audit_log where org_id = pg_temp.org('a')), 0, 'Another organisation''s audit log is invisible');
select throws_ok(
  format($$insert into public.saved_views (org_id, name, module) values (%L, 'Mine now', 'Members')$$, pg_temp.org('a')),
  '42501', null,
  'Saved views cannot be created in another organisation'
);
select throws_ok(
  format($$select public.report_rows(%L, 'Members')$$, pg_temp.org('a')),
  '42501', null,
  'Reports for another organisation are refused'
);
select throws_ok(
  format($$select * from public.list_org_users(%L)$$, pg_temp.org('a')),
  '42501', null,
  'The user list of another organisation is refused'
);
select is(
  (select count(*)::int from public.members where org_id = pg_temp.org('b')),
  3,
  'Users still see their own organisation'
);

-- Matrix: ann is the owner of org 'a'; switch her role directly and probe as her.
reset role;
update public.memberships set role = 'Admin' where user_id = pg_temp.ann() and org_id = pg_temp.org('a');
select pg_temp.login(pg_temp.ann());
select * from pg_temp.check_matrix('Admin');

reset role;
update public.memberships set role = 'Staff' where user_id = pg_temp.ann() and org_id = pg_temp.org('a');
select pg_temp.login(pg_temp.ann());
select * from pg_temp.check_matrix('Staff');

reset role;
update public.memberships set role = 'Volunteer Coordinator' where user_id = pg_temp.ann() and org_id = pg_temp.org('a');
select pg_temp.login(pg_temp.ann());
select * from pg_temp.check_matrix('Volunteer Coordinator');

reset role;
update public.memberships set role = 'Donations Manager' where user_id = pg_temp.ann() and org_id = pg_temp.org('a');
select pg_temp.login(pg_temp.ann());
select * from pg_temp.check_matrix('Donations Manager');

reset role;
update public.memberships set role = 'Case Worker' where user_id = pg_temp.ann() and org_id = pg_temp.org('a');
select pg_temp.login(pg_temp.ann());
select * from pg_temp.check_matrix('Case Worker');

reset role;
update public.memberships set role = 'Board Member' where user_id = pg_temp.ann() and org_id = pg_temp.org('a');
select pg_temp.login(pg_temp.ann());
select * from pg_temp.check_matrix('Board Member');

select * from finish();
rollback;
