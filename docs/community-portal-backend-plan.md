# Community Portal Backend — Development Plan

|                 |                                                                                  |
| --------------- | -------------------------------------------------------------------------------- |
| **Status**      | Draft for review — v0.5                                                          |
| **Date**        | 1 November 2026                                                                  |
| **App**         | `apps/community-portal` (SvelteKit 3, moving to `@sveltejs/adapter-cloudflare`)  |
| **Auth model**  | Supabase server-side auth: `@supabase/ssr` in `hooks.server.ts`, cookie sessions |
| **Backend**     | Supabase: Auth, Postgres with Row Level Security, `pg_cron`                      |
| **Region**      | Australia: Supabase `ap-southeast-2` (Sydney)                                    |
| **Email**       | Resend (free plan) as the custom SMTP provider for Supabase Auth                 |
| **Portal host** | Cloudflare Pages project `cii-community-portal`, now with Pages Functions        |

## Decisions already taken for this plan

- **Supabase is the data and identity backend.** Supabase Auth handles sign-in,
  Postgres stores the data, and Row Level Security (RLS) enforces permissions.
  Database triggers write the audit log.
- **The portal runs as a SvelteKit server on Cloudflare** using
  `@sveltejs/adapter-cloudflare`. Static assets are still served from
  Cloudflare's edge; pages and API routes run in Pages Functions.
- **Supabase's server-side auth model is used in full.** `hooks.server.ts`
  creates one `@supabase/ssr` client per request from the request's cookies.
  Sessions live in **`httpOnly` cookies**, and the server verifies the user's
  token on every request. Sign-in, sign-out, the email link and the OAuth
  callback are server routes and form actions.
- **The browser holds no Supabase client and no tokens.** It loads data through
  server `load` functions and changes data through the portal's own JSON
  endpoints. Each server call uses the signed-in user's token, so **RLS still
  decides every read and write**. The server adds validation, session handling
  and clean errors on top, but it is not the security boundary.
- **No Supabase secret key at runtime in version 1.** The Worker only ever acts
  as the signed-in user. When a later feature needs privileged code, it can go
  in a SvelteKit server route or a Supabase Edge Function. §7.7 sets these out
  as equal alternatives, chosen per feature.
- **Data is hosted in Australia.** The Supabase project runs in `ap-southeast-2`
  (Sydney).
- **Email goes through Resend's free plan**, connected to Supabase Auth as
  custom SMTP.
- **The free Supabase project is kept awake** by a scheduled GitHub Actions
  workflow (§9.3).
- **Every account gets its own demo organisation** filled with the existing
  fictional records. Organisations are isolated from each other.
- **Browser-only mode stays.** Without Supabase configuration, or when a visitor
  picks "Try without an account", the portal stores data in `localStorage`
  exactly as it does today. All existing tests keep passing in this mode.

---

## Contents

1. Purpose and scope
2. Prerequisites and accounts
3. Architecture
4. Database schema
5. Permissions and RLS
6. Authentication: hooks, routes and Resend SMTP
7. Portal changes
8. Testing
9. Deployment, keep-alive and scheduled jobs
10. Abuse, privacy and limits
11. Delivery phases
12. Risks
13. Open questions

---

## 1. Purpose and scope

The portal should become a live demo. Visitors can sign in, try every role and
keep their data between visits. Permissions must be enforced by the backend, not
just by hiding buttons.

### In scope for this plan

- Moving the portal from `adapter-static` to `adapter-cloudflare`.
- Supabase server-side auth: email one-time code and email link, optional GitHub
  sign-in, Cloudflare Turnstile, `httpOnly` cookie sessions, a route guard.
- Shared Postgres storage for Members, Programs, Events, Donations, Cases, saved
  views, organisation users and the audit log.
- Role permissions enforced by RLS. The rules are the matrix that `permissions`
  in `src/lib/data.ts` defines today.
- An audit log written by database triggers, which clients cannot alter.
- Per-organisation isolation, invitations and a way for the demo owner to switch
  roles.
- Keep-alive, cleanup of inactive data, CI database tests and deployment of
  migrations.

**Out of scope (later plans):** document uploads (Supabase Storage), individual
attendance, XLSX/PDF exports, realtime collaboration, field-level privacy
controls for roles other than Board Member, server-only admin features that need
the Supabase secret key (§7.7 describes the two ways to add them), and paid-plan
features such as point-in-time recovery.

---

## 2. Prerequisites and accounts

| #   | Item                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Supabase project             | Free plan, region **Sydney (`ap-southeast-2`)**. Name it `cii-community-portal`. **Done:** ref `kykbgwewulzceunbbsfa`, URL `https://kykbgwewulzceunbbsfa.supabase.co`. Record the **publishable key** when the portal needs it. Make sure the project uses **asymmetric JWT signing keys**, so the server can verify tokens locally with `getClaims()` (§6.1). Keep the secret key and database password out of the repo.        |
| P2  | Domain for sending email     | **Done:** `auth.alankeown.id.au`, a subdomain of `alankeown.id.au` (DNS on Cloudflare). Using a subdomain keeps the root domain's existing mail (MX `mx.wcg-mail.com`, Netregistry SPF) and sender reputation separate. Resend sends only to the account owner's own address until a domain is verified, and `pages.dev` cannot be used.                                                                                         |
| P3  | Resend account               | **Done:** domain verified in Resend's **Tokyo** region (`ap-northeast-1`; Resend has no Australian region), click and open tracking off, and Supabase custom SMTP set up and tested. Setup used: verify the P2 domain: SPF, DKIM and the return-path records go into DNS, which is Cloudflare DNS if the domain is there. Add DMARC (`p=none` to start). Create an API key with **sending access only**, limited to that domain. |
| P4  | Cloudflare Turnstile widget  | Managed mode. Allowed hostnames: `cii-community-portal.pages.dev` and `localhost`. The site key goes to the portal; the secret key goes to Supabase Auth.                                                                                                                                                                                                                                                                        |
| P5  | GitHub OAuth app (optional)  | Callback URL `https://kykbgwewulzceunbbsfa.supabase.co/auth/v1/callback`. This sign-in uses no email quota (§10.3).                                                                                                                                                                                                                                                                                                              |
| P6  | Local tooling                | Docker (already on this machine), the Supabase CLI as a root `devDependency` (`supabase`), and `wrangler` pinned to `4.156.0` as a portal `devDependency`, matching the deploy workflow.                                                                                                                                                                                                                                         |
| P7  | GitHub secrets and variables | See §9.1.                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Free-plan facts this plan relies on.** Re-check them at setup, because
providers change them.

| Fact                                                                                                                                                                    | Used in     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Supabase free projects pause after about 7 days without activity.                                                                                                       | §9.3        |
| Supabase free plan: 500 MB database, 50,000 monthly active users, daily backups not included.                                                                           | §10.4       |
| Supabase Auth's built-in email is for testing only and is heavily rate-limited, so custom SMTP is required.                                                             | §6.5        |
| Resend free plan: about 3,000 emails a month, 100 a day, one domain.                                                                                                    | §6.5, §10.3 |
| Cloudflare Workers free plan (which covers Pages Functions): about 100,000 requests a day and 10 ms of CPU per request. Static asset requests are free and don't count. | §10.4       |
| GitHub disables scheduled workflows in **public** repositories after 60 days without repository activity.                                                               | §9.3        |

---

## 3. Architecture

```text
Browser (no Supabase client, no tokens)
  │  HTML from SSR; fetch('/api/…') with JSON; httpOnly sb-* session cookies
  ▼
Cloudflare Pages
  ├── static assets (_app/*, fonts, icons): served from the edge, no Function runs
  └── Pages Function (SvelteKit, adapter-cloudflare)
        hooks.server.ts
          1. supabase   create @supabase/ssr server client from cookies → event.locals.supabase
          2. auth       getClaims() verifies the JWT → event.locals.user (refreshes tokens, rewrites cookies)
          3. guard      redirect to /auth or return 401 for /api; Cache-Control: private, no-store
        /auth/*       form actions: send code, verify code, GitHub, email link, sign-out
        /             +page.server.ts load → workspace for the signed-in user
        /api/*        JSON endpoints → validate with records.ts → locals.supabase (user's JWT)
        /invite/[t]   accept invitation (POST)
        /privacy      prerendered
  │
  ├── Supabase Auth ───── SMTP ──► Resend ──► inbox (code + link)
  │        └── GitHub OAuth (optional)
  └── PostgREST ──► Postgres, Sydney
                     ├── public tables (RLS on every table)
                     ├── public RPCs (security definer, narrow)
                     ├── private schema (helpers, not exposed by the API)
                     ├── audit triggers
                     └── pg_cron (cleanup of inactive data)

GitHub Actions
  ├── Verify (ci.yml): adds a database job (local Supabase, pgTAP, live-mode E2E)
  ├── Deploy portal: `supabase db push`, then build and `wrangler pages deploy`
  └── Supabase keep-alive: scheduled heartbeat RPC
```

