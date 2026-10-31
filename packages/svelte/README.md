# @cii/svelte

Shared Svelte 5 components for the CII Design System: Button, TextField, Alert and StatusChip.

Import `@cii/tokens/tokens.css` once and set `data-cii-theme="light"` or `data-cii-theme="dark"` on a containing element. Components are independent of SvelteKit, browser persistence and portal business rules.

Build with `npm run build -w @cii/svelte` from the workspace root. The public exports include generated TypeScript declarations. Development imports resolve to source for live reload; production imports resolve to dist.

See the SveltePress documentation under `apps/docs` for APIs, live examples, accessibility guidance and limitations. The package has not been published.
