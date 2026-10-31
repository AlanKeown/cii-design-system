import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFile } from './check-typescript.ts';

test('authored JavaScript routes, modules, config and JSX are rejected', async () => {
  for (const file of [
    'apps/portal/src/routes/+page.js',
    'apps/portal/src/state.svelte.js',
    'apps/docs/vite.config.mjs',
    'scripts/tool.cjs',
    'packages/svelte/src/Widget.jsx'
  ]) {
    assert.equal((await checkFile(file, '')).length, 1, file);
  }
});

test('generated and third-party JavaScript is excluded', async () => {
  for (const file of [
    'apps/docs/.svelte-kit/output/client/index.js',
    'packages/svelte/dist/index.js',
    'apps/portal/build/index.js',
    'node_modules/dependency/index.js',
    'vendor/example.js'
  ]) {
    assert.deepEqual(await checkFile(file, ''), [], file);
  }
});

test('both instance and module scripts must explicitly use TypeScript', async () => {
  assert.equal(
    (
      await checkFile(
        'Example.svelte',
        '<script>let name = "Example";</script>'
      )
    ).length,
    1
  );
  assert.equal(
    (
      await checkFile(
        'Example.svelte',
        '<script module>export const value = 1;</script><script lang="ts">let name = "Example";</script>'
      )
    ).length,
    1
  );
  assert.equal(
    (
      await checkFile(
        'Example.svelte',
        '<script context="module" lang="js">export const value = 1;</script>'
      )
    ).length,
    1
  );
  assert.deepEqual(
    await checkFile(
      'Example.svelte',
      '<script module lang="ts">export const value: number = 1;</script><script\n lang=\'ts\'>let name: string = "Example";</script>'
    ),
    []
  );
});

test('scriptless components and comments containing script examples are allowed', async () => {
  assert.deepEqual(await checkFile('Example.svelte', '<p>Hello</p>'), []);
  assert.deepEqual(
    await checkFile(
      'Example.svelte',
      '<!-- <script>ignored</script> --><p>Hello</p>'
    ),
    []
  );
});

test('live Markdown scripts and Svelte snippets are checked independently', async () => {
  const source =
    '<script lang="ts">import Example from "./Example.svelte";</script>\n\n```svelte\n<script>let count = 0;</script>\n```';
  assert.equal((await checkFile('guide.md', source)).length, 1);
  assert.deepEqual(
    await checkFile(
      'guide.md',
      source.replace('<script>let count', '<script lang="ts">let count')
    ),
    []
  );
  assert.equal(
    (await checkFile('guide.md', '```javascript\nconst value = 1;\n```'))
      .length,
    1
  );
});

test('strict checking and JavaScript exclusion cannot be weakened', async () => {
  assert.deepEqual(
    await checkFile(
      'apps/docs/tsconfig.json',
      '{ "compilerOptions": { "strict": true, "allowJs": false } }'
    ),
    []
  );
  assert.equal(
    (
      await checkFile(
        'apps/docs/tsconfig.json',
        '{ "compilerOptions": { "strict": false, "allowJs": true } }'
      )
    ).length,
    2
  );
  assert.equal((await checkFile('tsconfig.json', '{}')).length, 2);
});
