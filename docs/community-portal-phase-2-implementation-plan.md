# Community portal backend: Phase 2 implementation plan

Status: optimized build deployed; combined CPU smoke sample meets the p95 target, with early CPU spikes still requiring follow-up. Prepared 3 November 2026 against the current repository and Phase 2 of `docs/community-portal-backend-plan.md` (§7.1–7.5, §8.2–8.4 and §10.4).

The outcome is the existing local demo running through Cloudflare Pages Functions, with browser operations behind `PortalBackend` and database enum drift checked at compile time. Browser data, drafts, recovery, permissions preview and reporting must continue to work.

This document plans the work; it does not implement or deploy it. Leave implementation changes uncommitted for review. Commit, push and production deployment are subsequent release actions requiring the user's authorization.

## Scope and current state

Phase 1 supplies six migrations, the local Supabase configuration and the database CI job. Phase 2 consumes that schema to generate types; it needs no production Supabase credentials or further database migrations.

| Area         | Current implementation                                                        | Phase 2 change                                                                                |
| ------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Hosting      | Portal uses `adapter-static`; root layout prerenders                          | Use `adapter-cloudflare`, keeping SSR and hydration enabled                                   |
| Preview      | Portal and docs both use `scripts/preview.ts`                                 | Portal runs through Wrangler; docs retain the static preview                                  |
| Workspace    | Page loads storage in `onMount` and auto-saves the full snapshot in an effect | Local backend owns operations and explicit persistence                                        |
| Record forms | Dialog builds records and calls a synchronous parent callback                 | Dialog submits validated form values and awaits the backend result                            |
| Attribution  | `records.ts` and page activity hard-code Sarah Mitchell                       | Required actor parameter in helpers; local backend supplies the demo actor                    |
| Types        | No generated database types or enum parity assertions                         | Checked-in generated types, root generation script, compile-time tests and CI freshness check |
| Deployment   | Workflow uploads `apps/community-portal/build`                                | Upload `.svelte-kit/cloudflare` from the portal workspace                                     |

Authentication, Supabase clients, live APIs, invitations, account deletion, production variables and keep-alive remain in their later phases. Implement the shared reset method, but leave the new Administration reset UI for Phase 4. Keep this supporting plan outside the published design-document collection unless publication is requested.

## 1. Establish the baseline

- [x] Run the existing checks, build and tests; record any unrelated failures before changing behavior.
- [x] Confirm the existing local Supabase stack is running, then run `npm run db:reset`, `npm run db:test` and `npm run db:lint`. The stack was already running before this task and remains running.
- [x] Record existing storage behavior: empty storage is initialized; valid legacy snapshots are upgraded; unreadable snapshots survive until replacement is confirmed; unavailable storage permits in-memory use with a warning; drafts remain independent of workspace saving.
- [x] Capture the existing portal test coverage for CRUD, drawer actions, bulk archive, saved views, reports, theme, navigation, role preview and accessibility. Use it as the regression baseline.

## 2. Switch the portal runtime and prepare deployment

Files: `apps/community-portal/package.json`, `vite.config.ts`, `wrangler.jsonc`, `src/routes/+layout.ts`, root `package-lock.json`, `.gitignore`, `playwright.config.ts` and `.github/workflows/deploy-portal.yml`.

