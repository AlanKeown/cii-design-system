---
title: SvelteKit 3 migration
description: SvelteKit 3 migration in the CII Design System.
---

This release moves the original portal into a workspace and adds SveltePress
documentation.

## Framework changes

- Both applications use SvelteKit 3, Vite 8 and Svelte 5.
- TypeScript uses the 6.x line supported by the Svelte packaging tool.
- SvelteKit configuration now lives in each application's Vite plugin options.
- The documentation uses `sveltepress({ svelteKitOptions })`; it does not
  register a second `sveltekit()` plugin.
- `#lib/*` imports replace the portal's former `$lib/*` alias.
- Application TypeScript configurations extend `$app/tsconfig`.
- Both apps use the SvelteKit 3 static adapter.

## Commands

| Previously                      | Now                                                     |
| ------------------------------- | ------------------------------------------------------- |
| `npm run dev` opened the portal | Opens SveltePress documentation                         |
| Portal development              | `npm run dev:portal`                                    |
| `npm run build`                 | Builds shared packages and both applications            |
| `npm run check`                 | Checks both apps and the shared component library       |
| `npm test`                      | Runs portal regressions and documentation browser tests |

## Documentation search

SveltePress generates the local Pagefind search index during production builds.
Development mode displays a notice rather than full search results. Use a
production preview to verify search.

## Sources

- [SvelteKit 3 migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3)
- [SveltePress setup](https://sveltepress.site/guide/quick-start/)
- [SveltePress search](https://sveltepress.site/guide/default-theme/search/)
