# CII Design System

A SveltePress documentation site and a SvelteKit 3 reference portal, consuming
shared Svelte 5 components and design tokens.

## Requirements and quick start

Use Node.js 22.17 or newer. `.nvmrc` selects Node 24. Install dependencies from
the repository root.

```sh
npm ci
npm run build:packages
npm run dev
```

Documentation: <http://localhost:5188>

Start the portal in another terminal:

```sh
npm run dev:portal
```

Portal: <http://localhost:5187>

## Repository layout

```text
apps/
  docs/                 SveltePress pages, live examples and docs tests
  community-portal/     Common Ground demo application and regression tests
packages/
  tokens/               JSON token source and generated CSS
  svelte/               Typed, reusable Svelte components
docs/
  product-design-spec.md
  mapping-components-spec.md   Plan for Leaflet, MapLibre and OpenLayers map components
```

The initial shared library exports **Button, TextField, Alert and StatusChip**.
Both applications use the same implementation. Portal-specific record logic,
tables, dialogs and navigation remain in the portal app; this migration does not
claim a complete design-system component catalogue.

Portal code lives under `apps/community-portal/src/lib`: `model.ts` defines the
record types; `records.ts` validates forms and records; `persistence.ts`
validates and versions browser storage; `reporting.ts` handles report filtering
and CSV downloads. `components/` contains the dashboard, record form, detail
drawer and reports view. The route owns navigation and workspace state.

Existing workspace and draft storage keys remain supported. Valid legacy records
are upgraded on load. Invalid saved workspaces pause automatic saving and leave
the original value intact; replacing it requires an explicit recovery action.
Invalid drafts keep the current form entries intact.

## Commands

| Command                                    | Purpose                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| `npm run dev`                              | Start SveltePress docs on port 5188                           |
| `npm run dev:portal`                       | Start the portal on port 5187                                 |
| `npm run build:packages`                   | Generate tokens and build component package/type declarations |
| `npm run check`                            | Build packages, then check both apps and library              |
| `npm run build`                            | Build packages, static docs and the Cloudflare portal         |
| `npm test`                                 | Run unit, production browser and async component tests        |
| `npm run test:portal`                      | Portal browser regressions                                    |
| `npm run test:docs`                        | Documentation browser tests                                   |
| `npm run format`                           | Format application and package sources                        |
| `npm run lint:markdown`                    | Check authored Markdown with the shared editor/CI rules       |
| `npm run preview -w @cii/docs`             | Preview built docs on port 4188                               |
| `npm run preview -w @cii/community-portal` | Preview the Cloudflare portal with Wrangler on port 4187      |

Markdown prose wraps at 80 columns. Tables, code examples and headings may be
wider. The lint configuration permits SveltePress imports and live examples;
generated pages and test output follow `.gitignore`. The generated accuracy
report retains its exact generator output. Run `npm run lint:markdown -- --fix`
for automatic Markdown fixes.

Run `npm run test:unit` for the storage, validation and record-operation tests
without a browser or build. Run `npm run build` before browser tests. Install
Chromium once with `npx playwright install chromium` (on a fresh Linux host,
`npx playwright install --with-deps chromium` also installs browser system
dependencies). Tests start and stop their own production preview servers; keep
ports 4186 (isolated component harness), 4187 (Wrangler portal) and 4188 (docs)
available.

`npm run db:types` regenerates the checked-in public database types from the
local Supabase database (Docker and `npm run db:start` are required). CI
compares regeneration against the checked-in file, and the portal type check
enforces enum parity. Generation preserves the previous file if the CLI fails.
The portal still stores fictional data only in the browser: the local backend
owns workspace operations and explicit saving; no Supabase runtime configuration
is needed yet.

After building the portal, `npm run profile:portal:ssr` measures CPU for its
built server renders under Node; append `-- --instrument` to count
locale-formatting work. This is a local comparison tool, not a measurement of
Cloudflare CPU usage. Production CPU acceptance still requires a deployed smoke
test.

SveltePress's Pagefind search index is generated during the production build.
Development mode intentionally displays a search-index notice.

## Use the library

Import `@cii/tokens/tokens.css` once in the consuming layout, then wrap
components in `data-cii-theme="light"` or `data-cii-theme="dark"`.

```svelte
<script lang="ts">
  import '@cii/tokens/tokens.css';
  import { Button, TextField } from '@cii/svelte';
  let name = $state('');
</script>

<div data-cii-theme="light">
  <TextField id="member-name" label="Member name" bind:value={name} />
  <Button onclick={() => console.log(name)}>Save member</Button>
</div>
```

Tokens are maintained in `packages/tokens/tokens.json`. Regenerate CSS with
`npm run build -w @cii/tokens`. Components use scoped styles and namespaced
tokens, without importing the portal's global stylesheet.

The library's development export uses source files for live reload. Production
exports use built components and generated declarations. Both are included when
packaging. These packages are workspace-local and have not been published.

To produce tarballs for a separate application:

```sh
npm run build:packages
npm pack -w @cii/tokens
npm pack -w @cii/svelte
```

Install both tarballs together in the consuming Svelte application.

## SvelteKit 3 migration

- SvelteKit 3.1, Vite 8, Svelte 5.57+, vite-plugin-svelte 7 and TypeScript 6.
- Application configuration moved from `svelte.config.js` to Vite plugin
  options.
- Documentation registers `sveltepress({ svelteKitOptions })` once; the portal
  registers `sveltekit()`.