- [x] Replace the portal's static adapter dependency with a Cloudflare adapter release compatible with the installed SvelteKit 3 version. Resolve and lock the actual release during implementation rather than assuming the parent plan's adapter major is still correct. The docs workspace keeps its static adapter.
- [x] Add portal devDependency `wrangler` pinned to `4.156.0`, matching the deployment workflow. Update the lockfile through npm.
- [x] Configure `adapter-cloudflare` through the existing `sveltekit({ adapter })` call in `vite.config.ts`.
- [x] Remove the root layout's `prerender = true`; delete the file if that leaves it empty. Keep SSR enabled so this phase exercises the future server runtime.
- [x] Add a Pages configuration with project name `cii-community-portal`, `pages_build_output_dir: '.svelte-kit/cloudflare'` and the parent plan's compatibility date `2026-10-01`. Check the build and Wrangler runtime for required compatibility support. The current application runs without `nodejs_compat`, so no compatibility flags are retained. Add no Supabase or Turnstile bindings, including production overrides.
- [x] Ignore `.dev.vars`, `.dev.vars.*` and Wrangler's local `.wrangler/` state. If an example vars file is introduced, explicitly keep it trackable.
- [x] Set portal preview to `wrangler pages dev .svelte-kit/cloudflare --port 4187 --ip 0.0.0.0`. Leave the shared sirv script and docs preview unchanged.
- [x] Update the portal Playwright server readiness check to match the pinned Wrangler's actual ready output; keep port 4187 and the existing portal project. Disable dotenv loading for the local-mode preview. The Phase 2 page load always returns local mode and uses no runtime Supabase settings.
- [x] Update the deploy action's working directory to `apps/community-portal` and its command to `pages deploy .svelte-kit/cloudflare --project-name=cii-community-portal --branch=main`. Preserve the successful-Verify gate, exact verified SHA checkout and existing concurrency protection. Add no migration step in this phase.

Checkpoint: the production build contains the Worker and generated `_routes.json`; `/` goes through SSR, static assets bypass the Function, and existing portal browser tests run under Wrangler. Changing the adapter without changing the deploy path is an incomplete change.