**Layers of protection, in order of authority:**

1. **Postgres RLS and constraints** (§5): the security boundary. They hold even
   if someone bypasses the portal and calls Supabase's API directly with their
   own token. That is always possible, because the publishable key is public.
2. **SvelteKit server** (§6, §7): verifies the session, rejects bad input before
   it reaches the database, turns database errors into clear messages, and keeps
   tokens away from JavaScript running in the page.
3. **UI**: hides what the role can't use, following the product spec.

**Why JSON endpoints rather than form actions for data changes:** saves,
archives, status changes and role switches come from dialogs, the detail drawer
and bulk table actions, and not all of them are forms. Endpoints map one-to-one
onto the `PortalBackend` interface (§7.3), which local mode implements too.
Sign-in and sign-out _are_ form actions, so they work without JavaScript.

---

## 4. Database schema

Everything lives in `supabase/` at the repository root (`supabase init`).
Migrations go in `supabase/migrations/`, pgTAP tests in `supabase/tests/`, and
local settings in `supabase/config.toml`.

### 4.1 Conventions

- Tables exposed through the API live in `public`, with RLS enabled in the same
  migration that creates them.
- Helper and `security definer` functions live in a `private` schema that is
  **not** in the API's exposed schemas. Every function sets `search_path = ''`
  and schema-qualifies every name.
- Enum labels match the TypeScript literal unions exactly
  (`'Volunteer Coordinator'`, `'Needs receipt'`), so no mapping table is needed.
  §8.2 checks this at compile time.
- Every record table is keyed by `(org_id, id)`. `id` is the existing display
  code (`M-1001`, `C-2003` and so on), so the `PortalRecord.id: string` contract
  stays the same.
- `updated_by` and `updated_at` are set **by trigger** from `auth.uid()` and
  `now()`. Values sent by the client are overwritten. This replaces the
  hard-coded `'Sarah Mitchell'` in `records.ts`.
- Records are never deleted through the API. Archiving is a status change, as it
  is now. The only deletes are organisation reset and the scheduled cleanup
  jobs.

### 4.2 Enums

```sql
create type public.app_role as enum ('Admin', 'Staff', 'Volunteer Coordinator',
  'Donations Manager', 'Case Worker', 'Board Member');
create type public.app_module as enum ('Dashboard', 'Members', 'Programs', 'Events',
  'Donations', 'Cases', 'Reports', 'Administration');
create type public.member_status   as enum ('Active', 'Pending', 'Inactive', 'Archived');
create type public.program_status  as enum ('Active', 'Pending', 'Inactive', 'Archived');
create type public.event_status    as enum ('Upcoming', 'Completed', 'Cancelled', 'Archived');
create type public.donation_status as enum ('Needs receipt', 'Acknowledged', 'Archived');
create type public.case_status     as enum ('Open', 'In progress', 'Closed', 'Archived');
create type public.case_priority   as enum ('Normal', 'High', 'Urgent');
```

### 4.3 Tenancy and identity

| Table               | Columns                                                                                                                                                                                                                                      | Notes                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `profiles`          | `id uuid pk → auth.users on delete cascade`, `display_name text not null check (length between 1 and 80)`, `created_at`                                                                                                                      | Created by `ensure_workspace()` (§5.4). Users can read profiles of people in their organisations and update only their own. |
| `organisations`     | `id uuid pk default gen_random_uuid()`, `name text not null`, `created_by uuid → auth.users on delete cascade`, `created_at`, `last_active_at timestamptz not null default now()`                                                            | One demo organisation per account. `last_active_at` is updated by write triggers and on sign-in; cleanup uses it (§9.4).    |
| `memberships`       | `org_id → organisations on delete cascade`, `user_id → auth.users on delete cascade`, `role app_role not null`, `is_owner boolean not null default false`, `status text check in ('Active','Inactive')`, `joined_at`; pk `(org_id, user_id)` | Exactly one owner per organisation (partial unique index).                                                                  |
| `invitations`       | `id uuid pk`, `org_id`, `email text not null`, `role app_role`, `token_hash bytea unique`, `invited_by`, `created_at`, `expires_at default now() + interval '7 days'`, `accepted_at`                                                         | Only the token's hash is stored. The raw token appears once, in the invitation link the admin copies (§5.5).                |
| `role_permissions`  | `role app_role`, `module app_module`, `can_write boolean`; pk `(role, module)`                                                                                                                                                               | Seed data, readable by `authenticated`. Not writable through the API.                                                       |
| `private.heartbeat` | `id boolean pk default true check (id)`, `beat_at timestamptz`                                                                                                                                                                               | Single row used by keep-alive (§9.3).                                                                                       |

`role_permissions` is seeded from today's matrix. A row means the role can read
the module. `can_write` is true for every role except Board Member, matching
`canWrite = role !== 'Board Member'`.

### 4.4 Record tables

Shared columns on every record table:

```sql
org_id uuid not null references public.organisations on delete cascade,
id text not null check (id ~ '^M-[0-9A-Za-z-]{1,60}$'), -- prefix per table: M, P, E, D, C
name text not null check (btrim(name) <> '' and length(name) <= 200),
type text not null default '' check (length(type) <= 100),
location text not null default '' check (length(location) <= 100),
date date not null,
notes text check (length(notes) <= 4000),
updated_by uuid references auth.users on delete set null,
updated_at timestamptz not null default now(),
created_at timestamptz not null default now(),
primary key (org_id, id)
```

| Table       | Extra columns and constraints (mirroring `records.ts`)                                                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `programs`  | `status program_status`, `capacity int not null check (capacity >= 0)`, `participants int not null check (participants >= 0)`, `check (participants <= capacity)`                                                     |
| `members`   | `status member_status`, `email text not null default ''` with an email check matching `^[^\s@]+@[^\s@]+\.[^\s@]+$` when non-empty, `phone text`, `tags text`, `program_id text`, FK `(org_id, program_id) → programs` |
| `events`    | `status event_status`, `attendees int not null check (attendees >= 0)`                                                                                                                                                |
| `donations` | `status donation_status`, `amount numeric(12,2) not null check (amount > 0)`                                                                                                                                          |
| `cases`     | `status case_status`, `priority case_priority not null`, `member_id text not null`, FK `(org_id, member_id) → members`                                                                                                |

`programs` is created before `members` because of the foreign key. When the
client omits an `id` on insert, a `before insert` trigger assigns the next
numeric code for that organisation and table (for example `M-1004` after
`M-1003`). The trigger takes a transaction-scoped advisory lock per organisation
and table, so concurrent inserts can't get the same code, and the same lock
makes the row cap exact. Codes may also be sent by the client: seed data uses
`P-101` and `M-1001`, and local mode creates `M-<uuid>`. The check accepts the
table's prefix followed by up to 60 letters, digits or hyphens.

**Optimistic concurrency.** Updates send the `updated_at` they last read, and
the endpoint adds `.eq('updated_at', expected)`. If zero rows come back, the
portal shows "This record was changed by someone else. Reload it to see the
latest version." This is one predicate per update and needs no locking.

**Row caps.** A `before insert` trigger rejects a new row once an organisation
has 1,000 rows in that table (error code `P0001`, message `ORG_ROW_LIMIT`). This
keeps the 500 MB free-plan database safe from one noisy account.

### 4.5 Administration module

In live mode, Administration records are the organisation's **real users**: a
`security definer` function `public.list_org_users(p_org)` that combines
memberships (joined to profiles and `auth.users.email`) with open invitations.
It raises an error unless the caller is an Admin of the organisation. A function
is used rather than a view because invitations have no RLS policies at all
(their token hashes stay unreadable through the API). Rows have the same fields
as `UserRecord`: `id` is `U-` (members) or `I-` (invitations) plus a short form
of the ID, `role` becomes `type`, and `status` is Active, Pending or Inactive.

The view is read-only. Changes go through RPCs (§5.5):

- creating a user record **creates an invitation**;
- editing the role calls `set_member_role`;
- archiving calls `deactivate_member`.

### 4.6 Saved views and audit log

| Table         | Columns                                                                                                                                                | Access                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `saved_views` | `id uuid pk`, `org_id`, `user_id`, `name`, `module app_module`, `query`, `status`, `sort` (check `name/status/date`)                                   | Owner only: `user_id = (select auth.uid())`, and only if still a member of the organisation. |
| `audit_log`   | `id bigint identity pk`, `org_id`, `actor_id`, `actor_name`, `action text`, `table_name`, `record_id`, `changes jsonb`, `at timestamptz default now()` | Admins of the organisation can select. **No** insert, update or delete policies.             |

Audit rows are written by an `after insert or update` trigger function,
`private.audit_record_change()`, attached to every record table, `memberships`
and `invitations`. It runs as `security definer` so it can insert even though
clients cannot. `action` is one of `Created`, `Updated`, `Archived` (status
changed to Archived), `Role changed`, `Invited`, `Joined`, `Reset`. `changes`
holds only the columns that changed, and leaves out `notes` content (it records
only that notes changed), so personal text isn't copied into the log. A daily
job keeps the newest 500 entries per organisation.

