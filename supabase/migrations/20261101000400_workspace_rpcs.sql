-- Workspace bootstrap, seeding, role switching, invitations and user management (plan §5.4, §5.5).
-- Every function checks the caller itself; none trusts the portal to have checked first.

create function public.ensure_workspace(
  p_display_name text default null,
  p_preferred_org uuid default null
)
returns table (org_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_email text;
  v_name text;
  v_org uuid;
begin
  if v_user is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = v_user;
  v_name := left(
    coalesce(nullif(btrim(p_display_name), ''), nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Demo user'),
    80
  );
  insert into public.profiles (id, display_name) values (v_user, v_name)
  on conflict (id) do nothing;

  select m.org_id into v_org
  from public.memberships m
  where m.user_id = v_user and m.status = 'Active' and m.org_id = p_preferred_org;

  if v_org is null then
    select m.org_id into v_org
    from public.memberships m
    join public.organisations o on o.id = m.org_id
    where m.user_id = v_user and m.status = 'Active'
    order by o.last_active_at desc
    limit 1;
  end if;

  if v_org is null then
    select p.display_name into v_name from public.profiles p where p.id = v_user;
    insert into public.organisations (name, created_by)
    values (left(v_name || '''s demo organisation', 120), v_user)
    returning id into v_org;
    insert into public.memberships (org_id, user_id, role, is_owner)
    values (v_org, v_user, 'Admin', true);
    return query select v_org, true;
    return;
  end if;

  update public.organisations o set last_active_at = now() where o.id = v_org;
  return query select v_org, false;
end;
$$;

-- Replaces the organisation's records with the payload in one transaction. The payload uses the
-- portal's PortalRecords shape (camelCase keys); Administration entries are ignored because
-- organisation users are real accounts.
create function public.seed_demo_workspace(p_org uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if not private.is_owner(p_org) then
    raise exception 'Only the organisation owner can reset demo data.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Invalid demo data.' using errcode = '22023';
  end if;
  foreach v_key in array array['Programs', 'Members', 'Events', 'Donations', 'Cases'] loop
    if jsonb_typeof(coalesce(p_payload -> v_key, '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(p_payload -> v_key, '[]'::jsonb)) > 200 then
      raise exception 'Invalid demo data.' using errcode = '22023', hint = v_key;
    end if;
  end loop;

  perform set_config('app.skip_audit', 'on', true);

  delete from public.cases where org_id = p_org;
  delete from public.donations where org_id = p_org;
  delete from public.events where org_id = p_org;
  delete from public.members where org_id = p_org;
  delete from public.programs where org_id = p_org;

  insert into public.programs (org_id, id, name, status, type, location, date, notes, capacity, participants)
  select p_org, r.id, r.name, r.status::public.program_status, coalesce(r.type, ''), coalesce(r.location, ''),
    r.date, r.notes, r.capacity, r.participants
  from jsonb_to_recordset(coalesce(p_payload -> 'Programs', '[]'::jsonb)) as r (
    id text, name text, status text, type text, location text, date date, notes text,
    capacity integer, participants integer
  );

  insert into public.members (org_id, id, name, status, type, location, date, notes, email, phone, tags, program_id)
  select p_org, r.id, r.name, r.status::public.member_status, coalesce(r.type, ''), coalesce(r.location, ''),
    r.date, r.notes, coalesce(r.email, ''), r.phone, r.tags, nullif(r."programId", '')
  from jsonb_to_recordset(coalesce(p_payload -> 'Members', '[]'::jsonb)) as r (
    id text, name text, status text, type text, location text, date date, notes text,
    email text, phone text, tags text, "programId" text
  );

  insert into public.events (org_id, id, name, status, type, location, date, notes, attendees)
  select p_org, r.id, r.name, r.status::public.event_status, coalesce(r.type, ''), coalesce(r.location, ''),
    r.date, r.notes, r.attendees
  from jsonb_to_recordset(coalesce(p_payload -> 'Events', '[]'::jsonb)) as r (
    id text, name text, status text, type text, location text, date date, notes text, attendees integer
  );

  insert into public.donations (org_id, id, name, status, type, location, date, notes, amount)
  select p_org, r.id, r.name, r.status::public.donation_status, coalesce(r.type, ''), coalesce(r.location, ''),
    r.date, r.notes, r.amount
  from jsonb_to_recordset(coalesce(p_payload -> 'Donations', '[]'::jsonb)) as r (
    id text, name text, status text, type text, location text, date date, notes text, amount numeric
  );

  insert into public.cases (org_id, id, name, status, type, location, date, notes, priority, member_id)
  select p_org, r.id, r.name, r.status::public.case_status, coalesce(r.type, ''), coalesce(r.location, ''),
    r.date, r.notes, r.priority::public.case_priority, r."memberId"
  from jsonb_to_recordset(coalesce(p_payload -> 'Cases', '[]'::jsonb)) as r (
    id text, name text, status text, type text, location text, date date, notes text,
    priority text, "memberId" text
  );

  perform set_config('app.skip_audit', 'off', true);
  perform private.write_audit(p_org, 'Reset', 'organisations', p_org::text, 'Demo data');
end;
$$;

-- Owner-only: changes the caller's own role so they can experience it under real enforcement.
create function public.set_my_demo_role(p_org uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.app_role;
begin
  if not private.is_owner(p_org) then
    raise exception 'Only the organisation owner can switch roles.' using errcode = '42501';
  end if;
  select m.role into v_old from public.memberships m
  where m.org_id = p_org and m.user_id = auth.uid()
  for update;
  if v_old = p_role then
    return;
  end if;
  update public.memberships m set role = p_role
  where m.org_id = p_org and m.user_id = auth.uid();
  perform private.write_audit(
    p_org, 'Role changed', 'memberships', auth.uid()::text,
    (select p.display_name from public.profiles p where p.id = auth.uid()),
    jsonb_build_object('role', jsonb_build_object('from', v_old, 'to', p_role))
  );
end;
$$;

-- Admin-only. Returns the raw token once; only its hash is stored. No email is sent.
create function public.create_invitation(p_org uuid, p_email text, p_role public.app_role)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_email text := lower(btrim(p_email));
begin
  if not private.is_admin(p_org) then
    raise exception 'Only Admins can invite users.' using errcode = '42501';
  end if;
  if (
    select count(*) from public.invitations i
    where i.org_id = p_org and i.accepted_at is null and i.expires_at > now()
  ) >= 20 then
    raise exception 'ORG_ROW_LIMIT' using errcode = 'P0001', hint = 'Each organisation can have 20 open invitations.';
  end if;
  insert into public.invitations (org_id, email, role, token_hash, invited_by)
  values (p_org, v_email, p_role, sha256(convert_to(v_token, 'UTF8')), auth.uid());
  perform private.write_audit(p_org, 'Invited', 'invitations', v_email, v_email, jsonb_build_object('role', p_role));
  return v_token;
end;
$$;

-- Every failure gives the same message, so tokens and addresses can't be probed.
create function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_invite public.invitations;
begin
  if v_user is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = v_user;
  select * into v_invite from public.invitations i
  where i.token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'))
  for update;
  if v_invite.id is null
    or v_invite.accepted_at is not null
    or v_invite.expires_at <= now()
    or lower(v_invite.email) <> lower(coalesce(v_email, '')) then
    raise exception 'INVITATION_INVALID'
      using errcode = 'P0001', hint = 'This invitation link is not valid. Ask for a new one.';
  end if;

  insert into public.profiles (id, display_name)
  values (v_user, left(coalesce(nullif(split_part(v_email, '@', 1), ''), 'Demo user'), 80))
  on conflict (id) do nothing;

  -- An owner's own membership is never changed by an invitation.
  insert into public.memberships (org_id, user_id, role)
  values (v_invite.org_id, v_user, v_invite.role)
  on conflict (org_id, user_id) do update
    set role = excluded.role, status = 'Active'
    where not public.memberships.is_owner;

  update public.invitations set accepted_at = now(), accepted_by = v_user where id = v_invite.id;
  perform private.write_audit(
    v_invite.org_id, 'Joined', 'memberships', v_user::text,
    (select p.display_name from public.profiles p where p.id = v_user),
    jsonb_build_object('role', v_invite.role)
  );
  return v_invite.org_id;
end;
$$;

create function public.set_member_role(p_org uuid, p_user uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.memberships;
begin
  if not private.is_admin(p_org) then
    raise exception 'Only Admins can change roles.' using errcode = '42501';
  end if;
  select * into v_member from public.memberships m
  where m.org_id = p_org and m.user_id = p_user
  for update;
  if v_member.user_id is null or v_member.is_owner then
    raise exception 'This user''s role cannot be changed here.' using errcode = '42501';
  end if;
  update public.memberships m set role = p_role, status = 'Active'
  where m.org_id = p_org and m.user_id = p_user;
  perform private.write_audit(
    p_org, 'Role changed', 'memberships', p_user::text,
    (select p.display_name from public.profiles p where p.id = p_user),
    jsonb_build_object('role', jsonb_build_object('from', v_member.role, 'to', p_role))
  );
end;
$$;

create function public.deactivate_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.memberships;
begin
  if not private.is_admin(p_org) then
    raise exception 'Only Admins can deactivate users.' using errcode = '42501';
  end if;
  select * into v_member from public.memberships m
  where m.org_id = p_org and m.user_id = p_user
  for update;
  if v_member.user_id is null or v_member.is_owner then
    raise exception 'This user cannot be deactivated.' using errcode = '42501';
  end if;
  update public.memberships m set status = 'Inactive'
  where m.org_id = p_org and m.user_id = p_user;
  perform private.write_audit(
    p_org, 'Archived', 'memberships', p_user::text,
    (select p.display_name from public.profiles p where p.id = p_user)
  );
end;
$$;

-- The Administration module in live mode: real members plus open invitations, Admins only.
-- Shaped like UserRecord in model.ts (snake_case; the portal server maps the names).
create function public.list_org_users(p_org uuid)
returns table (
  id text,
  user_id uuid,
  invitation_id uuid,
  name text,
  email text,
  role public.app_role,
  status text,
  date date,
  is_owner boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin(p_org) then
    raise exception 'Only Admins can view users.' using errcode = '42501';
  end if;
  return query
    select
      'U-' || left(m.user_id::text, 8),
      m.user_id,
      null::uuid,
      coalesce(p.display_name, u.email::text, ''),
      coalesce(u.email::text, ''),
      m.role,
      m.status,
      m.joined_at::date,
      m.is_owner
    from public.memberships m
    left join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    where m.org_id = p_org
    union all
    select
      'I-' || left(i.id::text, 8),
      null::uuid,
      i.id,
      i.email,
      i.email,
      i.role,
      'Pending',
      i.created_at::date,
      false
    from public.invitations i
    where i.org_id = p_org and i.accepted_at is null and i.expires_at > now()
    order by 8 desc, 4;
end;
$$;

revoke all on function
  public.ensure_workspace(text, uuid),
  public.seed_demo_workspace(uuid, jsonb),
  public.set_my_demo_role(uuid, public.app_role),
  public.create_invitation(uuid, text, public.app_role),
  public.accept_invitation(text),
  public.set_member_role(uuid, uuid, public.app_role),
  public.deactivate_member(uuid, uuid),
  public.list_org_users(uuid)
from public, anon;
grant execute on function
  public.ensure_workspace(text, uuid),
  public.seed_demo_workspace(uuid, jsonb),
  public.set_my_demo_role(uuid, public.app_role),
  public.create_invitation(uuid, text, public.app_role),
  public.accept_invitation(text),
  public.set_member_role(uuid, uuid, public.app_role),
  public.deactivate_member(uuid, uuid),
  public.list_org_users(uuid)
to authenticated;