- Application imports use declared `#lib/*` subpath imports.
- App TypeScript configurations extend `$app/tsconfig`. All application scripts,
  tooling and browser tests use TypeScript with strict checking. `npm run check`
  checks the root tooling as well as every workspace. Node runs the token
  builder and preview server directly from their `.ts` sources.
- Docs use `@sveltejs/adapter-static` 4. The portal uses
  `@sveltejs/adapter-cloudflare` 8 and Wrangler 4.156.0, with SSR enabled.
- Portal module navigation uses query parameters and SvelteKit shallow
  navigation. Existing module-fragment bookmarks are still read at startup.
- Browser persistence keys are unchanged. Existing demo data remains available
  when using the same hostname and port as before.
- `npm run dev` now starts the documentation; use `npm run dev:portal` for the
  original application.

The original specification is preserved in `docs/product-design-spec.md`. The
documentation includes component APIs, accessibility guidance, record-form
patterns and migration notes.

## Deployment

Documentation sites deploy to GitHub Pages from
`.github/workflows/deploy-docs.yml` after the Verify workflow passes for a push
to `main`. Manual runs from the Actions tab must select `main`; both automatic
and manual deployments require the selected commit’s latest push-triggered
Verify run to have succeeded. Each site is published under its own subpath of
the repository's Pages site; the design system docs are at
`https://alankeown.github.io/cii-design-system/design-system/`. The site-wide
`index.html` (a redirect to the docs) and `404.html` live in `pages/`, where
`__PAGES_BASE__` is replaced with `/<repo>` at deploy time. Set `BASE_PATH` when
building to match the published path:

```sh
BASE_PATH=/cii-design-system/design-system npm run build --workspace @cii/docs
BASE_PATH=/cii-design-system/design-system npm run preview --workspace @cii/docs
BASE_PATH=/cii-design-system/design-system npm run test:docs
```

Without `BASE_PATH`, the docs build, preview and tests serve from `/`. To add
another docs site, build it with its own `BASE_PATH` and copy its build into
`_site/<site>/` in the deploy workflow, then add it to the links in
`pages/404.html`.

The
[design documents](https://alankeown.github.io/cii-design-system/design-system/design/)
are published within the same site. Edit their originals in `docs/`;
`scripts/design-documents.ts` defines the published collection, titles, status
and routes. `npm run sync:design --workspace @cii/docs` generates the ignored
`apps/docs/src/routes/design/` pages and rewrites document links for the
deployed base path. The docs dev, check and build commands run this
automatically, and the dev server watches source document edits. Code fences
(including Mermaid diagram source) are displayed as highlighted examples. The
earlier mapping specification remains available in the Archive with its
superseded notice.

The community portal is live at
[cii-community-portal.pages.dev](https://cii-community-portal.pages.dev).
`.github/workflows/deploy-portal.yml` uploads `.svelte-kit/cloudflare` from the
portal workspace to the existing Cloudflare Pages project `cii-community-portal`
after successful verification on `main`. Manual deployments have the same branch
and verification requirements as the docs workflow. Both workflows deploy the
exact commit they checked, rather than whichever commit is newest when the job
starts.

The portal uses Cloudflare Pages Direct Upload through GitHub Actions; it does
not require Cloudflare’s native GitHub integration. Configure repository Actions
secrets `CLOUDFLARE_API_TOKEN` (Cloudflare Pages Edit access for the target
account) and `CLOUDFLARE_ACCOUNT_ID`. `GITHUB_TOKEN` is supplied automatically
by GitHub. The deployment action and Wrangler version are explicitly selected in
the workflow. The documentation navbar and portal guide link to the live demo.

## Verification and limitations

`npm run check:typescript` enforces the rules in `AGENTS.md`: authored
JavaScript files and Svelte script blocks without `lang="ts"` are rejected,
including documentation examples. Generated output and third-party directories
are excluded. The check also preserves strict TypeScript settings and runs as
part of `npm run check` in CI.

Browser tests cover record validation/persistence, member program assignment,
theme persistence, case closure, filtering, CSV downloads, role previews,
command search and responsive navigation. Keyboard regressions cover dialog
names and modality, focus wrapping/restoration and transitions, error-summary
focus and field links, drawer tab navigation, table sorting/mixed selection and
live result announcements. Documentation tests exercise live components,
validation associations, dynamic alerts, production search and narrow-screen
layout. Automated tests do not constitute WCAG certification.

The portal remains a front-end demo using fictional records in browser storage.
Authentication, server-side permissions, durable storage, trusted audit logging,
document uploads, individual attendance, XLSX/PDF exports and the remaining
specification work require further implementation.

The root toolchain and dependency overrides ensure that every workspace resolves
SvelteKit 3. SveltePress’s optional PWA dependency otherwise pulls in SvelteKit
2 during a clean npm install. PWA support is not enabled. The enhanced-img
override selects the Vite 8-compatible 1.x release and its updated
image-processing dependencies. Review these overrides when upgrading
SveltePress. Review dependency audit findings when updating the lockfile.

## Upstream references

- [SvelteKit 3 migration](https://svelte.dev/docs/kit/migrating-to-sveltekit-3)
- [SveltePress setup](https://sveltepress.site/guide/quick-start/)
- [SveltePress local search](https://sveltepress.site/guide/default-theme/search/)

The docs production preview serves the actual static adapter output with sirv,
including the Pagefind assets written after SvelteKit builds. The portal
production preview uses `wrangler pages dev` and its generated asset exclusions.
This avoids the missing search index in Vite’s intermediate-output preview.