Theme preference and form drafts stay in `localStorage`. They are per-device
conveniences, not shared data.

---

## 5. Permissions and RLS

### 5.1 Helper functions

```sql
create function private.has_access(p_org uuid, p_module public.app_module, p_write boolean)
returns boolean
language sql stable security definer set search_path = ''
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

create function private.is_member(p_org uuid) returns boolean ...   -- any active role
create function private.is_admin(p_org uuid) returns boolean ...    -- active role = 'Admin'
create function private.is_owner(p_org uuid) returns boolean ...
```

Grant `usage` on schema `private` and `execute` on these functions to
`authenticated` only. Revoke them from `public` and `anon`.

### 5.2 Record table policies

The same three policies on each of `members`, `programs`, `events`, `donations`
and `cases`, shown here for `members`:

```sql
alter table public.members enable row level security;

create policy members_read on public.members for select to authenticated
  using (private.has_access(org_id, 'Members', false));
create policy members_insert on public.members for insert to authenticated
  with check (private.has_access(org_id, 'Members', true));
create policy members_update on public.members for update to authenticated
  using (private.has_access(org_id, 'Members', true))
  with check (private.has_access(org_id, 'Members', true));
-- No delete policy.
```

Add indexes on `(org_id)` for every table. `role_permissions` is tiny, so the
helper's lookup is cheap.

Policies alone would let a user move a row to another organisation they can
write to. A `before update` trigger stops `org_id` and `id` from being changed.

### 5.3 What each role can do

Taken directly from `permissions` in `data.ts`:

| Role                  | Reads                            | Writes      | Special                                            |
| --------------------- | -------------------------------- | ----------- | -------------------------------------------------- |
| Admin                 | All modules                      | All modules | Audit log, users, invitations                      |
| Staff                 | Everything except Administration | Same        |                                                    |
| Volunteer Coordinator | Members, Programs, Events        | Same        |                                                    |
| Donations Manager     | Members, Donations               | Same        |                                                    |
| Case Worker           | Members, Programs, Cases         | Same        |                                                    |
| Board Member          | No record tables                 | Nothing     | De-identified reports through `report_rows` (§5.6) |

Dashboard and Reports have no tables of their own. They are computed from
whatever the user can read.

**Cross-module references.** A Donations Manager can read members but not
programs, so `programId` can't be resolved for them. The UI must show the code
with "Restricted" rather than failing. Add a browser test for this.

### 5.4 Workspace bootstrap

Use the following function (`security definer`):

```sql
public.ensure_workspace(display_name text default null)
  returns table (org_id uuid, created boolean)
```

The page's server `load` calls it on every visit by a signed-in user. It is
idempotent:

1. Insert the profile if missing (default display name: the part of the email
   before the `@`).
2. If the user has no active membership, create an organisation named
   "`<display name>`'s demo organisation" and add an owner membership with role
   `Admin`. Return `created = true`.
3. Update `last_active_at` and return the ID of the user's most recently active
   organisation, or of the organisation chosen with the switcher (§5.5).

This is a callable RPC rather than a trigger on `auth.users`, so a bug in it can
never block sign-up. It also re-creates a workspace after cleanup (§9.4).

**Seeding.** Use `public.seed_demo_workspace(p_org uuid, p_payload jsonb)`,
which is owner-only. It runs in a single transaction, deletes the organisation's
record rows, inserts the payload, resets the code counters and writes a `Reset`
audit row. When `ensure_workspace` returns `created = true`, the server `load`
calls it with `initialRecords` from `data.ts`, so the fictional data has one
source and the database constraints still validate it. The function rejects
payloads over 200 rows per table. The same RPC provides a **Reset demo data**
action in Administration.

### 5.5 Demo role switching and invitations

The live demo's main purpose is trying different roles, so the existing
**Preview role** control becomes a real role change:

- `set_my_demo_role(p_org uuid, p_role app_role)`: allowed only when
  `is_owner(p_org)`. It changes the caller's own membership role. Because
  `is_owner` doesn't depend on the role, the owner can always switch back to
  Admin. Each change is audited.
- After the call, the portal reloads its data (`invalidateAll()`), so what the
  user sees is exactly what RLS now returns.
- Non-owners don't see the control.

Invitations let a second real account test a role from the inside:

- `create_invitation(p_org, p_email, p_role) returns text` (Admin only):
  generates a 32-byte random token, stores its SHA-256 hash and returns the raw
  token. The portal shows a copyable link,
  `https://cii-community-portal.pages.dev/invite/<token>`. **No email is sent**,
  which saves Resend quota and needs no secret key.
- The `/invite/[token]` route: the guard sends signed-out visitors to
  `/auth?next=/invite/<token>`. Once signed in, the page shows the organisation
  and role with an **Accept** button. Accepting is a POST form action that calls
  `accept_invitation(p_token text)`, so link previewers can't accept on
  someone's behalf.
- `accept_invitation` requires the signed-in user's email to match the
  invitation (case-insensitive). The invitation must not be expired or accepted.
  It creates the membership and marks the invitation accepted.
- `set_member_role(p_org, p_user, p_role)` and
  `deactivate_member(p_org, p_user)` (Admin only): these cannot target the
  owner.
- If a user belongs to more than one organisation, a switcher appears in the
  header. The selected organisation is stored in an `httpOnly` cookie,
  `portal-org`, which the server reads and checks against the user's
  memberships.

### 5.6 Board Member reports

At the moment Board Members can download every module's rows as CSV, including
emails, phone numbers and case notes. In live mode,
`public.report_rows(p_org, p_module, p_from date, p_to date) returns jsonb`
(`security definer`) does the following:

- If the caller can read `p_module`, it returns full rows, like a normal select.
- Otherwise, if the caller has Reports access, it returns **de-identified**
  rows: `id`, `status`, `type`, `location`, `date` and the module's numeric
  fields. No `name`, `email`, `phone`, `notes`, `tags` or linked IDs.
- Otherwise, it raises an exception.

`Reports.svelte` requests these rows through `GET /api/reports/[module]` for
modules outside `allowed`. CSV export uses the same rows.

### 5.7 Account deletion

`public.delete_my_account()` (`security definer`): deletes the caller's row in
`auth.users`. That cascades to the organisations they own and everything in
them, plus their memberships and profile. The portal calls it from
`DELETE /api/account` after a confirmation step, then clears the session
cookies. It's needed for the privacy notice (§10.2). Because it runs inside the
database as the caller, it needs no secret key in the Worker.

---

## 6. Authentication: hooks, routes and Resend SMTP

### 6.1 `hooks.server.ts`

```ts
// src/hooks.server.ts
import { createServerClient } from '@supabase/ssr';
import { json, redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import type { Database } from '$lib/backend/database.types.ts';

const supabase: Handle = async ({ event, resolve }) => {
  const url = env.PUBLIC_SUPABASE_URL;
  const key = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  event.locals.supabase = null;
  event.locals.user = null;
  if (url && key) {
    const client = createServerClient<Database>(url, key, {
      cookies: {
        getAll: () => event.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies)
            event.cookies.set(name, value, {
              ...options,
              path: '/',
              httpOnly: true,
              secure: !dev,
              sameSite: 'lax'
            });
        }
      }
    });
    event.locals.supabase = client;
    // getClaims() verifies the JWT signature against the project's JWKS and refreshes
    // expired sessions. Never trust getSession() alone on the server.
    const { data, error } = await client.auth.getClaims();
    if (!error && data)
      event.locals.user = {
        id: data.claims.sub,
        email: String(data.claims.email ?? '')
      };
  }
  return resolve(event, {
    filterSerializedResponseHeaders: (name) =>
      name === 'content-range' || name === 'x-supabase-api-version'
  });
};

const publicPaths = ['/auth', '/privacy'];

const guard: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url;
  const live = event.locals.supabase !== null;
  const localMode = event.cookies.get('portal-mode') === 'local';
  const isPublic = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  if (live && !event.locals.user && !isPublic && !localMode) {
    if (pathname.startsWith('/api/'))
      return json(
        { code: 'session', message: 'Sign in again to continue.' },
        { status: 401 }
      );
    redirect(303, '/auth?next=' + encodeURIComponent(pathname + search));
  }
  if (event.locals.user)
    event.setHeaders({ 'cache-control': 'private, no-store' });
  return resolve(event);
};

export const handle = sequence(supabase, guard);
```

Notes:

- **Cookie options** are deliberately stricter than the library defaults.
  `httpOnly` works here because nothing in the browser reads the session. If a
  later feature needs a browser Supabase client (realtime, for example), it has
  to give up `httpOnly`. Make that trade-off explicitly; don't slip it in.
- **`getClaims()`** checks the token locally with the project's public signing
  key (cached), so a normal request costs no extra call to Supabase Auth. With
  older symmetric keys it falls back to a network call, which is why P1 requires
  asymmetric keys. Follow the `@supabase/ssr` release notes for the current
  `setAll` signature. Recent versions also pass cache headers, which must be
  applied to the response.
