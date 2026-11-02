begin;
\ir _helpers.psql
select plan(19);
select pg_temp.setup();

-- Audit log
select pg_temp.login(pg_temp.ann());

insert into public.events (org_id, name, status, date, attendees)
values (pg_temp.org('a'), 'Audit probe', 'Upcoming', '2026-12-01', 5);
select is(
  (select action || ' ' || record_name || ' by ' || actor_name from public.audit_log
   where org_id = pg_temp.org('a') order by id desc limit 1),
  'Created Audit probe by ann',
  'Creating a record writes a Created entry with the actor''s name'
);

update public.events set notes = 'Sensitive detail' where org_id = pg_temp.org('a') and name = 'Audit probe';
select is(
  (select changes from public.audit_log where org_id = pg_temp.org('a') order by id desc limit 1),
  '{"notes": "(changed)"}'::jsonb,
  'Changing notes is logged without copying the text'
);

update public.events set attendees = 9 where org_id = pg_temp.org('a') and name = 'Audit probe';
select is(
  (select changes from public.audit_log where org_id = pg_temp.org('a') order by id desc limit 1),
  '{"attendees": {"from": 5, "to": 9}}'::jsonb,
  'Other changes are logged with old and new values'
);

update public.events set status = 'Archived' where org_id = pg_temp.org('a') and name = 'Audit probe';
select is(
  (select action from public.audit_log where org_id = pg_temp.org('a') order by id desc limit 1),
  'Archived',
  'Archiving is logged as Archived'
);

select is(
  pg_temp.affected(format($$update public.events set name = name where org_id = %L and name = 'Audit probe'$$, pg_temp.org('a')))
    + (select count(*)::int from public.audit_log where org_id = pg_temp.org('a')),
  1 + 5,
  'An update that changes nothing writes no entry'
);

select throws_ok(
  format($$insert into public.audit_log (org_id, action, table_name, record_id) values (%L, 'Forged', 'members', 'M-1')$$, pg_temp.org('a')),
  '42501', null,
  'Users cannot write audit entries'
);
select throws_ok(
  format($$update public.audit_log set action = 'Edited' where org_id = %L$$, pg_temp.org('a')),
  '42501', null,
  'Users cannot edit audit entries'
);

reset role;
update public.memberships set role = 'Staff' where user_id = pg_temp.ann() and org_id = pg_temp.org('a');
select pg_temp.login(pg_temp.ann());
select is(
  (select count(*)::int from public.audit_log where org_id = pg_temp.org('a')),
  0,
  'Only Admins can read the audit log'
);

-- Constraints mirror validateForm() and decodeRecord(). Run as the table owner so only the
-- constraints, not RLS, decide.
reset role;
select pg_temp.claims(pg_temp.ann());

select throws_ok(
  format($$insert into public.members (org_id, name, status, date) values (%L, '   ', 'Active', '2026-01-01')$$, pg_temp.org('a')),
  '23514', null, 'A blank name is rejected');
select throws_ok(
  format($$insert into public.members (org_id, name, status, date) values (%L, 'Bad date', 'Active', '2026-02-30')$$, pg_temp.org('a')),
  '22008', null, 'An impossible date is rejected');
select throws_ok(
  format($$insert into public.members (org_id, name, status, date, email) values (%L, 'Bad email', 'Active', '2026-01-01', 'not-an-email')$$, pg_temp.org('a')),
  '23514', null, 'An invalid email is rejected');
select throws_ok(
  format($$insert into public.members (org_id, name, status, date) values (%L, 'Bad status', 'Closed', '2026-01-01')$$, pg_temp.org('a')),
  '22P02', null, 'A status from another module is rejected');
select throws_ok(
  format($$insert into public.events (org_id, name, status, date, attendees) values (%L, 'Negative', 'Upcoming', '2026-01-01', -1)$$, pg_temp.org('a')),
  '23514', null, 'Negative counts are rejected');
select throws_ok(
  format($$insert into public.programs (org_id, name, status, date, capacity, participants) values (%L, 'Over', 'Active', '2026-01-01', 5, 6)$$, pg_temp.org('a')),
  '23514', null, 'Participants above capacity are rejected');
select throws_ok(
  format($$insert into public.donations (org_id, name, status, date, amount) values (%L, 'Zero', 'Needs receipt', '2026-01-01', 0)$$, pg_temp.org('a')),
  '23514', null, 'A donation of zero is rejected');
select throws_ok(
  format($$insert into public.cases (org_id, name, status, date, priority, member_id) values (%L, 'Orphan', 'Open', '2026-01-01', 'Normal', 'M-0000')$$, pg_temp.org('a')),
  '23503', null, 'A case for a member who does not exist is rejected');
select throws_ok(
  format($$insert into public.cases (org_id, name, status, date, priority, member_id) values (%L, 'Wrong org', 'Open', '2026-01-01', 'Normal', 'M-1001')$$, pg_temp.org('c')),
  '23503', null, 'A case cannot point at a member in another organisation');
select throws_ok(
  format($$insert into public.members (org_id, id, name, status, date) values (%L, 'P-1', 'Wrong prefix', 'Active', '2026-01-01')$$, pg_temp.org('a')),
  '23514', null, 'A code with another module''s prefix is rejected');
select throws_ok(
  format($$insert into public.members (org_id, name, status, date, notes) values (%L, 'Long', 'Active', '2026-01-01', repeat('x', 4001))$$, pg_temp.org('a')),
  '23514', null, 'Notes over 4,000 characters are rejected');

select * from finish();
rollback;
