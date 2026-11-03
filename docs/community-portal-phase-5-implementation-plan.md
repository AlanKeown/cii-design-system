# Community portal backend: Phase 5 production release

Status: Release code prepared and locally validated on 3 November 2026. **Production account mode is not enabled.** Hosted Supabase access and release credentials are still required. Changes in this phase remain uncommitted.

## Confirmed release baseline

The deployed application is commit `71631b3f2d6d542ec6ffc3065b84c58a6b474b94` (the hydration fix). [Verify succeeded](https://github.com/AlanKeown/cii-design-system/actions/runs/41591570273) and [Deploy community portal succeeded](https://github.com/AlanKeown/cii-design-system/actions/runs/41591851206). Cloudflare reports production deployment `7cca62f0-d083-47d8-b826-ea0e8838f942`, with no auth bindings. The public root, auth and privacy pages returned HTTP 200 during the baseline check; the portal is still the browser-only demo.

The planned Supabase project is `kykbgwewulzceunbbsfa`, named `cii-community-portal` in Sydney. The saved local Supabase token lists only a different project, “Big Map Project”, and receives HTTP 404 for the planned project's Auth configuration. This does not establish whether the planned project was removed or is owned by another account. Supabase connection/access is pending; no hosted migrations or Auth changes have been applied in this phase.

## Completed preparation

- [x] Create the managed Turnstile widget `cii-community-portal` for `cii-community-portal.pages.dev` and `localhost`. Public site key: `0x4AAAAAAFxoxhMwZgmLhc4U`. Its secret stays in Cloudflare until copied directly into Supabase Auth.
- [x] Restrict the existing GitHub `production` environment to the `main` branch. Save the public widget key there. Keep repository release flags `PORTAL_AUTH_ENABLED=false` and `PORTAL_KEEPALIVE_ENABLED=false`.
- [x] Preserve the exact-commit Verify deployment gate and add the production environment, release preflight, database dry-run/push, production-only Wrangler configuration and post-deploy HTTP smoke to `deploy-portal.yml`.
- [x] Add a production Auth settings manifest and guarded one-time operator command for OTP, redirect allowlist, Turnstile, SMTP and the versioned confirmation/Magic Link templates. Local `supabase/config.toml` remains the deterministic Mailpit/captcha-disabled configuration.
- [x] Add the twice-weekly keep-alive workflow, manual dispatch, bounded transient retries and timestamp validation. It needs only a publishable key, not a service-role key or database password.
- [x] Add release validation tests that reject partial configuration, mismatched projects, secret keys in public bindings, unrecognised/test widget keys, unsafe provider settings, missing templates and provider/callback mismatches.
- [x] Replace the stale Phase 3 sign-in description and add the public-demo/retention notice and essential cookie, provider and log information to privacy copy.

## Release inputs

GitHub repository variables:

| Variable                   | Current value / purpose                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORTAL_AUTH_ENABLED`      | `false`; set `true` only when hosted prerequisites are ready and the release code has passed Verify. `false` keeps the existing local-demo deployment path. |
| `PORTAL_KEEPALIVE_ENABLED` | `false`; enable the schedule after the first successful production heartbeat. Manual dispatch is available independently.                                   |

GitHub **production environment** secrets (both currently missing):

| Secret                  | Purpose                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Project-owner access for release preflight and linking. The existing local token cannot access the planned project. |
| `SUPABASE_DB_PASSWORD`  | Database migration connection only.                                                                                 |

Enter secrets through GitHub's production environment settings or `gh secret set NAME --repo AlanKeown/cii-design-system --env production`, which reads the value interactively. Do not paste them into chat or commit them.

GitHub **production environment** public variables:

| Variable                          | Value                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `SUPABASE_PROJECT_REF`            | Confirm the project reference before setting this. Planned: `kykbgwewulzceunbbsfa`.      |
| `PUBLIC_SUPABASE_URL`             | Must be `https://<SUPABASE_PROJECT_REF>.supabase.co`.                                    |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The hosted project's `sb_publishable_…` key; not an anon/service-role JWT or secret key. |
| `PUBLIC_TURNSTILE_SITE_KEY`       | Already set to `0x4AAAAAAFxoxhMwZgmLhc4U`.                                               |
| `PUBLIC_AUTH_GITHUB_ENABLED`      | Keep `false`/unset until a separate OAuth test app and real PKCE round trip have passed. |

Existing Cloudflare deployment credentials remain repository secrets. Supabase secret/service-role keys, the Resend sending key and Turnstile secret never become portal runtime bindings.

## Hosted configuration and rollout

1. Connect/access the correct Supabase account and confirm the project name, reference, Sydney region and healthy state. Do not substitute the unrelated project that the saved token can see.
2. Confirm an active asymmetric JWT signing key (ES256 or RS256), and that its public key is published in JWKS. The preflight checks published asymmetric keys; confirm the active signing key and a real issued token as part of the account smoke.
3. Confirm Resend's sending domain `auth.alankeown.id.au`, verified sender and disabled click/open tracking. SMTP uses `smtp.resend.com`, port 465 (587 is also accepted), user `resend`, sender `no-reply@auth.alankeown.id.au`. Verify delivery using the owner's test address. The historical plan records this setup as previously completed, but it has not been reverified with the currently available access.
4. Copy the **secret** for the new widget directly from Cloudflare into Supabase, or provide it to the one-time operator command as `TURNSTILE_SECRET_KEY`. Keep it out of files and logs. If an SMTP password is not already configured, supply the domain-scoped Resend sending key as `RESEND_SMTP_KEY` for that command, or enter it directly in Supabase.
5. With the public release inputs and project-owner token in the operator's environment, run:

   ```sh
   npm run configure:portal-auth
   ```

   This checks the target project's identity and region, then applies `supabase/production-auth.json` plus both versioned email templates. It preserves an existing SMTP password unless explicitly supplied, sends the widget secret only to Supabase Auth, and never prints provider configuration or secrets. It does not rotate signing keys or create a GitHub OAuth app. Do not run `supabase config push` from the local Mailpit configuration against production.

6. Add the GitHub production secrets/public variables listed above. Validate the release with:

   ```sh
   npm run prepare:portal-production
   ```

   The command refuses missing secrets, the wrong project/region, incomplete SMTP/OTP/captcha/redirect/template settings, absent asymmetric JWKS and an invalid publishable key. It writes only selected public bindings to ignored `apps/community-portal/.wrangler/production/wrangler.jsonc`. Production overrides are separate from the unconfigured preview/local environment. Wrangler Pages must run from this directory using `--cwd .wrangler/production` and target `--branch=main`; it rejects custom `--config` paths and the `--env` CLI flag. The committed base config and verified source SHA remain unchanged; the generated config points at the portal build output using an absolute path.

7. Review and commit the prepared code, then push, each with the user's separate explicit authorization. Keep live auth disabled while Verify runs. After Verify passes for the exact main SHA, set `PORTAL_AUTH_ENABLED=true` and dispatch Deploy community portal for `main`.
8. The gated release validates configuration, links the intended project, runs `db push --dry-run`, then `db push --yes` **before** deploying the Worker with the generated production config. Existing migrations are not edited. If a step fails, deployment stops; never bypass it with an unverified local build. For any future destructive migration, take the manual backup required by the backend plan first.
9. The workflow runs read-only post-deploy HTTP checks for signed-out redirects, JSON API 401, no-store, sign-in/Turnstile rendering, absence of token fields in HTML, privacy and unknown asset 404. This can also be run with `npm run smoke:portal-production`. These checks intentionally fail against the current unconfigured demo and are not a substitute for signing in.
10. Complete the real account smoke below. Dispatch Supabase keep-alive manually and confirm its returned timestamp matches the database heartbeat write. Then set `PORTAL_KEEPALIVE_ENABLED=true` and check its first scheduled run.

## Production acceptance still pending

- [ ] Hosted Supabase access, public key and migration credentials verified.
- [ ] Hosted migrations applied through the verified release workflow.
- [ ] Managed Turnstile challenge verified on the actual production origin, with the matching secret in Supabase. Do not replace it with test keys to make a production test pass.
- [ ] Real email delivery, code sign-in and cross-browser confirmation-link sign-in work; link-preview GET does not consume the link. Test expired/reused links and rate-limit recovery.
- [ ] Two fictional test accounts in separate browser contexts: records survive reload/sign-out/sign-in; invitation acceptance and role/organisation switching work; wrong-recipient invitation is refused.
- [ ] Check API write denial and a direct REST read/write attempt for the other organisation using the current user's own token. Board reports/CSV have no names, contact details, notes or relationship identifiers.
- [ ] Production cookies are HTTP-only, Secure and SameSite=Lax; refreshed/action/data responses remain private/no-store; no account token or account records enter browser-readable storage.
- [ ] Reset and account deletion work for the disposable test accounts, with owner-cascade behavior understood before confirmation.
- [ ] Manual and first scheduled heartbeat succeed. Check the database write, not only that Actions dispatched successfully.
- [ ] Repeat the comparable Cloudflare CPU sample with signed-in workspace, signed-out and refresh requests, and inspect Pages CPU metrics. Record the deployment ID, request mix, p50/p95/p99 and errors. Local Node timings and anonymous redirect-only timings do not establish authenticated Worker headroom.

Keep the prior production deployment available as a rollback target. Pages rollback does not undo database migrations. If a release is rolled back to browser-only mode, record that account workspaces are temporarily unavailable rather than implying account edits are saved locally.

## Validation of the prepared code

On 3 November 2026, repository checks and the complete build passed; **54 unit tests**, **36 existing browser tests** and **11 isolated live tests** passed. Official Svelte MCP checks of the two changed pages found no issues or suggestions. Formatting and diff whitespace checks passed. Wrangler 4.156.0's own configuration reader selected the production bindings and an empty preview binding set. The isolated local Worker returned HTTP 303 with the selected production bindings and HTTP 200 with preview bindings, using fictional public credentials; it does not contact hosted Supabase or publish a release.

Sources used for release behavior: [Cloudflare Pages environment overrides](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [Supabase Auth configuration API](https://supabase.com/docs/reference/api/v1-get-auth-service-config), [CAPTCHA configuration](https://supabase.com/docs/guides/auth/auth-captcha), and [database migration deployment](https://supabase.com/docs/guides/deployment/database-migrations).

Phase 5 remains incomplete until the pending production acceptance checks are recorded. No production account-mode deployment, hosted migration, production email, account smoke or heartbeat has been performed during this preparation.
