-- Tenancy, identity and the role permission matrix (plan §4.2, §4.3).

-- Helpers live in a schema the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Enum labels match the TypeScript unions in apps/community-portal/src/lib/model.ts exactly.
create type public.app_role as enum (
  'Admin',
  'Staff',
  'Volunteer Coordinator',
  'Donations Manager',
  'Case Worker',
  'Board Member'
);
create type public.app_module as enum (
  'Dashboard',
  'Members',
  'Programs',
  'Events',
  'Donations',
  'Cases',
  'Reports',
  'Administration'
);
create type public.member_status as enum ('Active', 'Pending', 'Inactive', 'Archived');
create type public.program_status as enum ('Active', 'Pending', 'Inactive', 'Archived');
create type public.event_status as enum ('Upcoming', 'Completed', 'Cancelled', 'Archived');
create type public.donation_status as enum ('Needs receipt', 'Acknowledged', 'Archived');
create type public.case_status as enum ('Open', 'In progress', 'Closed', 'Archived');
create type public.case_priority as enum ('Normal', 'High', 'Urgent');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);
create index organisations_created_by on public.organisations (created_by);
create index organisations_last_active on public.organisations (last_active_at);

create table public.memberships (
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  is_owner boolean not null default false,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id),
  -- The owner can always switch roles, so the owner's membership is never deactivated.
  check (not is_owner or status = 'Active')
);
create unique index memberships_one_owner on public.memberships (org_id) where is_owner;
create index memberships_user on public.memberships (user_id);

-- A row means the role can read the module. Board Members can read but never write.
create table public.role_permissions (
  role public.app_role not null,
  module public.app_module not null,
  can_write boolean not null,
  primary key (role, module)
);

-- Mirrors `permissions` in apps/community-portal/src/lib/data.ts.
insert into public.role_permissions (role, module, can_write)
select r.role::public.app_role, m.module::public.app_module, r.role <> 'Board Member'
from (
  values
    ('Admin', array['Dashboard', 'Members', 'Programs', 'Events', 'Donations', 'Cases', 'Reports', 'Administration']),
    ('Staff', array['Dashboard', 'Members', 'Programs', 'Events', 'Donations', 'Cases', 'Reports']),
    ('Volunteer Coordinator', array['Dashboard', 'Members', 'Programs', 'Events', 'Reports']),
    ('Donations Manager', array['Dashboard', 'Members', 'Donations', 'Reports']),
    ('Case Worker', array['Dashboard', 'Members', 'Programs', 'Cases', 'Reports']),
    ('Board Member', array['Dashboard', 'Reports'])
) as r (role, modules)
cross join lateral unnest(r.modules) as m (module);

-- Only the token's SHA-256 hash is stored; the raw token appears once, in the copied link.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  email text not null check (
    char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  ),
  role public.app_role not null,
  token_hash bytea not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);
create index invitations_org on public.invitations (org_id);

-- Single row written by keepalive() (plan §9.3).
create table private.heartbeat (
  id boolean primary key default true check (id),
  beat_at timestamptz not null
);
