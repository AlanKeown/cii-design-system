-- Reports, account deletion, keep-alive and scheduled cleanup (plan §5.6, §5.7, §9.3, §9.4).

-- Full rows for modules the caller can read; de-identified rows for other modules when the caller
-- has Reports access (Board Members). Returns snake_case rows as a JSON array.
create function public.report_rows(
  p_org uuid,
  p_module public.app_module,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_table text := case p_module
    when 'Members' then 'members'
    when 'Programs' then 'programs'
    when 'Events' then 'events'
    when 'Donations' then 'donations'
    when 'Cases' then 'cases'
  end;
  -- Fields that identify nobody: no names, contact details, notes, tags or links to other records.
  v_safe text[] := array['id', 'status', 'type', 'location', 'date']
    || case p_module
      when 'Programs' then array['capacity', 'participants']
      when 'Events' then array['attendees']
      when 'Donations' then array['amount']
      when 'Cases' then array['priority']
      else array[]::text[]
    end;
  v_rows jsonb;
  v_full boolean;
begin
  if v_table is null then
    raise exception 'Reports are not available for this module.' using errcode = '22023';
  end if;
  v_full := private.has_access(p_org, p_module, false);
  if not v_full and not private.has_access(p_org, 'Reports', false) then
    raise exception 'You do not have access to these reports.' using errcode = '42501';
  end if;
  execute format(
    'select coalesce(jsonb_agg(row order by row ->> ''date'', row ->> ''id''), ''[]''::jsonb) from ('
    || ' select case when $4 then to_jsonb(t) - ''org_id'''
    || ' else (select jsonb_object_agg(e.key, e.value) from jsonb_each(to_jsonb(t)) e where e.key = any ($5)) end as row'
    || ' from public.%I t'
    || ' where t.org_id = $1 and ($2::date is null or t.date >= $2) and ($3::date is null or t.date <= $3)'
    || ') rows',
    v_table
  ) into v_rows using p_org, p_from, p_to, v_full, v_safe;
  return v_rows;
end;
$$;

-- Deletes the caller's account. Cascades to the organisations they own and everything in them.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Keep-alive: a real write to one fixed row. Callable without signing in (plan §9.3).
create function public.keepalive()
returns timestamptz
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.heartbeat (id, beat_at) values (true, now())
  on conflict (id) do update set beat_at = excluded.beat_at
  returning beat_at;
$$;

revoke all on function
  public.report_rows(uuid, public.app_module, date, date),
  public.delete_my_account(),
  public.keepalive()
from public, anon, authenticated;
grant execute on function
  public.report_rows(uuid, public.app_module, date, date),
  public.delete_my_account()
to authenticated;
grant execute on function public.keepalive() to anon, authenticated;

-- Scheduled cleanup. pg_cron runs inside the database, so it does not count as project activity.
create function private.purge_inactive_orgs()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.organisations where last_active_at < now() - interval '30 days';
$$;

create function private.purge_dormant_accounts()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users
  where coalesce(last_sign_in_at, created_at) < now() - interval '90 days';
$$;

create function private.trim_audit_log()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.audit_log a
  using (
    select l.id, row_number() over (partition by l.org_id order by l.at desc, l.id desc) as position
    from public.audit_log l
  ) ranked
  where a.id = ranked.id and ranked.position > 500;
$$;

create function private.expire_invitations()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.invitations
  where (accepted_at is null and expires_at < now() - interval '7 days')
    or accepted_at < now() - interval '30 days';
$$;

revoke all on function
  private.purge_inactive_orgs(),
  private.purge_dormant_accounts(),
  private.trim_audit_log(),
  private.expire_invitations()
from public, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

-- Times are UTC, which is early morning in eastern Australia (03:30–05:00 depending on daylight saving).
select cron.schedule('purge-inactive-orgs', '30 17 * * *', 'select private.purge_inactive_orgs()');
select cron.schedule('purge-dormant-accounts', '40 17 * * *', 'select private.purge_dormant_accounts()');
select cron.schedule('trim-audit-log', '50 17 * * *', 'select private.trim_audit_log()');
select cron.schedule('expire-invitations', '55 17 * * *', 'select private.expire_invitations()');
