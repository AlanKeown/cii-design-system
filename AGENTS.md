# Repository rules

## Commits and pushes

- Do not commit changes without the user's explicit authorization for that commit. Requests to implement, fix, finish, or validate work do not authorize committing.
- Obtain separate explicit authorization before pushing. Permission to commit does not authorize pushing.
- Leave changes uncommitted for review unless the user explicitly instructs otherwise.

## TypeScript for Svelte and SvelteKit

- Write all authored Svelte and SvelteKit code in TypeScript.
- Keep component filenames as `.svelte`. Every component script block must declare `lang="ts"`, including module scripts: `<script lang="ts">` and `<script module lang="ts">`. Components without scripts do not need a script block.
- Use `.ts` for routes, layouts, load functions, endpoints, hooks, utilities, tests, and configuration. Use `.svelte.ts` for shared reactive modules. Do not introduce `.js`, `.jsx`, `.mjs`, `.cjs`, or `.svelte.js` source files.
- Use TypeScript in Svelte/SvelteKit documentation examples and code snippets too.
- Preserve `strict: true` and `allowJs: false` in the relevant TypeScript configurations. Do not weaken type checking or add suppression directives to bypass this rule.
- When editing existing authored JavaScript in this scope, migrate it to TypeScript and update its imports and command references.
- Generated output, third-party dependencies, and vendored code are excluded. Generated JavaScript exports and references to compiled `.js` files may remain.