- **`Cache-Control: private, no-store`** on every signed-in response stops
  Cloudflare or the browser caching one user's page for another.
- **Local mode:** "Try without an account" sets `portal-mode=local` (not a
  session, just a preference). The guard lets the visitor through and the page
  uses the `localStorage` backend. Signing in clears that cookie.
- **Types:** declare `App.Locals` in `src/app.d.ts`:

  ```ts
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/backend/database.types.ts';

  declare global {
    namespace App {
      interface Locals {
        supabase: SupabaseClient<Database> | null;
        user: { id: string; email: string } | null;
      }
    }
  }
  export {};
  ```

### 6.2 Auth routes

All of these are server routes or form actions under `src/routes/auth/`. They
use `@cii/svelte` `TextField`, `Button` and `Alert`, with the same labelling,
error summary and focus handling as the record form. With `use:enhance` they
behave like the rest of the app; without JavaScript they still work, apart from
Turnstile.

| Route              | Kind                            | Behaviour                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/auth` `?/email`  | Form action                     | Reads `email` and `cf-turnstile-response`. Calls `signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken } })`. Stores the cleaned-up `next` in a 15-minute `httpOnly` cookie, `auth-next`. Returns `{ sent: true, email }`, so the page shows the code field. |
| `/auth` `?/verify` | Form action                     | `verifyOtp({ email, token, type: 'email' })`. On success, clears `portal-mode` and `auth-next` and redirects (303) to `next`.                                                                                                                                                  |
| `/auth` `?/github` | Form action                     | `signInWithOAuth({ provider: 'github', options: { redirectTo: origin + '/auth/callback' } })`, then redirects (303) to `data.url`. The PKCE verifier is stored in a server cookie.                                                                                             |
| `/auth` `?/local`  | Form action                     | Sets `portal-mode=local` and redirects to `/`.                                                                                                                                                                                                                                 |
| `/auth/callback`   | `+server.ts` GET                | `exchangeCodeForSession(code)`, then redirects to `next`. On failure, redirects to `/auth?error=callback`.                                                                                                                                                                     |
| `/auth/confirm`    | `+page.server.ts` load + action | **GET verifies nothing.** It shows "Continue signing in" with a button. The POST action calls `verifyOtp({ token_hash, type })`. This stops email security scanners, which open links automatically, from using up the one-time link.                                          |
| `/auth/signout`    | Form action (POST only)         | `signOut()`, clears `portal-org`, redirects to `/auth`. The header's sign-out button is a small form.                                                                                                                                                                          |

**Safe redirects.** `next` is accepted only if it is a path that starts with a
single `/` (not `//` and no scheme). Anything else becomes `/`. Put this in
`src/lib/server/redirect.ts` and unit-test it.

**Error messages** keep to plain language and never reveal whether an email
already has an account.

### 6.3 Sign-in methods

| Method                                             | Status      | Notes                                                                                                                                                            |
| -------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email one-time code, plus a link in the same email | **Primary** | The code works on any device. The link (`/auth/confirm`, using `token_hash`) also works across devices and browsers, because it doesn't depend on a PKCE cookie. |
| GitHub OAuth                                       | Optional    | Uses no email quota.                                                                                                                                             |
| Password                                           | Not offered | Passwords bring reset flows and support work, so leave them out.                                                                                                 |
| Anonymous sign-in                                  | Not offered | Local mode already covers trying the portal without an account, at no backend cost.                                                                              |

### 6.4 Supabase Auth settings (production)

| Setting                          | Value                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site URL                         | `https://cii-community-portal.pages.dev`                                                                                                                                    |
| Redirect URLs                    | `https://cii-community-portal.pages.dev/auth/callback`, `http://localhost:5187/auth/callback`, `http://localhost:4187/auth/callback`, `http://localhost:4189/auth/callback` |
| JWT signing keys                 | Asymmetric (ES256 or RS256)                                                                                                                                                 |
| Email provider                   | Enabled; confirm email on (OTP sign-in confirms the address)                                                                                                                |
| OTP expiry / length              | 600 seconds / 6 digits                                                                                                                                                      |
| Captcha                          | Turnstile, secret key from P4                                                                                                                                               |
| Access-token expiry              | Default (3600 s) with refresh-token rotation on                                                                                                                             |
| Email rate limit (custom SMTP)   | 30 per hour (see §10.3)                                                                                                                                                     |
| Sign-ins per IP / OTP resend gap | Defaults to start with, but see §10.4: requests now come from Cloudflare's IP addresses                                                                                     |

Record every value in `supabase/config.toml` too, with secrets written as
`env(...)` references. That keeps local and production in step and allows
`supabase config push` later. Local settings: captcha off, SMTP pointed at the
bundled Mailpit, `site_url = "http://localhost:5187"`.

### 6.5 Resend as custom SMTP

In **Supabase → Authentication → Emails → SMTP settings**:

| Field        | Value                                                           |
| ------------ | --------------------------------------------------------------- |
| Host         | `smtp.resend.com`                                               |
| Port         | `465` (implicit TLS; use `587` with STARTTLS if 465 is blocked) |
| Username     | `resend`                                                        |
| Password     | The Resend API key from P3 (sending access, one domain)         |
| Sender email | `no-reply@auth.alankeown.id.au`                                 |
| Sender name  | `Common Ground demo`                                            |

Steps:

1. Verify the domain in Resend (P3). Wait until SPF and DKIM both show
   **Verified** before you turn on SMTP in Supabase.
2. Enter the settings above and save. Send a test sign-in to an address you own,
   then check the Resend **Emails** log shows it as `delivered`.
3. Replace the **Magic Link** and **Confirm signup** templates. Both must
   contain the code and the server-side confirmation link, in plain language:

   ```html
   <h2>Your Common Ground demo sign-in code</h2>
   <p>Enter this code in the portal: <strong>{{ .Token }}</strong></p>
   <p>
     Or
     <a
       href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
       >continue signing in</a
     >.
   </p>
   <p>
     The code expires in 10 minutes. If you didn't ask for it, ignore this
     email.
   </p>
   ```

   Keep copies in `supabase/templates/` and reference them from `config.toml`,
   so templates are reviewed like code.

4. Turn off Resend's **click tracking** for the domain. Rewritten links break
   the confirmation link, and tracking adds no value here.
5. **Region and privacy:** the domain is in Resend's Tokyo region, because
   Resend has no Australian region. Recipient addresses are therefore processed
   outside Australia. If Australian processing becomes a requirement, Amazon SES
   in Sydney or Melbourne can replace Resend as Supabase's SMTP provider. Name
   Resend in the privacy notice as an overseas recipient (§10.2). The email
   contains only the code, the link and the address.

---

## 7. Portal changes

### 7.1 Adapter and Cloudflare configuration

- Replace `@sveltejs/adapter-static` with `@sveltejs/adapter-cloudflare`
  (currently 8.x) in `apps/community-portal/vite.config.ts`. The adapter writes
  `.svelte-kit/cloudflare`, including `_routes.json`, so requests for static
  assets don't run the Function.
- Remove `export const prerender = true` from `src/routes/+layout.ts`; the
  portal page now depends on the session. Set `export const prerender = true` in
  `src/routes/privacy/+page.ts` only.
- Add `apps/community-portal/wrangler.jsonc`:

  ```jsonc
  {
    "name": "cii-community-portal",
    "pages_build_output_dir": ".svelte-kit/cloudflare",
    "compatibility_date": "2026-10-01",
    // Check at build time whether any dependency still needs this; drop it if not.
    "compatibility_flags": ["nodejs_compat"],
    "env": {
      "production": {
        "vars": {
          "PUBLIC_SUPABASE_URL": "https://kykbgwewulzceunbbsfa.supabase.co",
          "PUBLIC_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_…",
          "PUBLIC_TURNSTILE_SITE_KEY": "<site key>"
        }
      }
    }
  }
  ```

  These three values are public by design, so committing them is safe. Because
  they sit only under `env.production`, `wrangler pages dev` and preview builds
  have **no** Supabase settings and run in local mode unless you pass them
  explicitly. Once this file exists, it is the source of truth for the Pages
  project's settings; the dashboard shows them as read-only.

- **Environment variables** are read with `$env/dynamic/public` at runtime, not
  baked in at build time. A build with no variables is therefore valid and runs
  in local mode. For live-mode development, put local values in
  `apps/community-portal/.env` (for `vite dev`) and `.dev.vars` (for
  `wrangler pages dev`). Both are git-ignored; add `.dev.vars` to `.gitignore`.
- Replace the portal's `preview` script with
  `wrangler pages dev .svelte-kit/cloudflare --port 4187 --ip 0.0.0.0`. The
  shared `scripts/preview.ts` (sirv) stays for the docs site. Update the
  Playwright `webServer` entry so its readiness check matches Wrangler's "Ready
  on" output.

### 7.2 Server files