The adapter output, routing exclusions and Wrangler preview approach follow the [SvelteKit Cloudflare adapter documentation](https://svelte.dev/docs/kit/adapter-cloudflare). Pages uses the committed Wrangler configuration when `pages_build_output_dir` is present; review its settings before release. See [Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

## 3. Add generated types and enforce parity

Files: root `package.json`, a TypeScript generation helper if needed, `src/lib/backend/database.types.ts`, `tests/unit/database-parity.test.ts` and `.github/workflows/ci.yml`.

- [x] Add root `db:types` using the pinned CLI to run `supabase gen types typescript --local --schema public`. Generate from the freshly migrated local database, never from handwritten interfaces or production.
- [x] Write successful output to `apps/community-portal/src/lib/backend/database.types.ts`. Prefer a small TypeScript helper that captures output and writes only after generation succeeds, so a CLI failure cannot truncate the checked-in file.
- [x] Establish one formatting convention for the generated file. Either format generation and CI identically or exclude this generated artifact from Prettier and compare raw CLI output. Do not let the generation check and `format:check` fight each other.
- [x] Use type-only imports for `Database`. Keep this phase free of Supabase runtime dependencies.
- [x] Add bidirectional type equality assertions for every database enum: `app_role` ↔ `Role`, `app_module` ↔ `Module`, all five record-status enums ↔ their corresponding `statuses` unions, and `case_priority` ↔ `priorities[number]`.
- [x] Keep the test in `tests/unit/`, which the portal tsconfig already includes. Ensure a mismatch fails `npm run check`; Node execution alone does not validate types. Verify this once with a temporary mismatch, then restore it.
- [x] Do not claim enum parity for Administration status or saved-view sort: these are SQL text/check constraints, not generated enums. Their database validation remains covered by Phase 1 tests.
- [x] Extend the existing `database` CI job after reset/lint to regenerate types and fail on a diff against the checked-in file. Preserve cleanup with `if: always()`. Keep the main verify job independent of a running database by consuming checked-in types.

Checkpoint: generating twice yields no diff, clean CI detects stale types, and a deliberate enum mismatch fails type checking. Local generation is supported by the [Supabase type-generation documentation](https://supabase.com/docs/guides/api/rest/generating-types).

## 4. Implement the local backend and persistence lifecycle

Files: `src/lib/backend/types.ts`, `src/lib/backend/local.ts`, `src/lib/records.ts` and focused unit tests. Retain `persistence.ts` as the validated storage boundary.

- [x] Define `SessionInfo`, `Workspace`, `PortalBackend` and `BackendError` as specified in §7.3, using existing model types and Promise-based operations. Do not invent a signed-in organisation or session for local mode.
- [x] Add an instance factory for the local backend. Inject storage access, the demo actor, clock and ID generator so it can be tested in plain Node without `$env`, `$app` or DOM globals.
- [x] Keep workspace state per browser instance. Never put a mutable workspace in a server module singleton. Acquire `localStorage` only after mount and handle access itself throwing.
- [x] Give the local implementation an explicit lifecycle separate from the shared contract: initialize/load, read a cloned snapshot, set the theme, inspect persistence status and replace unreadable storage after UI confirmation. These local concerns must not force future live implementations to expose browser storage.
- [x] Preserve `community-portal-v1`, the version-2 snapshot envelope, legacy decoding, draft keys and all validation. On initialization, explicitly persist empty/valid migrated workspaces where the current effect would do so.
- [x] Implement create, update, bulk archive and saved-view saving with existing validators and helpers. The adapter assigns IDs/timestamps/actor metadata and owns audit updates; page code must not add duplicate entries. Preserve user-visible activity descriptions for drawer actions through local orchestration without adding browser-specific requirements to `PortalBackend`.
- [x] Pass the actor explicitly to `buildRecord`, `changeRecord` and the record archive helper; update every caller and existing helper test. Continue to use Sarah Mitchell for local attribution.
- [x] Implement `reportRows` with `selectReportRows`, retaining inclusive date bounds, open-ended dates and empty results for reversed ranges. Implement `resetDemoData` using a fresh clone of seed records, clearing workspace audit and saved views while retaining theme and independent drafts.
- [x] Persist explicitly after each successful mutation and theme change. Serialize operations or guard overlapping writes so two awaited operations cannot overwrite each other's changes.
- [x] Preserve in-memory use when saving is paused or storage fails. Keep corrupt bytes untouched until replacement is confirmed; warn that changes are unsaved. Storage failures must not silently discard the in-memory update or falsely announce durable saving. Domain/validation failures reject with the shared error shape and leave records unchanged.
- [x] Return copies or otherwise prevent callers from mutating adapter-owned state outside an operation. Keep reactive proxies out of serialized snapshots.

Checkpoint: the adapter can load legacy data, mutate records, produce activity, reload a valid snapshot and recover from storage failures without a browser or database.

## 5. Route the UI through the asynchronous interface

Files: `src/routes/+page.ts`, `+page.svelte`, `src/lib/components/RecordFormDialog.svelte`, `Reports.svelte` and, where needed, `RecordDrawer.svelte`.

- [x] Add a minimal typed page load returning `{ mode: 'local' }`. It is a stable discriminator for the current phase; runtime live-mode detection and authenticated loading belong to later phases.
- [x] Initialize the local adapter after mount, preserving `data-ready`, query/hash navigation and deterministic SSR seed content. Keep the actor/profile unchanged for visitors.
- [x] Replace page-level workspace loading, direct mutation and the broad auto-save effect with backend operations and explicit local snapshot synchronization. The page owns view state; the adapter owns workspace data, audit and persistence status.
- [x] Change the dialog callback to submit form values plus the editing context and return a Promise. Create through `createRecord`; edit through `updateRecord`, preserving the original `updatedAt` for the optional expected timestamp. Keep client validation and focus behavior; the backend validates again.
- [x] Await successful operations before closing dialogs, clearing selections or displaying success toasts. Keep entries and selection available on rejection. Map `fieldErrors` onto the existing error summary and fields.
- [x] Add pending states to form and drawer/bulk operations, preventing duplicate submissions and stale completions after navigation. Ensure a rejected operation releases its pending state.
- [x] Route status changes, notes, assignments, attendance and bulk archive through backend methods. Apply returned records and refreshed local audit/views; preserve selection and detail behavior.
- [x] Route saved views through `saveView`; persist theme changes explicitly through the local lifecycle. Keep draft save/restore in the existing persistence helpers.
- [x] Route report loading through `reportRows`, preserving filters, summary and CSV content. Guard stale asynchronous results when users change module/date range quickly; keep the existing invalid-range message.
- [x] Keep role preview client-side and retain the existing permission matrix. Do not add live-mode role switching or a reset button yet.

Checkpoint: create/edit/archive, drawer actions, saved views and theme survive reload; reporting and CSV remain equivalent; corrupt-storage recovery and drafts still pass existing tests. All authored scripts remain TypeScript with strict checking. Validate changed Svelte components with the Svelte MCP tools during implementation.

## 6. Validate the integrated change

Add tests at the boundaries being changed rather than duplicating existing low-level persistence tests.

| Layer                             | Required evidence                                                                                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local backend unit tests          | Create/update/archive, ID and actor attribution, single activity entries, saved views, report bounds, reset, overlapping operations, returned-value isolation, paused/unavailable/quota-failed storage and confirmed recovery |
| Existing record/persistence tests | Existing validation, legacy snapshots and draft behavior still pass after actor signature changes                                                                                                                             |
| Compile-time checks               | All eight public enums match; temporary mismatch demonstrably fails                                                                                                                                                           |
| Browser tests under Wrangler      | Existing portal, storage and accessibility suites pass without weakening assertions; add reload coverage where saved views/theme or async mutations lack it                                                                   |
| Async UI checks                   | Controlled delayed/rejected backend operations prove pending state, duplicate-submit prevention, retained form values and actionable errors; do not add public test-only routes                                               |
| Build/runtime smoke checks        | `/` and `/?module=Members` render and hydrate; no browser-only global is accessed during SSR; unknown routes return 404; static assets load through generated exclusions                                                      |
| CI                                | Existing `verify` and `database` jobs pass, including generated-type freshness; no production service is needed                                                                                                               |

Validation commands:

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
git diff --check
```

The build precedes browser tests because Playwright starts the production preview. Confirm the portal server is Wrangler and the docs server remains sirv. Stop the local database after validation if it was started for this task. Review the generated types and lockfile alongside authored changes.

## 7. Release separately and measure CPU

Complete all local work and present the tested diff before requesting any release action. Preserve the repository's separate commit and push authorizations. This planning request does not authorize release.

- [ ] Record the previous deployment ID and rollback target. Inspect existing Pages settings before the Wrangler configuration takes ownership; ensure Phase 2 remains local mode in production.
- [ ] After authorization, release Phase 2 on its own using the existing verified-commit workflow. Do not combine it with authentication or live data.
- [ ] On the existing production origin, check an existing browser profile's data and a fresh profile: create/edit/archive, reload, saved views, theme, drafts, reports/CSV, role preview and recovery. Retaining the origin and storage keys is necessary to retain visitors' existing browser data.
- [x] Exercise a modest batch of full document requests for `/`, with a few initial requests and repeated warm requests. Record deployment ID, UTC window, request count, CPU quantiles exposed by Cloudflare and any invocation errors. Use Pages **Functions Metrics → CPU time per execution**, not response duration or browser navigation timing. Separate static-asset traffic from Function requests. See [Pages metrics](https://developers.cloudflare.com/pages/functions/metrics/).
- [ ] Verify CPU remains below the current free-plan 10 ms budget with headroom and no CPU-limit failures. A proposed engineering target is p95 below 8 ms where available; this is a planning target, not a platform guarantee. If results approach the limit, profile and reduce SSR work before accepting the phase. A paid-plan change requires a separate decision. See [Workers runtime limits](https://developers.cloudflare.com/workers/platform/limits/).
- [x] Record the important measurement limit: Phase 2 SSR renders the existing seed workspace; saved browser data is loaded after hydration. This validates local-mode SSR only. Repeat measurement after Phase 4 introduces server-loaded workspaces and auth overhead; a large localStorage snapshot cannot simulate that server cost.
- [ ] Roll back to the recorded deployment if production behavior regresses or resource limits fail; investigate before continuing.

## Completion criteria

- [x] Repository checks, the full build and all existing tests pass; portal browser tests use Wrangler.
- [x] Generated database types are checked in, reproducible and guarded by compile-time parity and CI freshness checks.
- [x] Every workspace mutation uses the local backend; storage compatibility, recovery, theme, drafts and activity are preserved.
- [x] Deployment workflow points to the Cloudflare build and still deploys only verified commits.
- [x] Reviewable implementation is left uncommitted unless separately authorized.
- [ ] Following an authorized release, production smoke checks and recorded CPU measurements pass. Until then, report implementation as ready for release and keep the production/CPU checklist incomplete.

Validation recorded on 3 November 2026: database reset, all 106 pgTAP tests and lint passed; public type regeneration was byte-for-byte reproducible; a temporary role mismatch failed the portal type check and was then restored. Formatting, full workspace checks, the full build and all 36 browser tests passed. Browser coverage includes three isolated async component tests plus new production SSR/asset/404 and archive/saved-view reload checks. The Svelte MCP autofixer reported no issues in all changed components; optional suggestions for existing class directives and DOM references were reviewed and left unchanged. Production deployment and CPU smoke results are recorded below.

## Production CPU smoke test — 3 November 2026

The existing production deployment was inspected through the Cloudflare API; no deployment or runtime configuration was changed during this test.

- Deployment: `4ca5cc00-e909-4204-878a-efe724e0596c`, production branch `main`.
- Commit: `0ddad43fa9faa9e1bd2c58564149460e34b9d73c`.
- Target: `https://cii-community-portal.pages.dev/`.
- Request window: `2026-11-02T23:47:37.761800Z`–`2026-11-02T23:47:45.373457Z` (3 November, 10:47:37–10:47:45 AEDT).
- Requests: 33 sequential document GETs, comprising three initial requests and 30 subsequent requests. All returned HTTP 200. These labels do not establish which requests used a cold isolate.
- Additional smoke checks: SSR HTML contains the seeded dashboard, an immutable JavaScript asset returns 200, and a nonexistent route returns 404. These additional requests are outside the CPU measurement window.

Cloudflare GraphQL `pagesFunctionsInvocationsAdaptiveGroups`, filtered to `2026-11-02T23:47:37Z`–`2026-11-02T23:47:46Z`, returned:

| Measurement       | Result    |
| ----------------- | --------- |
| Requests          | 33        |
| Invocation errors | 0         |
| Invocation status | `success` |
| Median CPU        | 5.054 ms  |
| p95 CPU           | 11.100 ms |
| p99 CPU           | 12.903 ms |

The GraphQL schema identifies CPU quantiles as microseconds; the values above are converted to milliseconds. The query was repeated and returned the same values. The canonical deployment was unchanged when checked again after the measurement.

**Result: availability passed; CPU acceptance remains open.** The observed p95 exceeds both the proposed 8 ms engineering target and the 10 ms free-plan CPU budget. There were no CPU-limit invocation failures in this sample. Occasional over-budget executions can succeed because the runtime allows some flexibility; successful responses alone do not establish adequate headroom. Profile and reduce SSR work, then repeat the production measurement before accepting Phase 2. No paid-plan change, rollback or code optimization was performed as part of this test. See [Cloudflare CPU limits](https://developers.cloudflare.com/workers/platform/limits/).

Attribution limit: the Pages analytics dataset exposes this traffic under `scriptName: "__unknown__"`, with no project or deployment dimension in its exposed schema. The account-level result matches all 33 test requests in the narrow window, but it is not an independently project-filtered sample. The general Workers dataset returned no results; the reported CPU values come from the Pages-specific dataset. This is a small smoke sample, not a load benchmark or proof of future live-mode performance. Full browser-profile production checks remain separate from this CPU-only test.

## SSR profiling and optimization — 3 November 2026

The production server was profiled locally before and after the optimization using Node `v24.17.0`, process CPU accounting and V8 CPU profiles. The harness imports the built Cloudflare server entry, renders real `/` responses and verifies the dashboard is present in the HTML. It uses one initial render, 20 warm-up requests and 100 measured sequential renders, without network waits.

Instrumentation of the baseline measured 1,700 `Date.toLocaleDateString` calls, 500 `Intl.DateTimeFormat` constructions and 200 `Intl.NumberFormat` constructions across 100 warm renders. The dashboard repeatedly formats today's Sydney date, dates, currency and event months. The optimization lazily reuses four locale formatters, containing no user or workspace data, and routes event-month formatting through the shared helper. The optimized warm sample performed none of those constructor or `toLocaleDateString` operations. Values continue to be formatted on each call; the current day itself is not cached.

Uninstrumented local results:

| Measurement                               | Before    | Optimized |
| ----------------------------------------- | --------- | --------- |
| Warm median CPU per render                | 1.221 ms  | 0.312 ms  |
| Warm p95 CPU per render                   | 3.557 ms  | 0.796 ms  |
| Warm p99 CPU per render                   | 4.625 ms  | 1.136 ms  |
| First render, including lazy page loading | 41.123 ms | 39.733 ms |

Warm p95 improved by about 78%. The first-render figures include Node module initialization and show no comparable startup improvement. These local Node results compare the code paths; they do not replace Cloudflare CPU measurements or establish compliance with its free-plan limit. SSR and the full dashboard content remain enabled.

Reproduce after building the portal:

```sh
npm run build --workspace @cii/community-portal
npm run profile:portal:ssr
npm run profile:portal:ssr -- --instrument
```

For a V8 CPU profile:

```sh
node --cpu-prof --cpu-prof-dir=/tmp --experimental-strip-types scripts/profile-portal-ssr.ts --instrument
```

Validation passed: formatting, full workspace checks, the complete build, unit tests and all 36 browser tests, including the Wrangler production preview. New formatting regressions check stable Australian date/currency/month output and Sydney midnight rollover in both summer and winter. The Svelte MCP autofixer reported no issues in the updated dashboard.

The optimization was subsequently committed as `fad72e8` and deployed. Production retest results follow; the initial baseline above is retained for comparison.

## Optimized production retest — 3 November 2026

The canonical production deployment was confirmed before and after testing:

- Deployment: `4797357f-56c6-4064-adf1-0be91ec27224`.
- Commit: `fad72e8ca8129ecbeacfe49e161a135f12730f09`.
- Target: `https://cii-community-portal.pages.dev/`.
- Batch 1: 33 sequential GETs during `2026-11-03T02:18:49.779567Z`–`2026-11-03T02:18:57.616282Z` (13:18:49–13:18:57 AEDT).
- Batch 2: 33 sequential GETs during `2026-11-03T02:21:14.101494Z`–`2026-11-03T02:21:21.460995Z` (13:21:14–13:21:21 AEDT).

Every request returned HTTP 200. Cloudflare's Pages-specific analytics, filtered to script `pages-worker--22880205-production` and the individual request windows, reported:

| Sample                       | Requests | Errors | Median CPU | p95 CPU   | p99 CPU   |
| ---------------------------- | -------- | ------ | ---------- | --------- | --------- |
| Original deployment baseline | 33       | 0      | 5.054 ms   | 11.100 ms | 12.903 ms |
| Optimized batch 1            | 33       | 0      | 2.535 ms   | 20.151 ms | 20.966 ms |
| Optimized batch 2            | 33       | 0      | 2.054 ms   | 4.002 ms  | 5.253 ms  |
| Optimized combined sample    | 66       | 0      | 2.279 ms   | 7.934 ms  | 20.966 ms |

The combined sample was queried directly using the union of the two time windows; it is not an average of batch percentiles. The original baseline was re-queried with the explicit script name and returned the same 33 requests and CPU quantiles, resolving the earlier `__unknown__` attribution limitation for these comparisons.

The first batch had CPU spikes in its early seconds; subsequent requests were lower. This pattern is consistent with initialization or warm-up costs, but the analytics do not identify cold isolates or establish the cause. The second batch was added to check subsequent behavior, not to replace the first batch's result. Both samples are retained.

**Result:** production CPU improved in steady use, and the combined sample's p95 falls below the proposed 8 ms target and the 10 ms free-plan budget. All 66 measured invocations succeeded. The p99 still exceeds 10 ms, so this does not establish that every request stays within budget. Keep early-request spikes as a follow-up and repeat observations over normal traffic and after introducing live-mode auth/data loading. Do not treat this small, sequential, single-location smoke test as a load or geographic benchmark.

Additional checks outside the measured windows passed: SSR dashboard content was present; the referenced immutable JavaScript asset returned 200; a missing route returned 404. A fresh Chromium context hydrated with no page errors, retained dark theme after reload, and opened `/?module=Members` directly. Full production CRUD/draft/report smoke coverage remains separate. No application code, runtime settings or paid-plan changes were made during this retest.

Implementation order: runtime switch → generated types and parity → local adapter and actor helpers → asynchronous UI integration → full validation → authorized standalone release and measurement. Keep runtime and application refactors independently reviewable, but ship them together as Phase 2 once verified.
