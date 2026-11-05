# Community portal backend: Phase 3 implementation plan

Status: Implemented and locally verified on 3 November 2026. The database CI job
now runs the isolated auth suite; a remote CI run remains pending. Optional
GitHub OAuth stays hidden, and production auth configuration remains Phase 5
work.

## Outcome and boundary

Phase 3 adds server-side Supabase Auth to the Cloudflare Pages portal: email
code and link sign-in, optional GitHub OAuth, sign-out, route protection, a
deliberate browser-only choice, and auth-specific tests. An unconfigured
deployment must continue to serve the Phase 2 local demo. A configured visitor
can sign in, but the portal workspace remains local until Phase 4 adds
server-loaded data and `PortalBackend` live operations. Make that temporary
state explicit in the UI; do not imply that edits are saved to an account.

Phase 4 owns workspace bootstrap, database reads/writes, invitations, role
switching, account deletion and API endpoints. Phase 5 owns production auth
variables, provider settings, migrations and release. Phase 3 may verify against
local Supabase and a separate test OAuth app; it must not silently turn on
production auth.

**Implementation baseline:** the portal uses `adapter-cloudflare`,
`wrangler.jsonc` has no auth variables, `+page.ts` always returns local mode,
`+page.svelte` constructs `LocalBackend` after mount, the root layout has no
session header, and root Playwright config has only `portal`,
`portal-components` and `docs`. The local Supabase config has Mailpit and
redirect URLs, with captcha disabled. Keep the completed Phase 2 evidence in the
parent and supporting plans intact.

## 1. Establish an auth configuration contract

Files: `apps/community-portal/package.json`, root lockfile,
`apps/community-portal/src/env.ts`, `src/lib/server/auth-config.ts`,
`src/app.d.ts`, `wrangler.jsonc`, `.gitignore` and environment examples if
useful.

- [x] Add compatible, locked `@supabase/ssr` and `@supabase/supabase-js`
      versions. Confirm their Cloudflare runtime behavior, `createServerClient`
      cookie callback types and `getClaims()` behavior with the installed
      versions before implementing the hook. No browser Supabase client or
      secret/service key.