| File                                        | Purpose                                                                                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/hooks.server.ts`                       | §6.1                                                                                                                                                                                                                                             |
| `src/app.d.ts`                              | `App.Locals`, plus `App.Platform` from `@sveltejs/adapter-cloudflare` if bindings are added later                                                                                                                                                |
| `src/routes/auth/**`                        | §6.2                                                                                                                                                                                                                                             |
| `src/routes/+layout.server.ts`              | Returns `{ live, user: { email, displayName } }` for the header. No tokens and no cookies are sent to the page.                                                                                                                                  |
| `src/routes/+page.server.ts`                | `load`: if live and signed in, `ensure_workspace` → seed if created → load records, saved views, audit (Admins), `role_permissions` and session info in parallel. Returns `{ mode: 'live', workspace, session }`. Otherwise `{ mode: 'local' }`. |
| `src/routes/api/**/+server.ts`              | JSON endpoints (§7.4)                                                                                                                                                                                                                            |
| `src/routes/invite/[token]/+page.server.ts` | §5.5                                                                                                                                                                                                                                             |
| `src/routes/privacy/+page.svelte`           | Prerendered notice (§10.2)                                                                                                                                                                                                                       |
| `src/lib/server/api.ts`                     | `requireUser(locals)` (401), `requireJson(request)` (415), `fail(code, message, status, fieldErrors?)`, and the mapping of Postgres errors to `BackendError`                                                                                     |
| `src/lib/server/records.ts`                 | Table names, row ↔ record mapping, queries. Every row read passes through `decodeRecord`, so a mismatched schema fails loudly.                                                                                                                   |
| `src/lib/server/redirect.ts`                | Safe `next` handling (§6.2)                                                                                                                                                                                                                      |
| `src/lib/backend/database.types.ts`         | **Generated** by `supabase gen types typescript --local`. Checked in, and kept up to date by a CI check.                                                                                                                                         |

SvelteKit refuses to bundle anything under `$lib/server` into browser code,
which enforces the "no Supabase in the browser" decision.

### 7.3 Backend interface in the browser

The pure helpers in `records.ts` (`validateForm`, `buildRecord`, `decodeRecord`,
`changeRecord`) run in the browser for instant feedback, **and again on the
server** in each endpoint before anything reaches the database. The database's
constraints are the final check.

```ts
// src/lib/backend/types.ts
export interface SessionInfo {
  displayName: string;
  orgId: string;
  orgs: { id: string; name: string; role: Role; isOwner: boolean }[];
  role: Role;
  isOwner: boolean;
}

export interface Workspace {
  records: PortalRecords;
  savedViews: SavedView[];
  audit: AuditEntry[]; // empty unless the role may read it
  permissions: Record<Role, Module[]>;
}

export interface PortalBackend {
  readonly mode: 'local' | 'live';
  createRecord(module: RecordModule, form: RecordForm): Promise<PortalRecord>;
  updateRecord(
    record: PortalRecord,
    expectedUpdatedAt?: string
  ): Promise<PortalRecord>;
  archiveRecords(module: RecordModule, ids: string[]): Promise<PortalRecord[]>;
  saveView(view: SavedView): Promise<SavedView>;
  reportRows(
    module: RecordModule,
    from: string,
    to: string
  ): Promise<PortalRecord[]>;
  resetDemoData(): Promise<void>;
}

export interface BackendError {
  code: 'conflict' | 'forbidden' | 'limit' | 'invalid' | 'offline' | 'session';
  message: string;
  fieldErrors?: FormErrors;
}
```

| File                       | Purpose                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/backend/local.ts` | Wraps today's `persistence.ts` behaviour (`loadWorkspace`, `saveWorkspace`, recovery flow). Same storage keys, so no existing data or tests are affected.                              |
| `src/lib/backend/live.ts`  | A thin `fetch` client for `/api/*`. It sends `Content-Type: application/json`, parses `BackendError`, and on a 401 sends the user to `/auth?next=…`. It imports nothing from Supabase. |

In live mode the initial `Workspace` comes from the server `load`, so the page
renders with data on first paint. Role switches, organisation switches and
resets call `invalidateAll()` to load it again.

### 7.4 API endpoints

| Method and path                      | Action                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `POST /api/records/[module]`         | Validate with `validateForm` and `buildRecord`, then insert                |
| `PATCH /api/records/[module]/[id]`   | Validate, then update with `updated_at` matching the expected value (§4.4) |
| `POST /api/records/[module]/archive` | `{ ids }`; set status Archived for the IDs the caller can write            |
| `POST /api/views`                    | Save a view                                                                |
| `GET /api/reports/[module]?from&to`  | `report_rows` (§5.6)                                                       |
| `POST /api/workspace/reset`          | `seed_demo_workspace` with `initialRecords`                                |
| `POST /api/workspace/org`            | Switch organisation (sets `portal-org` after checking membership)          |
| `POST /api/role`                     | `set_my_demo_role`                                                         |
| `POST /api/invitations`              | `create_invitation`; returns the link                                      |
| `PATCH /api/members/[userId]`        | `set_member_role` or `deactivate_member`                                   |
| `DELETE /api/account`                | `delete_my_account`, then sign out                                         |

Every endpoint uses `locals.supabase`, which carries the signed-in user's token,
so RLS applies exactly as it would to a direct call. Every endpoint accepts only
`application/json` and returns 415 for anything else. Cross-site pages can't
send JSON with cookies without a CORS preflight, which the portal never
approves. Combined with `SameSite=Lax` cookies and SvelteKit's origin check on
form posts, this covers cross-site request forgery.

### 7.5 Page changes

`+page.svelte` is 801 lines and currently saves the whole snapshot automatically
in an `$effect`. Changes:

- Pick the backend from `data.mode`. Replace the auto-save effect with explicit
  calls such as `await backend.createRecord(...)`. Use the record the backend
  returns (which has the server's `updatedAt` and `updatedBy`) with `putRecord`.
  In local mode, the local backend saves the snapshot after each operation, so
  behaviour stays the same.
- Saving shows a pending state on the dialog's submit button. Errors go to the
  existing toast or alert, with `fieldErrors` mapped onto the form's fields.
- `role` and `permissions` come from `data.session` and `data.workspace` in live
  mode, so the UI uses the same matrix as RLS. **Preview role** calls
  `POST /api/role` for owners and is hidden for everyone else. In local mode it
  stays a client-side preview.
- The header shows the signed-in user's display name instead of "Sarah
  Mitchell". `records.ts` takes the actor name as a parameter instead of
  hard-coding it; the local backend passes "Sarah Mitchell".
- The header gains a sign-out form and, if needed, the organisation switcher.
- Administration gains: **Invite user** (shows a copyable link), **Reset demo
  data**, **Delete my account** and a short "Demo data only" notice.
- Consider moving workspace state into `src/lib/workspace.svelte.ts` while
  making these changes, so the page stops growing. This is optional and outside
  the backend's critical path.

### 7.6 Entry flow

```text
no Supabase env ───────────────────────────────────► local mode (today's behaviour)
Supabase env, no session, no portal-mode cookie ───► 303 /auth?next=/
  /auth: [Email code] [GitHub] [Try without an account → portal-mode=local → /]
signed in ──► GET / ──► +page.server.ts: ensure_workspace → (first time) seed → load ──► SSR portal
/invite/<token> ──► (sign in if needed) ──► Accept (POST) ──► accept_invitation ──► /
```

### 7.7 Privileged operations: two alternatives

Version 1 has no privileged code. Everything runs as the signed-in user, and the
few cross-user rules live in narrow `security definer` database functions. Later
features may need the Supabase **secret key**, which bypasses RLS. Examples:
sending invitation emails with `auth.admin.inviteUserByEmail`, admin-only user
management, accepting webhooks from outside services, or creating signed Storage
URLs on someone else's behalf.

There are two sound places for that code. **Neither is mandated.** Choose per
feature, record the choice in that feature's plan, and don't add the secret key
anywhere until a feature needs it.

|                        | **A. SvelteKit server route (in the Cloudflare Worker)**                                                                                                                       | **B. Supabase Edge Function**                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where the code goes    | `src/lib/server/supabase-admin.ts`, called from an existing `/api/*` endpoint after `requireUser` and a role check                                                             | `supabase/functions/<name>/index.ts` (TypeScript on Deno), called by the portal server with `locals.supabase.functions.invoke(...)`, which forwards the user's token                                                                                                                                                                  |
| Where the secret lives | A Cloudflare Pages secret (`wrangler pages secret put SUPABASE_SECRET_KEY`), read with `$env/dynamic/private`; `.dev.vars` locally                                             | Inside Supabase only. Functions receive it as an environment variable, so it never reaches Cloudflare or GitHub                                                                                                                                                                                                                       |
| Strengths              | One codebase, one language setup, one deploy. Reuses `records.ts`, `$lib/server` helpers and the Playwright suite directly. No new runtime.                                    | The secret stays in one place. Runs next to the database in Sydney. Can also be called by `pg_cron`, database webhooks or other apps (such as the docs site), not just the portal.                                                                                                                                                    |
| Costs                  | A second place holds a key that bypasses RLS, so a mistake in any Worker route has a larger blast radius. Uses Workers CPU budget (§10.4). Tied to the portal's release cycle. | A second runtime (Deno) and import style. `$lib` can't be imported, so shared code must be plain TypeScript modules without SvelteKit aliases. Local testing needs `supabase functions serve`. Free-plan invocation quota and cold starts (check current limits). Deployed with `supabase functions deploy` as an extra step in §9.2. |
| Choose it when         | The operation belongs to a single portal page or action and has no other callers.                                                                                              | The operation must run without a browser request (scheduled jobs, webhooks), is shared by more than one app, or keeping the secret key only in Supabase matters most.                                                                                                                                                                 |

Rules for either option:

- Check the caller's identity (`getClaims()` in the Worker; JWT verification
  left on for the function) and their role **before** creating or using the
  admin client.
