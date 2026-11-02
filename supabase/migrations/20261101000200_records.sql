-- Record tables, saved views and the audit log (plan §4.4, §4.6).
-- Constraints mirror decodeRecord() and validateForm() in apps/community-portal/src/lib/records.ts.

create table public.programs (
  org_id uuid not null references public.organisations (id) on delete cascade,
  id text not null check (id ~ '^P-[0-9A-Za-z-]{1,60}$'),
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  status public.program_status not null,
  type text not null default '' check (char_length(type) <= 100),
  location text not null default '' check (char_length(location) <= 100),
  date date not null,
  notes text check (char_length(notes) <= 4000),
  capacity integer not null check (capacity >= 0),
  participants integer not null check (participants >= 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (org_id, id),
  check (participants <= capacity)
);

create table public.members (
  org_id uuid not null references public.organisations (id) on delete cascade,
  id text not null check (id ~ '^M-[0-9A-Za-z-]{1,60}$'),
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  status public.member_status not null,
  type text not null default '' check (char_length(type) <= 100),
  location text not null default '' check (char_length(location) <= 100),
  date date not null,
  notes text check (char_length(notes) <= 4000),
  email text not null default '' check (
    email = '' or (char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
  ),
  phone text check (char_length(phone) <= 40),
  tags text check (char_length(tags) <= 200),
  program_id text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, program_id) references public.programs (org_id, id)
    on delete set null (program_id)
);

create table public.events (
  org_id uuid not null references public.organisations (id) on delete cascade,
  id text not null check (id ~ '^E-[0-9A-Za-z-]{1,60}$'),
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  status public.event_status not null,
  type text not null default '' check (char_length(type) <= 100),
  location text not null default '' check (char_length(location) <= 100),
  date date not null,
  notes text check (char_length(notes) <= 4000),
  attendees integer not null check (attendees >= 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.donations (
  org_id uuid not null references public.organisations (id) on delete cascade,
  id text not null check (id ~ '^D-[0-9A-Za-z-]{1,60}$'),
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  status public.donation_status not null,
  type text not null default '' check (char_length(type) <= 100),
  location text not null default '' check (char_length(location) <= 100),
  date date not null,
  notes text check (char_length(notes) <= 4000),
  amount numeric(12, 2) not null check (amount > 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.cases (
  org_id uuid not null references public.organisations (id) on delete cascade,
  id text not null check (id ~ '^C-[0-9A-Za-z-]{1,60}$'),
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  status public.case_status not null,
  type text not null default '' check (char_length(type) <= 100),
  location text not null default '' check (char_length(location) <= 100),
  date date not null,
  notes text check (char_length(notes) <= 4000),
  priority public.case_priority not null,
  member_id text not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, member_id) references public.members (org_id, id)
);
create index cases_member on public.cases (org_id, member_id);
create index members_program on public.members (org_id, program_id);

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  module public.app_module not null check (module not in ('Dashboard', 'Reports')),
  query text not null default '' check (char_length(query) <= 200),
  status text not null default 'All statuses' check (char_length(status) <= 40),
  sort text not null default 'name' check (sort in ('name', 'status', 'date')),
  created_at timestamptz not null default now()
);
create index saved_views_owner on public.saved_views (org_id, user_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organisations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null default '',
  action text not null,
  table_name text not null,
  record_id text not null,
  record_name text not null default '',
  changes jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index audit_log_org_at on public.audit_log (org_id, at desc);

-- Keys are immutable, server fields are always set here, codes are assigned when the
-- client sends none, and each organisation is capped at 1,000 rows per table.
create function private.before_record_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text := case tg_table_name
    when 'members' then 'M'
    when 'programs' then 'P'
    when 'events' then 'E'
    when 'donations' then 'D'
    when 'cases' then 'C'
  end;
  v_count bigint;
  v_next bigint;
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id or new.id is distinct from old.id then
      raise exception 'Record keys cannot be changed.' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
  else
    -- Serialise inserts per organisation and table so counts and new codes are exact.
    perform pg_advisory_xact_lock(hashtextextended(new.org_id::text || ':' || tg_table_name, 0));
    execute format('select count(*) from public.%I where org_id = $1', tg_table_name)
      into v_count using new.org_id;
    if v_count >= 1000 then
      raise exception 'ORG_ROW_LIMIT'
        using errcode = 'P0001', hint = 'Each demo organisation can hold 1,000 rows per table.';
    end if;
    if new.id is null or new.id = '' then
      execute format(
        'select coalesce(max(substring(id from 3)::bigint), 0) + 1 from public.%I '
        || 'where org_id = $1 and id ~ ''^[A-Z]-[0-9]{1,15}$''',
        tg_table_name
      ) into v_next using new.org_id;
      new.id := v_prefix || '-' || v_next;
    end if;
    new.created_at := now();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  -- Throttled so busy organisations don't rewrite this row on every change.
  update public.organisations
  set last_active_at = now()
  where id = new.org_id and last_active_at < now() - interval '1 hour';
  return new;
end;
$$;

-- Writes one audit row per change. Notes contents are never copied into the log.
create function private.audit_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_action text;
begin
  -- seed_demo_workspace() writes a single Reset entry instead of one per row.
  if current_setting('app.skip_audit', true) = 'on' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    v_action := 'Created';
  else
    v_old := to_jsonb(old);
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at', 'updated_by', 'created_at')
        and v_new -> v_key is distinct from v_old -> v_key then
        v_changes := v_changes || jsonb_build_object(
          v_key,
          case
            when v_key = 'notes' then to_jsonb('(changed)'::text)
            else jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key)
          end
        );
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
    v_action := case
      when v_new ->> 'status' = 'Archived' and v_old ->> 'status' is distinct from 'Archived'
        then 'Archived'
      else 'Updated'
    end;
  end if;
  perform private.write_audit(new.org_id, v_action, tg_table_name, new.id, v_new ->> 'name', v_changes);
  return null;
end;
$$;

create function private.write_audit(
  p_org uuid,
  p_action text,
  p_table text,
  p_record_id text,
  p_record_name text,
  p_changes jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (org_id, actor_id, actor_name, action, table_name, record_id, record_name, changes)
  values (
    p_org,
    auth.uid(),
    coalesce((select p.display_name from public.profiles p where p.id = auth.uid()), ''),
    p_action,
    p_table,
    p_record_id,
    coalesce(p_record_name, ''),
    coalesce(p_changes, '{}'::jsonb)
  );
$$;

do $$
declare
  t text;
begin
  foreach t in array array['programs', 'members', 'events', 'donations', 'cases'] loop
    execute format(
      'create trigger before_write before insert or update on public.%I '
      || 'for each row execute function private.before_record_write()',
      t
    );
    execute format(
      'create trigger audit_change after insert or update on public.%I '
      || 'for each row execute function private.audit_record_change()',
      t
    );
  end loop;
end;
$$;

-- Caps saved views at 50 per user per organisation.
create function private.before_saved_view_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  if (select count(*) from public.saved_views v where v.org_id = new.org_id and v.user_id = new.user_id) >= 50 then
    raise exception 'ORG_ROW_LIMIT' using errcode = 'P0001', hint = 'Each user can save 50 views.';
  end if;
  return new;
end;
$$;

create trigger before_insert before insert on public.saved_views
for each row execute function private.before_saved_view_insert();
