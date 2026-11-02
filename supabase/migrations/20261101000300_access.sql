-- Access helpers, Row Level Security and table privileges (plan §5.1–5.3).

create function private.has_access(p_org uuid, p_module public.app_module, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'Active'
      and rp.module = p_module
      and (not p_write or rp.can_write)
  );
$$;

create function private.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'Active'
  );
$$;

create function private.is_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'Active'
      and m.role = 'Admin'
  );
$$;

-- Independent of the owner's current role, so the owner can always switch back to Admin.
create function private.is_owner(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.is_owner
  );
$$;

create function private.shares_org(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.org_id = mine.org_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'Active'
      and theirs.user_id = p_user
  );
$$;

revoke all on all functions in schema private from public;
grant execute on function
  private.has_access(uuid, public.app_module, boolean),
  private.is_member(uuid),
  private.is_admin(uuid),
  private.is_owner(uuid),
  private.shares_org(uuid)
to authenticated;

-- Start from nothing, then grant exactly what the API needs. Visitors who aren't signed in get nothing.
revoke all on all tables in schema public from anon, authenticated;

alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.memberships enable row level security;
alter table public.role_permissions enable row level security;
alter table public.invitations enable row level security;
alter table public.programs enable row level security;
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.donations enable row level security;
alter table public.cases enable row level security;
alter table public.saved_views enable row level security;
alter table public.audit_log enable row level security;

-- Profiles: read your own and those of people you share an organisation with; edit only your name.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_org(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Organisations: members read; Admins rename. Creation and deletion go through RPCs only.
grant select on public.organisations to authenticated;
grant update (name) on public.organisations to authenticated;
create policy organisations_read on public.organisations for select to authenticated
  using (private.is_member(id));
create policy organisations_rename on public.organisations for update to authenticated
  using (private.is_admin(id))
  with check (private.is_admin(id));

-- Memberships: your own, or all of an organisation you administer. Changes go through RPCs only.
grant select on public.memberships to authenticated;
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin(org_id));

-- The matrix is public to signed-in users so the UI can mirror it.
grant select on public.role_permissions to authenticated;
create policy role_permissions_read on public.role_permissions for select to authenticated
  using (true);

-- Invitations: RLS on with no policies. Admins see them through list_org_users().

-- Record tables: read and write by module permission. No deletes; archiving is a status change.
do $$
declare
  t text;
  m text;
begin
  for t, m in
    select * from (values
      ('programs', 'Programs'),
      ('members', 'Members'),
      ('events', 'Events'),
      ('donations', 'Donations'),
      ('cases', 'Cases')
    ) as v (tbl, module)
  loop
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (private.has_access(org_id, %L, false))',
      t || '_read', t, m
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      || 'with check (private.has_access(org_id, %L, true))',
      t || '_insert', t, m
    );
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using (private.has_access(org_id, %L, true)) '
      || 'with check (private.has_access(org_id, %L, true))',
      t || '_update', t, m, m
    );
  end loop;
end;
$$;

-- Saved views belong to one user in one organisation.
grant select, insert, update, delete on public.saved_views to authenticated;
create policy saved_views_own on public.saved_views for all to authenticated
  using (user_id = (select auth.uid()) and private.is_member(org_id))
  with check (user_id = (select auth.uid()) and private.is_member(org_id));

-- Audit log: Admins read. Only the security definer triggers and RPCs write.
grant select on public.audit_log to authenticated;
create policy audit_log_read on public.audit_log for select to authenticated
  using (private.is_admin(org_id));

-- Tables and functions created by later migrations must opt in explicitly. Postgres still grants
-- EXECUTE to PUBLIC globally, so every public function also revokes that itself.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