- Keep the admin client in one module that nothing else imports casually. For
  option A, `$lib/server` already stops it reaching browser code. For option B,
  it never leaves the function.
- Write an audit row for every privileged action, using the same `audit_log`
  table.
- Test both the allowed path and the refused paths: not signed in, wrong role,
  wrong organisation.
- Both are TypeScript, in line with AGENTS.md. Edge Functions are not SvelteKit
  code, but they still follow the repository's `.ts`-only rule.

---

## 8. Testing

### 8.1 Database tests (pgTAP, `supabase/tests/*.sql`)

Run with `supabase test db` against a freshly reset local database. Cover at
least:

- **Isolation:** user A cannot select, insert or update any row in B's
  organisation through any table, view or RPC. This includes forged `org_id`
  values on insert and update.
- **Matrix:** for every role × module, select, insert and update succeed or fail
  exactly as `role_permissions` says. Drive this from the table itself, so the
  matrix and tests can't drift apart.
- **Board Member:** cannot select from any record table. `report_rows` returns
  no PII keys.
- **Audit:** every insert, update and archive writes one row. Clients cannot
  insert, update or delete audit rows. `notes` contents never appear in
  `changes`.
- **Constraints:** each `validateForm` rule has a matching rejected insert
  (empty name, bad date, bad email, negative counts, participants > capacity,
  amount ≤ 0, unknown enum value).
- **RPCs:** `ensure_workspace` is idempotent; only owners can call
  `seed_demo_workspace` and `set_my_demo_role`; invitations reject the wrong
  email, expired, reused and malformed tokens; `set_member_role` cannot demote
  the owner; row caps and payload caps trigger correctly.
- **Grants:** `anon` can execute only `keepalive()`. Nothing in `private` is
  reachable through the API.

### 8.2 TypeScript checks

- **Compile-time parity:** a type-level test in `tests/unit/` asserts that the
  generated enum types equal the model's unions. Examples:
  `Database['public']['Enums']['app_role']` equals `Role`; `member_status`
  equals `(typeof statuses)['Members'][number]`. Any drift fails `svelte-check`.
- **Unit tests** (`node --test`, no database): row ↔ record mapping, Postgres
  error mapping, safe `next` handling, and the local backend (moving the
  existing `persistence.test.ts` cases across). Keep these modules free of
  `$env` and `$app` imports so plain Node can load them.
- **Integration test** (`tests/integration/permissions.test.ts`, local
  Supabase): `role_permissions` read through the API deep-equals `permissions`
  in `data.ts`.

### 8.3 Browser and HTTP tests

- The existing Playwright `portal` project runs unchanged against
  `wrangler pages dev` with **no** Supabase variables (local mode). This also
  proves the Cloudflare build works.
- A new `portal-live` project starts `wrangler pages dev` on port 4189 with
  `--binding` values for the local Supabase URL, publishable key and Turnstile's
  always-pass test site key. Its helper reads the sign-in code and the
  confirmation link from **Mailpit's API** (`http://127.0.0.1:54324`).
  - **Auth:** signed-out `/` redirects to `/auth`; sign in by code; sign in by
    email link (GET shows the Continue page and doesn't sign in, the POST signs
    in); `next` is honoured, and rejected when it points off-site; sign-out
    clears the session; the session cookies are `httpOnly` (check with
    `context.cookies()`); signed-in responses have
    `Cache-Control: private, no-store`; no Supabase token appears in page HTML
    or JavaScript-readable storage.
  - **Data:** first-run seeding; create, edit and archive with values persisted
    after reload; a stale update is rejected as a conflict; owner role switching
    hides modules; invitation accepted by a second browser context; Board Member
    reports are de-identified; Reset demo data; Delete my account.
  - **API** (Playwright `request` context): `/api/*` returns 401 without a
    session and 415 for non-JSON bodies; a form post from another origin is
    rejected; a role without write access gets 403 from the endpoint, **and** a
    direct call to Supabase's REST API with that user's token is refused by RLS.
- Add the sign-in, confirm and invitation pages to the accessibility suite:
  labels, error summary focus, a code input announced as a one-time code
  (`autocomplete="one-time-code"`).

### 8.4 CI (`ci.yml`)

Add a `database` job alongside `verify`:

```yaml
database:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v7.0.1
    - uses: actions/setup-node@v7.1.0
      with: { node-version: 24, cache: npm }
    - run: npm ci
    - run:
        npx supabase start -x
        studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor
    - run: npx supabase db reset
    - run: npx supabase test db
    - run: npx supabase db lint --level warning
    - name: Generated types are current
      run: |
        npx supabase gen types typescript --local > apps/community-portal/src/lib/backend/database.types.ts
        git diff --exit-code apps/community-portal/src/lib/backend/database.types.ts
    - run: npx playwright install --with-deps chromium
    - run:
        npm run build:packages && npm run build --workspace
        @cii/community-portal
    - run: npm run test:portal-live
```

Pin action versions to match the existing workflows. The deploy gate already
requires the whole Verify workflow to succeed, so the new job is gated
automatically.

---

## 9. Deployment, keep-alive and scheduled jobs

### 9.1 Secrets and variables

| Name                              | Kind     | Used by                             |
| --------------------------------- | -------- | ----------------------------------- |
| `SUPABASE_ACCESS_TOKEN`           | Secret   | Deploy (`supabase link`, `db push`) |
| `SUPABASE_DB_PASSWORD`            | Secret   | Deploy                              |
| `SUPABASE_PROJECT_REF`            | Variable | Deploy                              |
| `PUBLIC_SUPABASE_URL`             | Variable | Keep-alive                          |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Variable | Keep-alive                          |

The portal's runtime values live in `wrangler.jsonc` (§7.1). The Resend API key,
Turnstile secret and GitHub OAuth secret are entered **only in the Supabase
dashboard**. The Cloudflare Pages project has no secrets at all in version 1. If
a later feature takes option A in §7.7, `SUPABASE_SECRET_KEY` becomes its only
secret. Option B adds none to Cloudflare.

Put the two deploy secrets in a GitHub **environment** called `production`,
restricted to `main`, so only the deploy workflow can read them.

### 9.2 Deploy workflow changes (`deploy-portal.yml`)

Keep the existing verification gate and exact-SHA checkout. After `npm ci`, run
the migrations **before** building and deploying the portal:

```yaml
- run: npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
  env:
    SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
    SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
    SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}
- run: npx supabase db push
  env:
    SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
    SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
- run: npm run build:packages
- run: npm run build --workspace @cii/community-portal
- uses: cloudflare/wrangler-action@v4.1.3
  with:
    wranglerVersion: 4.156.0
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    gitHubToken: ${{ secrets.GITHUB_TOKEN }}
    workingDirectory: apps/community-portal
    command:
      pages deploy .svelte-kit/cloudflare --project-name=cii-community-portal
      --branch=main
```

Running Wrangler from `apps/community-portal` makes it pick up `wrangler.jsonc`,
including the production variables. Check that the Cloudflare API token can edit
Pages project settings as well as deploy.

Rules:

- Migrations run before the new portal is deployed, so each migration must work
  with the **currently deployed** portal: add first, remove in a later release.
- Never edit a migration that has already been applied. Add a new one.
- If `db push` fails, the job stops before deploying the portal. Nothing goes
  half-deployed.
- **Rollback:** Cloudflare Pages can roll back to the previous deployment in one
  click. Database changes can't be rolled back that way, which is one more
  reason for add-first migrations.
- The free plan has no point-in-time recovery. Before any destructive migration,
  take a manual `supabase db dump` and keep it as a workflow artifact for 7
  days. Note that this is a demo with disposable data (§10.1).

### 9.3 Keep-alive

**Purpose:** stop Supabase pausing the free project after about 7 days without
activity. **How:** a scheduled GitHub Actions workflow calls an RPC that makes a
real database write. It calls Supabase directly rather than through the portal,
so a failure points clearly at the database.

Migration:

```sql
create table private.heartbeat (
  id boolean primary key default true check (id),
  beat_at timestamptz not null
);

create function public.keepalive() returns timestamptz
language sql volatile security definer set search_path = ''
as $$
  insert into private.heartbeat (id, beat_at) values (true, now())
  on conflict (id) do update set beat_at = excluded.beat_at
  returning beat_at;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon;
```

