begin;
\ir _helpers.psql
select plan(22);
select pg_temp.setup();

-- ann (Admin and owner of org 'a') invites cat as a Case Worker.
select pg_temp.login(pg_temp.ann());
select set_config('test.token', public.create_invitation(pg_temp.org('a'), ' Cat@Example.test ', 'Case Worker'), true);

select ok(current_setting('test.token') ~ '^[0-9a-f]{64}$', 'An invitation returns a 64-character random token');

reset role;
select is(
  (select email || ' ' || role from public.invitations where org_id = pg_temp.org('a')),
  'cat@example.test Case Worker',
  'The invitation stores the cleaned-up email and role'
);
select is(
  (select count(*)::int from public.invitations where token_hash = convert_to(current_setting('test.token'), 'UTF8')),
  0,
  'The raw token is not stored'
);

select pg_temp.login(pg_temp.ann());
select is(
  (select array_agg(status || ':' || email order by status) from public.list_org_users(pg_temp.org('a'))),
  array['Active:ann@example.test', 'Pending:cat@example.test'],
  'The user list shows members and open invitations'
);

select pg_temp.login(pg_temp.cat());
select throws_ok(
  format($$select public.create_invitation(%L, 'x@example.test', 'Admin')$$, pg_temp.org('a')),
  '42501', null,
  'Only Admins of the organisation can invite'
);

select pg_temp.login(pg_temp.ben());
select throws_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('test.token')),
  'P0001', 'INVITATION_INVALID',
  'An invitation cannot be accepted by a different email address'
);

select pg_temp.login(pg_temp.cat());
select throws_ok(
  $$select public.accept_invitation('0000')$$,
  'P0001', 'INVITATION_INVALID',
  'A made-up token is rejected with the same message'
);
select is(
  public.accept_invitation(current_setting('test.token')),
  pg_temp.org('a'),
  'The invited user can accept and joins the organisation'
);
select is(
  (select role::text from public.memberships where org_id = pg_temp.org('a') and user_id = pg_temp.cat()),
  'Case Worker',
  'The new member has the invited role'
);
select ok(
  pg_temp.can_read('cases', pg_temp.org('a')) and not pg_temp.can_read('donations', pg_temp.org('a')),
  'The new member sees exactly what a Case Worker sees'
);
select throws_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('test.token')),
  'P0001', 'INVITATION_INVALID',
  'An invitation can be used only once'
);
select throws_ok(
  format($$select * from public.list_org_users(%L)$$, pg_temp.org('a')),
  '42501', null,
  'Only Admins can see the user list'
);
select throws_ok(
  format($$select public.set_member_role(%L, %L, 'Admin')$$, pg_temp.org('a'), pg_temp.cat()),
  '42501', null,
  'Members cannot promote themselves'
);
select throws_ok(
  format($$select public.set_my_demo_role(%L, 'Admin')$$, pg_temp.org('a')),
  '42501', null,
  'Only the owner can use demo role switching'
);

-- Expired invitations
select pg_temp.login(pg_temp.ann());
select set_config('test.token_ben', public.create_invitation(pg_temp.org('a'), 'ben@example.test', 'Staff'), true);
reset role;
update public.invitations set expires_at = now() - interval '1 minute' where email = 'ben@example.test';
select pg_temp.login(pg_temp.ben());
select throws_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('test.token_ben')),
  'P0001', 'INVITATION_INVALID',
  'An expired invitation is rejected'
);

-- Admin user management
select pg_temp.login(pg_temp.ann());
select public.set_member_role(pg_temp.org('a'), pg_temp.cat(), 'Board Member');
select pg_temp.login(pg_temp.cat());
select ok(not pg_temp.can_read('cases', pg_temp.org('a')), 'A role change takes effect immediately');

select pg_temp.login(pg_temp.ann());
select throws_ok(
  format($$select public.set_member_role(%L, %L, 'Staff')$$, pg_temp.org('a'), pg_temp.ann()),
  '42501', null,
  'The owner''s role cannot be changed through user management'
);
select public.deactivate_member(pg_temp.org('a'), pg_temp.cat());
select pg_temp.login(pg_temp.cat());
select is(
  (select count(*)::int from public.organisations where id = pg_temp.org('a')),
  0,
  'A deactivated member loses access to the organisation'
);

-- Owner demo role switching
select pg_temp.login(pg_temp.ann());
select public.set_my_demo_role(pg_temp.org('a'), 'Volunteer Coordinator');
select ok(
  pg_temp.can_read('events', pg_temp.org('a')) and not pg_temp.can_read('donations', pg_temp.org('a')),
  'After switching, the owner sees exactly what a Volunteer Coordinator sees'
);
select public.set_my_demo_role(pg_temp.org('a'), 'Board Member');
select lives_ok(
  format($$select public.set_my_demo_role(%L, 'Admin')$$, pg_temp.org('a')),
  'The owner can always switch back to Admin, even from Board Member'
);
select ok(pg_temp.can_read('donations', pg_temp.org('a')), 'The owner has Admin access again');
select is(
  (select array_agg(distinct action order by action) from public.audit_log
   where org_id = pg_temp.org('a') and table_name in ('invitations', 'memberships')),
  array['Archived', 'Invited', 'Joined', 'Role changed'],
  'Invitations, joining, role changes and deactivation are all audited'
);

select * from finish();
rollback;
