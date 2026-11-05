---
title: Get started
description: Get started in the CII Design System.
---

Use Node.js **22.17 or later**. The repository includes an `.nvmrc` for Node 24
and an npm lockfile.

## Run the workspace

From the repository root:

```sh
npm ci
npm run build:packages
npm run dev
```

The documentation opens at **<http://localhost:5188>**.

In another terminal, start the reference portal:

```sh
npm run dev:portal
```

The portal opens at **<http://localhost:5187>**. Existing demo records remain in
the same browser storage key when you use the same origin.

## Use the component library

Both workspace applications depend on `@cii/svelte` and `@cii/tokens`. Import
the token stylesheet once in your application layout:

```svelte
<script lang="ts">
  import '@cii/tokens/tokens.css';
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<div data-cii-theme="light">
  {@render children()}
</div>
```

Import components where you need them:

```svelte
<script lang="ts">
  import { Button, TextField } from '@cii/svelte';
  let name = $state('');
</script>

<TextField id="member-name" label="Member name" bind:value={name} />
<Button onclick={() => console.log(name)}>Save member</Button>
```

The package names currently resolve through npm workspaces. They have not been
published to a registry. To use them outside the repository, build and pack both
packages, then install the generated tarballs.

## Check and build

```sh
npm run check
npm run build
npm test
```

For a fresh browser-test setup, run `npx playwright install chromium` first.
Browser tests use the production builds, including the generated documentation
search index.

The static outputs are `apps/docs/build` and `apps/community-portal/build`. Each
can be hosted separately. Preview the documentation with
`npm run preview -w @cii/docs`.

## Workspace boundaries

The shared package exports Button, TextField, Alert and StatusChip. Other
[component guides](/components/) describe application contracts with semantic
examples; they are not additional package imports. Start with
[Patterns](/patterns/) when composing a complete workflow, then read its linked
controls and their implementation limits.

- `apps/docs`: SveltePress navigation, Markdown pages and example wrappers.
- `apps/community-portal`: business workflows, demo records and persistence.
- `packages/svelte`: typed, reusable Svelte components.
- `packages/tokens`: token source and generated CSS custom properties.