It touches one fixed row and accepts no input, so exposing it to `anon` reveals
nothing and lets no caller grow the database.

Workflow `.github/workflows/supabase-keepalive.yml`:

```yaml
name: Supabase keep-alive
on:
  schedule:
    # Mondays and Thursdays 20:23 UTC (early morning AEDT). The longest gap is 4 days.
    - cron: '23 20 * * 1,4'
  workflow_dispatch:
permissions: {}
concurrency:
  group: supabase-keepalive
  cancel-in-progress: false
jobs:
  heartbeat:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Record a database heartbeat
        env:
          SUPABASE_URL: ${{ vars.PUBLIC_SUPABASE_URL }}
          SUPABASE_KEY: ${{ vars.PUBLIC_SUPABASE_PUBLISHABLE_KEY }}
        run: |
          response=$(curl --fail-with-body --silent --show-error \
            --retry 3 --retry-delay 30 --retry-all-errors \
            -X POST "$SUPABASE_URL/rest/v1/rpc/keepalive" \
            -H "apikey: $SUPABASE_KEY" \
            -H "Content-Type: application/json" \
            -d '{}')
          echo "Heartbeat recorded at $response"
```

Operational notes:

- **Failure alerts:** a failed run emails the repository owner by default (keep
  Actions failure notifications on). A failure usually means the project is
  already paused. Restore it from the Supabase dashboard, then run the workflow
  manually.
- **The 60-day rule:** the repository is public, so GitHub disables this
  schedule after 60 days without repository activity. Any push resets the clock.
  If it is disabled, re-enable it from the Actions tab and run it manually. If
  the repository is expected to be quiet for longer, move the same request to a
  small TypeScript Cloudflare Worker with a Cron Trigger, which has no
  inactivity rule. (Pages Functions have no cron triggers, so this has to be a
  separate Worker.) Record that switch as a follow-up, not version 1 work.
- **Verification:** after the first week, check in the dashboard that the
  project has not been flagged for pausing, and that `private.heartbeat.beat_at`
  shows the scheduled times.
- **Not a backup:** keep-alive stops pausing, not data loss. Free projects
  paused for a long time may only be recoverable from a downloaded backup.
- **If the plan is upgraded** to Pro, delete the workflow and the function in a
  new migration.

### 9.4 Scheduled database jobs (`pg_cron`)

Enable the `pg_cron` extension in a migration and schedule these jobs in the
same migration, so they're version-controlled:

| Job                      | Schedule (UTC) | Action                                                                                             |
| ------------------------ | -------------- | -------------------------------------------------------------------------------------------------- |
| `purge-inactive-orgs`    | `30 17 * * *`  | Delete organisations whose `last_active_at` is more than 30 days ago (cascades to all their data). |
| `purge-dormant-accounts` | `40 17 * * *`  | Delete `auth.users` with no sign-in for 90 days.                                                   |
| `trim-audit-log`         | `50 17 * * *`  | Keep the newest 500 audit rows per organisation.                                                   |
| `expire-invitations`     | `55 17 * * *`  | Delete invitations expired for more than 7 days.                                                   |

`pg_cron` runs inside the database, so it does **not** count as project
activity. Keep-alive is still needed. A user whose organisation was purged gets
a fresh, seeded one next time they sign in (§5.4). The sign-in screen says that
inactive demo data is deleted after 30 days.

---

## 10. Abuse, privacy and limits

### 10.1 Demo data policy

The sign-in screen, Administration, and the footer all say:

> This is a public demo. Use fictional information only. Do not enter real
> people's names, contact details or case notes. Inactive demo data is deleted
> after 30 days.

Here "real data" means **data that persists**, not real personal information.
The portal's purpose (members, case notes, donations) makes real personal
information the main legal risk of a public demo.

### 10.2 Privacy (Australia)

- Publish a short privacy notice at `/privacy` (prerendered). It covers: what is
  collected (email address, display name, sign-in metadata, the data you enter),
  why, where it's stored (Supabase, Sydney), overseas recipients (Resend for
  email delivery, GitHub if you use GitHub sign-in, Cloudflare for hosting and
  Turnstile), the essential session cookies, how long data is kept (§9.4), and
  how to delete your account (§5.7). This follows Australian Privacy Principles
  1, 5 and 8. It is not legal advice; check the wording before promoting the
  demo widely.
- Supabase Auth logs, Cloudflare request logs and Resend's email logs hold
  personal data for their own retention periods. Mention this in the notice.
- The session cookies are strictly necessary for signing in, so they don't need
  a consent banner. Don't add analytics without revisiting this.

### 10.3 Email budget

Resend's 100 a day is the tightest limit in this stack.

- Supabase's email rate limit is 30 per hour. Resend's daily cap is the real
  ceiling, and when it's hit Supabase returns an error. Show "The demo has
  reached today's sign-in email limit. Sign in with GitHub, try again tomorrow,
  or use the demo without an account."
- Invitations send no email (§5.5). Only sign-in sends email.
- The 60-second resend gap and 10-minute code life limit repeat requests.
- Track usage in the Resend dashboard. If the demo regularly hits the cap, the
  next step is a paid Resend plan or making GitHub sign-in the primary method,
  not more workarounds.

### 10.4 Platform limits and abuse

