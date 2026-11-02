begin;
\ir _helpers.psql
select plan(11);
select pg_temp.setup();

create function pg_temp.report_keys(p_rows jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct k order by k), '{}')
  from jsonb_array_elements(p_rows) e, jsonb_object_keys(e) k
$$;

select pg_temp.login(pg_temp.ann());
select public.set_my_demo_role(pg_temp.org('a'), 'Board Member');

select is(
  jsonb_array_length(public.report_rows(pg_temp.org('a'), 'Members')),
  3,
  'Board Members get a row for every member'
);
select is(
  pg_temp.report_keys(public.report_rows(pg_temp.org('a'), 'Members')),
  array['date', 'id', 'location', 'status', 'type'],
  'Board Member member reports leave out names, contact details, notes, tags and links'
);
select is(
  pg_temp.report_keys(public.report_rows(pg_temp.org('a'), 'Cases')),
  array['date', 'id', 'location', 'priority', 'status', 'type'],
  'Board Member case reports leave out names, notes and the member link'
);
select is(
  pg_temp.report_keys(public.report_rows(pg_temp.org('a'), 'Donations')),
  array['amount', 'date', 'id', 'location', 'status', 'type'],
  'Board Member donation reports keep the amount'
);

select public.set_my_demo_role(pg_temp.org('a'), 'Donations Manager');
select ok(
  public.report_rows(pg_temp.org('a'), 'Members') -> 0 ? 'email'
  and not (public.report_rows(pg_temp.org('a'), 'Programs') -> 0 ? 'name'),
  'Other roles get full rows for modules they can read and de-identified rows for the rest'
);

select public.set_my_demo_role(pg_temp.org('a'), 'Admin');
select is(
  public.report_rows(pg_temp.org('a'), 'Members', '2099-01-01', null),
  '[]'::jsonb,
  'Date filters apply'
);
select throws_ok(
  format($$select public.report_rows(%L, 'Administration')$$, pg_temp.org('a')),
  '22023', null,
  'Administration is not a report module'
);

-- ben deletes his account.
select pg_temp.login(pg_temp.ben());
select lives_ok('select public.delete_my_account()', 'Users can delete their own account');
reset role;
select is((select count(*)::int from auth.users where id = pg_temp.ben()), 0, 'The account is gone');
select is(
  (select count(*)::int from public.members where org_id = pg_temp.org('b')),
  0,
  'Deleting an account deletes the organisation it owns and its records'
);
select is(
  (select count(*)::int from public.members where org_id = pg_temp.org('a')),
  3,
  'Other organisations are untouched'
);

select * from finish();
rollback;
