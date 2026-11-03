# Community portal backend: Phase 4 implementation

Status: Implemented and locally verified on 3 November 2026 from clean baseline `522b08c`. Changes are uncommitted. Remote CI verification is pending; production auth remains disabled under Phase 5.

## Delivered

- [x] Add server-loaded account workspaces and replace the Phase 3 interim screen. The local demo keeps its existing persistence keys, role preview, drafts, theme and recovery behavior.
- [x] Load the verified account profile, active memberships and permission matrix, then only permitted record modules. Fetch saved views for the account and organisation, and audit/user lists only for Admins. Decode database records through the shared runtime validators.
- [x] Add atomic `bootstrap_demo_workspace` in a new migration. It serializes first visits by account, then creates and seeds within one transaction. Invalid seeds roll back the profile, organisation and membership; later loads reuse existing records. Existing migrations remain unchanged.
- [x] Add a browser `LiveBackend` using same-origin JSON requests, without a Supabase browser client. Preserve optimistic timestamps and structured backend errors, redirect expired sessions to auth, and use returned server records in the workspace.
- [x] Implement create, update, archive, saved view and report operations. Ignore client-supplied actor/timestamp/organisation fields when writing records and let the database assign readable record codes. Scope queries to the selected organisation and run every operation through the incoming user's Supabase client and RLS.
- [x] Add owner role switching, active-membership-checked organisation switching, invitation creation/acceptance, member role changes/deactivation, reset and account deletion. Database functions enforce owner/Admin restrictions. Invitations expose a copyable link once and send no email; GET never accepts an invitation. Wrong recipient, malformed, expired and reused tokens are refused.
- [x] Keep Board Member reports de-identified. Full report rows pass through the record decoder, while de-identified RPC output is allowlisted again at the HTTP boundary and retains its limited shape without manufacturing name, contact, notes or relationship fields. The UI labels these rows “De-identified record”; CSV exports retain only returned fields.
- [x] Display account identity and organisation, hide generic fake-user editing in live Administration, and add dedicated team controls. Owners can return to Admin from any preview role. Add a fictional-data notice and public, prerendered privacy page.
- [x] Disable browser draft storage for account records. Live record snapshots, searches and theme changes are not persisted to local storage. Existing browser-only data remains separate.
- [x] Extend database, unit and isolated Wrangler/Mailpit tests. The existing database CI job already resets, tests and lints the database, verifies generated types, builds the portal and runs all live specs.

## Implementation details

`+page.server.ts` selects local or live mode and loads the initial account workspace. The universal load forwards this typed data. `+page.svelte` mounts `PortalWorkspace.svelte` keyed by the returned data, so role, organisation and reset refreshes discard stale selections, open dialogs and records. The main workspace component retains the existing local implementation; live mutations replace rows with the server's result. Audit/user lists refresh on a workspace reload.

The JSON endpoints are dispatched by `src/routes/api/[...path]/+server.ts` using explicit path, method and module allowlists. They implement the §7.4 contract: records, views, reports, workspace reset/organisation, role, invitations, memberships and account deletion. Mutations require JSON, bounded bodies and a matching Origin when present. They check the active membership, and record writes also check the database's `can_write` permission before issuing an RLS-scoped query. SQL errors become stable, non-sensitive backend errors. A missing or stale optimistic timestamp cannot overwrite a changed row.

The HTTP-only `portal-org` cookie is a preference, never an authorization decision. Each operation checks membership again. Browser requests include the workspace's organisation ID in a header; if another tab has switched the cookie to a different organisation, the stale workspace gets a conflict and must reload before saving. Organisation changes validate the new membership before updating the preference. Sign-out and account deletion clear organisation preferences as well as auth cookies.

Local setup uses the Phase 3 `.env.example`, ignored `.env.local`/`.dev.vars` files, and the isolated live-test runner. Apply the new migration locally before testing (`npm run db:reset` for a disposable test database), regenerate database types, then build the portal. No service/secret key or production setting is needed.

## Verification evidence

- Database: **113 tests** across seven pgTAP files passed; schema lint found no errors. Generated types include the new RPC. The new tests exercise anonymous denial, seed failure rollback and reuse without reseeding.
- Unit: **48 tests** passed, including row mapping/decoding, server-managed write fields, SQL error mapping, report redaction, optimistic timestamp transport, organisation binding, conflicts, session expiry and network failures.
- Existing browser suite: **36 tests** passed against the unconfigured Wrangler preview, covering local CRUD, persistence/recovery, drafts, reports, role preview, accessibility and documentation/components.
- Live browser/HTTP suite: **11 tests** passed against the built Wrangler Worker and local Supabase/Mailpit. Coverage includes all Phase 3 auth scenarios plus account creation/seeding, persisted CRUD, stale-update rejection, JSON 415, saved views, archive/reset, owner role changes, API and direct REST/RLS denial, permission matrix parity, Board report redaction, invitation UI and second-browser acceptance, wrong recipient/error focus, team role/deactivation, organisation switching, simultaneous first visits creating one organisation, draft/storage isolation and account deletion.
- Repository TypeScript/tooling/Svelte checks, complete no-variable build, formatting and `git diff --check` passed. The official Svelte MCP autofixer found no component issues; optional style suggestions for inherited class directives and dialog focus bindings were retained to preserve the established implementation.
- Browser bundles were inspected for server SDK, token and secret-key markers. No Supabase SDK or account token is shipped in client code. Authenticated HTML/data responses and mutations remain private/no-store under the Phase 3 hook.

Run the same checks before committing:

```sh
npm run db:test
npm run db:lint
npm run db:types
npm run format:check
npm run check
npm run build
npm test
npm run test:portal-live
git diff --check
```

`npm test` remains independent of a running database. `npm run test:portal-live` uses local Supabase and its own preview port; it reuses existing infrastructure and only stops infrastructure it started. The test fixtures use unique fictional addresses and do not send outbound email.

## Phase 5 handoff

Commit and push each need separate user authorization. Verify the remote workflow after a later push. Do not enable account mode in production until the new migration and the Phase 3/5 Auth prerequisites are ready: asymmetric signing keys, exact redirect allowlist and templates, OTP/rate limits, Turnstile hostname/secret setup, verified SMTP sender and optional tested GitHub OAuth.

Production deployment, provider credentials, keep-alive setup and production smoke tests remain Phase 5 work. Repeat the comparable Cloudflare CPU smoke after that authorized deployment; local functional checks do not establish production SSR CPU headroom.