- **Supabase sees Cloudflare's IP addresses, not visitors'.** Sign-in and verify
  calls now come from the Worker, so Supabase Auth's per-IP limits apply to
  Cloudflare's addresses. At demo scale that's fine, but many visitors may share
  an address. If `429` responses appear in testing or production, raise those
  limits in the dashboard and add a per-visitor limit in the Worker
  (Cloudflare's Rate Limiting binding) keyed on `CF-Connecting-IP`. Turnstile
  remains the main defence against automated sign-ups.
- **Workers free plan:** about 100,000 Function requests a day and 10 ms of CPU
  per request. Database waits don't count as CPU, but rendering the portal page
  does. Measure CPU time for `/` with a seeded workspace in Phase 2. If it gets
  close, cut work done during SSR or move to Workers Paid (about US$5 a month),
  which raises the limit a long way.
- Turnstile on every email sign-in request (§6.4). Supabase checks the token on
  its own servers.
- Row caps (§4.4), seed payload caps (§5.4), audit trimming and cleanup (§9.4)
  keep a single account to a few hundred kilobytes, well within 500 MB.
- Text length checks on every column (§4.4), and request body size limits in
  `requireJson` (64 KB), prevent oversized values.
- Watch the Supabase and Cloudflare usage pages monthly: database size, monthly
  active users, egress, Function requests and CPU.

---

## 11. Delivery phases

Each phase ends with its checks green and its changes left uncommitted for
review (AGENTS.md).

### Phase 0 — Accounts and decisions (manual, about 1 hour)

- [ ] Answer §13 Q1 (sending domain).
- [ ] Create P1 Supabase (Sydney, asymmetric JWT keys), P3 Resend (domain
      verified), P4 Turnstile and, optionally, P5 GitHub OAuth.
- [ ] Add §9.1 secrets and variables, and the `production` environment. Check
      the Cloudflare API token's permissions (§9.2).

**Done when:** a test SMTP email from Supabase arrives through Resend, and
Resend shows it as `delivered`.

### Phase 1 — Local database and policies

- [x] `supabase init`; add the CLI devDependency (pinned to `2.122.0`) and root
      scripts (`db:start`, `db:stop`, `db:reset`, `db:test`, `db:lint`).
      `db:types` moves to Phase 2 with the portal code that uses the types.
- [x] Migrations: enums, tenancy tables, record tables, triggers (`updated_*`,
      immutable keys, ID codes, row caps, audit), helpers, RLS,
      `list_org_users`, RPCs (§5.4–5.7), `keepalive`, `pg_cron` jobs. Five files
      in `supabase/migrations/`.
- [x] `config.toml`: project ID, local site URL and redirect URLs, 10-minute
      codes, seeding off. Email templates move to Phase 3 with the routes they
      link to.
- [x] pgTAP suite (§8.1): six files, 106 tests, with shared fixtures in
      `supabase/tests/_helpers.psql`. CI `database` job (§8.4) without the type,
      build and live E2E steps.

**Done when:** `supabase db reset && supabase test db` passes locally and in CI,
and `db lint` is clean.

### Phase 2 — Cloudflare adapter, local mode only

- [x] Switch to `adapter-cloudflare`; add `wrangler.jsonc` without production
      variables yet; change the preview script and Playwright `webServer`;
      remove root prerendering.
- [x] `src/lib/backend/` with `types.ts`, `local.ts` and the generated types.
      Rework `+page.svelte` to use the interface; pass the actor name into
      `records.ts`.
- [x] Type-level parity test (§8.2).
- [x] Deploy this to production on its own and measure CPU time for `/` (§10.4).

**Completed 3 November 2026.** Implementation, full local validation and
production release are complete. Production commit `6d15674` passed Verify and
Deploy community portal; 27 browser smoke tests passed against the live portal,
including CRUD, notes, assignments, saved views, drafts, report/CSV contents,
storage recovery, role preview and accessibility. The current commit changes
only documentation relative to CPU-tested application commit `fad72e8`.

The combined 66-request optimized CPU sample had p50/p95/p99 of
2.279/7.934/20.966 ms and no invocation errors. It meets the proposed p95
headroom target; early-request spikes remain a monitoring follow-up, and CPU
must be remeasured after auth/live-data changes. The sample does not establish
that every execution stays under 10 ms. Detailed deployment IDs, rollback
targets, workflow links and production smoke evidence are recorded in
`docs/community-portal-phase-2-implementation-plan.md`.

**Completion checks:** `npm run check` and `npm test` pass with the Wrangler
preview; production smoke checks pass; the combined CPU sample meets the chosen
p95 target. Early CPU spikes are retained as a monitoring follow-up.

### Phase 3 — Server-side auth

- [x] `@supabase/ssr` and `@supabase/supabase-js` dependencies;
      `hooks.server.ts`; `app.d.ts`; `/auth/**` routes; `+layout.server.ts`;
      safe redirects; header sign-out.
- [x] Turnstile widget on `/auth`; templates in `supabase/templates/`.
- [x] `portal-live` Playwright project with Mailpit, auth scenarios only (§8.3).

**Implemented and locally verified 3 November 2026.** The isolated
Wrangler/Mailpit auth suite and existing regression suite pass. CI now includes
the live-auth project in the database job; remote CI verification remains
pending. GitHub is optional and hidden. Production auth remains Phase 5 work.
Detailed evidence and prerequisites are in
`docs/community-portal-phase-3-implementation-plan.md`.

**Completion gate:** sign in by code and by link, GitHub (against a local or
test OAuth app, if used), sign-out and the guard all pass locally and in CI,
with `httpOnly` cookies and `no-store` checked.

### Phase 4 — Live data

- [x] `+page.server.ts` workspace load and seeding; `src/lib/server/*`;
      `/api/**` endpoints; `live.ts`.
- [x] Owner role switching, invitations (`/invite/[token]`), organisation
      switcher, Reset demo data, Delete my account, Board Member reports.
- [x] Demo notice and `/privacy`.
- [x] Remaining `portal-live` data and API scenarios, and the permissions
      integration test.

**Implemented and locally verified 3 November 2026.** Account workspaces now
load server-side and use the signed-in client for all reads, writes and RPCs.
Atomic first-run bootstrap, account CRUD, optimistic conflicts, owner role
changes, invitations, team management, organisation switching, de-identified
reports, reset, deletion and privacy are implemented. Verify and Deploy
community portal subsequently passed for hydration-fix commit `71631b3`; the
application is deployed with production auth still disabled. See
`docs/community-portal-phase-4-implementation-plan.md` for evidence and the
Phase 5 handoff.

**Completion gate:** every §8.3 scenario passes locally and in CI.

### Phase 5 — Production

- [ ] Production Auth settings (§6.4), Resend SMTP and templates (§6.5),
      Turnstile, GitHub OAuth.
- [ ] Production variables in `wrangler.jsonc`; migration steps in
      `deploy-portal.yml` (§9.2).
- [ ] `supabase-keepalive.yml` (§9.3); run it manually once and confirm
      `beat_at` changes.
- [ ] Smoke test on `cii-community-portal.pages.dev`: sign in from two browsers,
      invite, switch roles, confirm that a direct REST call for another
      organisation's rows returns nothing, and confirm the session cookies are
      `httpOnly` and `Secure`.

**Prepared 3 November 2026.** The managed Turnstile widget, main-only GitHub
production environment, guarded migration/deploy path, keep-alive workflow,
production configuration preflight and operator runbook are ready. Live auth
remains disabled. The saved Supabase credentials cannot access the planned
hosted project, and production migration credentials/public values are missing.
No hosted migration or account-mode release has been performed. See
`docs/community-portal-phase-5-implementation-plan.md` for completed
preparation, inputs and pending acceptance checks.

**Done when:** the live portal stores data across sessions, the smoke test
passes, and the first scheduled keep-alive run succeeds.

### Phase 6 — Documentation and follow-up

- [ ] README: replace "front-end demo using fictional records in browser
      storage" with the live and local modes. Document the Cloudflare adapter,
      local setup (`.env`, `.dev.vars`), the `db:*` scripts, migration rules,
      keep-alive and its runbook.
- [ ] Two weeks after launch, review Resend, Supabase and Cloudflare usage,
      keep-alive history and any `429` responses. Decide on the Cloudflare
      Worker keep-alive fallback (§9.3) and whether GitHub sign-in should become
      primary.

---

## 12. Risks

| Risk                                                             | Likelihood | Impact | Mitigation                                                                                                             |
| ---------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| No verified sending domain                                       | Medium     | High   | Blocking prerequisite (P2). Without it, only GitHub sign-in works.                                                     |
| RLS gap leaks another organisation's data                        | Low        | High   | Matrix-driven pgTAP tests, direct REST checks in E2E, `db lint`, no secret key at runtime.                             |
| One user's page cached and served to another                     | Low        | High   | `Cache-Control: private, no-store` on every signed-in response, checked in E2E.                                        |
| Email scanners use up one-time links                             | Medium     | Low    | `/auth/confirm` verifies only on POST; the code is always available as well.                                           |
| Supabase per-IP limits hit because traffic comes from Cloudflare | Low–Medium | Medium | Watch for 429s; raise Supabase limits; Worker-side rate limiting per visitor (§10.4).                                  |
| SSR exceeds the Workers free CPU limit                           | Low–Medium | Medium | Measure in Phase 2; trim SSR work; Workers Paid if needed.                                                             |
| Keep-alive schedule disabled after 60 quiet days                 | Medium     | Medium | Failure emails; runbook; Cloudflare Worker cron fallback (§9.3).                                                       |
| Resend daily cap reached                                         | Low–Medium | Medium | Clear message, GitHub sign-in, local mode (§10.3).                                                                     |
| Visitors enter real personal information                         | Medium     | High   | Demo notice in three places, 30-day cleanup, de-identified Board reports, notes kept out of the audit log.             |
| Database and TypeScript validation drift apart                   | Medium     | Low    | Enum parity at compile time, generated-types CI check, server re-validation, every read passes through `decodeRecord`. |
| Migration breaks the deployed portal                             | Low        | Medium | Add-then-remove migrations; `db push` before deploy; Pages rollback; manual dump before destructive changes.           |
| Cloudflare moves Pages features to Workers                       | Medium     | Low    | `adapter-cloudflare` targets both. Moving to Workers later changes the URL unless a custom domain is set up (§13 Q5).  |
| Free-plan terms change                                           | Low        | Medium | §2 fact table re-checked at setup and at the two-week review; paid plans remove pausing and CPU limits.                |

---

## 13. Open questions

| #   | Question                                                                                             | Default if unanswered                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Q1  | Which domain or subdomain will send email (P2)?                                                      | **Answered:** `auth.alankeown.id.au`.                                                                           |
| Q2  | Include GitHub sign-in in version 1?                                                                 | Yes. It's configuration only, and protects the email budget.                                                    |
| Q3  | How long before inactive data is deleted (organisations 30 days, accounts 90 days)?                  | As stated.                                                                                                      |
| Q4  | Should `members.email` be required in live mode? It's optional today.                                | Keep it optional, matching `validateForm`.                                                                      |
| Q5  | Move the portal to a custom domain on the same base domain as the sender?                            | Not in this plan. It would improve email trust, and make a later move from Pages to Workers invisible to users. |
| Q6  | Where should the first privileged feature run: a SvelteKit server route or a Supabase Edge Function? | Decide when that feature is planned, using the §7.7 comparison. Version 1 needs neither.                        |

---

## Document history

| Version | Date            | Change                                                                                                                                                                                                                        |
| ------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | 1 November 2026 | First draft: static portal, browser talks to Supabase directly.                                                                                                                                                               |
| 0.2     | 1 November 2026 | Switched to `adapter-cloudflare` and Supabase server-side auth (`hooks.server.ts`, `httpOnly` cookie sessions, server auth routes, JSON endpoints). Added a phase for the adapter switch.                                     |
| 0.3     | 1 November 2026 | Added §7.7: SvelteKit server routes and Supabase Edge Functions presented as equal alternatives for privileged code, chosen per feature. Added Q6.                                                                            |
| 0.4     | 1 November 2026 | Recorded completed setup: Supabase project `kykbgwewulzceunbbsfa` (Sydney), sending domain `auth.alankeown.id.au` verified in Resend (Tokyo), custom SMTP working. Q1 answered.                                               |
| 0.5     | 1 November 2026 | Phase 1 implemented. Record codes accept the existing seed and local-mode formats; codes are assigned under an advisory lock instead of a counters table; the user list is the `list_org_users()` function instead of a view. |