- [x] Use SvelteKit 3's explicit environment variable setup (`src/env.ts`,
      `$app/env/public`) rather than the parent plan's deprecated
      `$env/dynamic/public` example. Declare `PUBLIC_SUPABASE_URL`,
      `PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `PUBLIC_TURNSTILE_SITE_KEY` as
      optional **dynamic** public values: an empty configuration must build and
      run local mode. Reject partial Supabase configuration with a clear server
      error rather than accidentally treating it as local mode. Keep the
      optional GitHub button behind a separate public flag or server-provided
      capability, because the presence of Supabase config alone does not prove
      the provider is enabled.
- [x] Keep production `wrangler.jsonc` without auth variables through this
      phase. Add a trackable example file documenting values for `vite dev` and
      Wrangler `.dev.vars`, but keep real local files ignored. A local
      publishable key is public; the Turnstile secret, Resend key, GitHub OAuth
      secret, database password and Supabase secret key never enter portal
      runtime configuration or the repo.
- [x] Type `App.Locals` with a request-scoped typed Supabase server client or
      `null`, verified user identity or `null`, and the resolved mode. Store no
      mutable session or client in a module singleton. Derive the public site
      key and provider capability for the auth page from safe server data.

Checkpoint: `npm run check` and a no-variable build pass; no auth key appears in
the browser bundle except the intentionally public publishable/site keys, and no
secret is needed by the Worker.

## 2. Build the request-scoped session and guard

Files: `src/hooks.server.ts`, `src/routes/+layout.server.ts`,
`src/lib/server/auth-config.ts` and focused tests.

- [x] Create one `createServerClient<Database>` per request using SvelteKit's
      `event.cookies.getAll()` and `setAll()`. Preserve Supabase cookie
      attributes while enforcing `path: '/'`, `httpOnly`, `SameSite=Lax` and
      `Secure` on HTTPS; allow insecure localhost cookies only for development.
      Handle cookie chunks, deletion and refresh, including the cache headers
      passed to `setAll` by the installed `@supabase/ssr` version. Apply
      `Cache-Control: private, no-store` to every response that reads or writes
      auth cookies or carries signed-in data, including redirects, action
      responses and refreshes. Avoid duplicate `setHeaders` calls for the same
      header.
- [x] Use `auth.getClaims()` to verify JWT signature and expiry; never authorize
      from `getSession()`'s unverified user object. Confirm asymmetric signing
      keys for the eventual hosted project. Treat refresh failures or malformed
      cookies as signed out, with a usable recovery path. Keep the Supabase
      client tied to the incoming user's session so Phase 4 RLS calls use that
      token.
- [x] Resolve three states explicitly: **unconfigured local** (existing public
      demo), **configured local preference** (`portal-mode=local`,
      browser-only), and **configured signed-in**. A signed-in session takes
      priority over a stale local preference; sign-in clears that preference.
      Only the auth routes, allowed public routes and a narrow health/static set
      bypass the live guard. Redirect a signed-out document/navigation request
      to `/auth?next=…`; return 401 JSON for future `/api/*` requests. Preserve
      query parameters in `next` but never a hash, which the server cannot see.
      Do not redirect unknown public assets into the auth page.
- [x] Add `+layout.server.ts` returning only serializable, non-secret state:
      configured status, current mode and minimal verified identity for the
      header. Keep tokens and raw cookie values out of page data, HTML and logs.
      Add a sign-out form to the signed-in header; display a clear browser-only
      indicator when configured local preference is active. Avoid showing Sarah
      Mitchell as the authenticated identity. Do not add database profile or
      role reads yet.
- [x] Keep the current `+page.ts` and local backend path intact for this phase.
      Adjust page data only as needed to distinguish the signed-in shell from
      local mode, but do not claim persistence in the signed-in shell. If the
      current portal cannot safely show local records under a signed-in
      identity, show a distinct Phase 3 interim state until Phase 4 instead of
      rendering local seed records as account data.

Checkpoint: direct and client-side navigation obey the guard; local mode remains
accessible without configuration; cookie refresh never yields a cacheable
authenticated response.

## 3. Implement the auth route actions and safe return paths

Files: `src/lib/server/redirect.ts`, `src/routes/auth/+page.server.ts`,
`+page.svelte`, `src/routes/auth/confirm/+page.server.ts`, `+page.svelte`,
`src/routes/auth/callback/+server.ts`, and a POST-only sign-out action/endpoint.

- [x] Implement a pure, unit-tested `next` normalizer: accept one leading `/`
      plus same-origin path/query; reject `//`, backslash tricks, schemes,
      control characters and malformed encodings; default to `/`. Use it when
      receiving, storing and consuming a return path. Store the accepted value
      in a 15-minute `httpOnly`, `SameSite=Lax` cookie, and clear it after
      successful sign-in or sign-out. For a code or link opened in a different
      browser without that cookie, fall back to `/`.
- [x] Add `/auth` server form actions for email send, code verify, optional
      GitHub start, and “Try without an account.” Validate email and six-digit
      code server-side, retain safe form values, return plain, non-enumerating
      errors and prevent empty or oversized submissions. `signInWithOtp` uses
      `shouldCreateUser: true` and supplies the Turnstile token when enabled.
      Code verification calls `verifyOtp({ email, token, type: 'email' })`; on
      success clear `portal-mode` and redirect 303 to the safe return path.
- [x] Add `/auth/confirm` with a GET that only renders a confirmation screen.
      POST alone calls `verifyOtp` with `token_hash` and a strictly allowlisted
      type. Treat missing, expired and reused links as recoverable errors; never
      put the hash in analytics or logs. Verify the template's link works from
      another browser and that link preview GETs do not consume it.
- [x] Add `/auth/callback` for the OAuth PKCE code exchange. Verify the real
      `code` and allowed return path, exchange server-side, clear local
      preference, then redirect 303. Handle missing/invalid codes without
      exposing details. Show the GitHub option only if its provider is
      configured; test it against a separate test app if enabled, otherwise
      record it as optional and keep it hidden.
- [x] Sign out by POST, call Supabase's sign-out method with the intended
      session scope, clear relevant app cookies, and redirect to `/auth`.
      Browser GETs to a sign-out URL must not sign a user out. Keep sign-in and
      sign-out functional without client JavaScript, except that production
      Turnstile may require it.
- [x] Build the pages using existing `@cii/svelte` form controls, labels, errors
      and focus patterns. Add `autocomplete="email"` and
      `autocomplete="one-time-code"`; use `use:enhance` only where it preserves
      the native POST behavior and redirect semantics. Follow repository
      TypeScript rules for every `.svelte` script, route and test.

Checkpoint: email code, email link, optional OAuth, safe return path, local
choice and sign-out each have a complete browser flow and distinct failure
handling.

## 4. Add templates and local provider setup

Files: `supabase/templates/`, `supabase/config.toml`, root Playwright config and
test helpers.

- [x] Add versioned Magic Link and signup-confirmation templates that contain
      the OTP and a link to `/auth/confirm?token_hash=…&type=email`. Check the
      actual local Mailpit output: the link must point to the active live-test
      origin (`127.0.0.1:4189` or `localhost:4189`), even though `site_url`
      currently points to port 5187. Use an allowlisted
      `emailRedirectTo`/template value or adjust the local test site URL
      deliberately; do not let a passing code test hide a broken link test.
- [x] Keep local captcha disabled for deterministic Mailpit auth tests. Add a
      separate, narrow test for the Turnstile token handoff (or use the official
      always-pass test key with a matching local test secret); do not pretend
      that a site key alone enables Supabase captcha. Before any production
      release, set up the managed widget, allowed hostnames and Supabase Auth
      secret, and manually verify the challenge on the actual origin.
- [x] Keep Resend SMTP and GitHub OAuth production configuration out of this
      phase's code changes. Record the remaining dashboard settings from
      §6.4–6.5 as Phase 5 release prerequisites: asymmetric JWT signing, email
      confirmation/OTP limits, redirect allowlist, templates, Turnstile, SMTP
      sender and optional GitHub provider. Never commit provider credentials.

Checkpoint: Mailpit emits a usable code and a cross-browser link; no outbound
email is needed for CI.

## 5. Add an isolated live-auth test project

Files: `playwright.config.ts`, auth test specs/helpers, root `package.json`,
`.github/workflows/ci.yml`.

- [x] Preserve the existing `portal` project's unconfigured Wrangler preview and
      all Phase 2 tests. Add `portal-live` on a separate port, with only local
      Supabase URL, publishable key and test site key supplied to that server.
      Place live specs in a separate directory such as `tests/live`, exclude it
      from the existing `portal` project, and point `portal-live` only at that
      directory. Isolate browser contexts, storage and Mailpit messages. Start
      local Supabase before this project and clean up only infrastructure
      started for the test. Add `npm run test:portal-live`.
- [x] Keep root `npm test` runnable without Supabase by selecting only `portal`,
      `portal-components` and `docs` after the live project is added. Run
      `portal-live` explicitly in the database CI job. Do not let Playwright's
      default all-project selection silently make the existing unit/local suite
      depend on a database.
- [x] In CI, run the live-auth tests in the existing database job after
      `db:reset`, `db:test`, `db:lint`, generated-type freshness and a portal
      build. Install Chromium there. Keep the verify job independent of a
      running database; the whole Verify workflow must still gate deployment. Do
      not add production Supabase secrets to CI tests.
- [x] Cover: unconfigured demo access; configured signed-out redirects and API
      401; safe and rejected `next`; local preference; email-code sign-in;
      email-link GET does not verify, POST does; cross-browser link; session
      refresh and expired/invalid token recovery; POST sign-out and GET no-op;
      `httpOnly`/`Secure`/`SameSite` cookie attributes; no tokens in page data,
      HTML or JS-readable storage; private/no-store responses; invalid
      credentials and rate-limit style errors; keyboard/screen-reader labels and
      error focus. Test callback state and provider gating even if optional
      GitHub end-to-end is deferred.
- [x] Use Mailpit's API to read only messages generated for each test's unique
      address, with a bounded wait. Run a real Chromium flow against Wrangler's
      production-style preview. Keep test accounts fictional and local. Do not
      weaken existing local-mode assertions or couple the live project to
      production.

Checkpoint: the existing full suite and new auth suite pass in separate modes,
locally and in CI.

## 6. Verify, review and hand off to Phase 4

Run from a cleanly identified baseline, preserving pre-existing Phase 2
documentation edits:

```sh
npm run db:start
npm run db:reset
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

Validate changed components with the official Svelte MCP autofixer and recheck
after fixes. Inspect the built Cloudflare Worker and route output for auth
behavior and bundle compatibility. Record the actual dependency versions, test
counts and any environmental limitations. Review whether auth adds measurable
SSR CPU time; repeat the production CPU smoke only when auth is deployed in a
later phase, with a comparable request mix and Cloudflare Pages CPU metrics.

**Phase 3 is complete when** code and link sign-in, sign-out, local choice and
the guard pass locally and in CI; cookies are `httpOnly` and authenticated
responses are non-cacheable; an unconfigured build still serves the Phase 2
demo; and the Phase 4 live-data boundary is explicit. The phase may be left
uncommitted for review. Commit and push each require their own explicit user
authorization under `AGENTS.md`.

## References checked while planning

- [SvelteKit auth, hooks, form actions and explicit environment variables](https://svelte.dev/docs/kit/auth)
- [Supabase server-side auth and cookie/cache guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Supabase passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates)
- [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha)

## Implementation evidence — 3 November 2026

Implemented against clean baseline `8059fba`; all changes remain uncommitted.
Phase 2 code and its recorded production evidence are preserved. The root portal
page and local backend are unchanged. A verified session renders a separate
Phase 3 screen without mounting the local workspace or presenting Sarah Mitchell
as the account holder.

- Locked dependencies: `@supabase/ssr` **0.12.7**, `@supabase/supabase-js`
  **2.118.0**, with Svelte **5.57.2** and SvelteKit **3.1.0**. Inspected
  installed cookie callback types and `getClaims()` implementation. Asymmetric
  projects verify through WebCrypto/JWKS; the local symmetric signing
  configuration verifies through Supabase Auth. The request-scoped client
  retains the user's token for Phase 4 RLS calls.
- Dynamic environment variables have explicit optional validators. Empty
  configuration builds and serves the existing demo. Partial configuration
  throws a clear server configuration error. Wrangler receives explicit test
  bindings; production `wrangler.jsonc` remains without auth variables. Only
  public URL/key/site-key/capability values enter runtime configuration.
- Auth cookies preserve Supabase chunk/expiry options and enforce the shared
  path, HTTP-only, SameSite and transport policy. Guard responses preserve
  cookie deletions without relying on SvelteKit's redirect conversion. All
  configured responses are private/no-store, including errors, actions,
  refreshed sessions and navigation data. The layout reads the pathname so
  client navigation reruns the guard rather than reusing an auth-page layout
  without server validation.
- Mailpit output was inspected by unique fictional recipient. Actual links point
  to `127.0.0.1:4189/auth/confirm`, carry Supabase's `pkce_` token-hash prefix,
  and work in a second browser without the initiating PKCE or return-path
  cookies. GET previews do not consume links; only POST verifies. The referrer
  policy sends only the origin, preserving native form CSRF checks while
  withholding link query values from referrers.
- Local verification passed: **106 database tests**, database lint,
  generated-type freshness, repository TypeScript/tooling/Svelte checks, the
  complete no-variable build, **43 unit tests**, **36 existing browser tests**,
  and **7 live-auth browser tests**. Formatting and `git diff --check` passed.
  Official Svelte MCP autofixer checks for all three changed/new components
  reported no issues or suggestions.
- Live coverage includes document and client navigation guards, API 401, unknown
  assets, safe return paths, browser-only choice, code and link sign-in,
  cross-browser link consumption and reuse, session refresh, malformed/expired
  sessions, cookie attributes, token isolation, POST sign-out/GET no-op,
  labels/error focus, callback/provider gating, and CSRF rejection. Focused unit
  coverage verifies HTTPS cookie policy, partial configuration, redirect tricks,
  Turnstile token handoff, and non-enumerating provider/429 responses. Local
  captcha stays disabled; HTTPS cookie enforcement is unit-tested, while the
  browser suite checks HTTP loopback attributes.
- After changing local Auth configuration or templates, restart Supabase to load
  them. The test runner uses existing Supabase infrastructure when available and
  stops it only if it started it. It does not reset the database or delete
  unrelated Mailpit messages. `npm test` selects the three original projects;
  `npm run test:portal-live` runs the separate Wrangler preview after a portal
  build. CI invokes it after the database checks and portal build and uploads
  failure artifacts. CI has been configured, not executed remotely in this
  session.

### Phase 4 handoff and Phase 5 prerequisites

Phase 4 must add workspace bootstrap, server data loads and `PortalBackend` live
operations, then replace the signed-in interim screen. No account records are
read or written in this phase.

Before release, confirm the hosted project's asymmetric JWT signing keys;
configure email confirmation, six-digit/10-minute OTP and rate limits, the exact
redirect allowlist, both email templates, the managed Turnstile widget/hostnames
and matching Supabase secret, and Resend SMTP with its verified sender. Optional
GitHub requires a separate test app and a real PKCE round trip before enabling
`PUBLIC_AUTH_GITHUB_ENABLED`; it remains disabled here. Provider credentials
never belong in portal runtime bindings or version control.

Auth introduces JWT verification and, for the local symmetric configuration or
refreshes, Auth network requests. Local correctness tests do not establish
production Worker CPU consumption. Repeat the comparable Cloudflare Pages CPU
smoke and inspect CPU metrics only after a later authorized auth deployment. No
production auth settings, credentials, migrations or deployments were changed in
this implementation.
