import assert from 'node:assert/strict';
import { test } from 'node:test';
import { protectExamples, rewriteDocumentLinks } from './sync-design-docs.ts';

test('inline template and Svelte examples display literally without executing expressions', () => {
  assert.equal(
    protectExamples('IDs: `${mapId}:${layerId}` and `<script lang="ts">`.'),
    'IDs: <code>$&#123;mapId&#125;:$&#123;layerId&#125;</code> and <code>&lt;script lang="ts"&gt;</code>.'
  );
  assert.equal(
    protectExamples(
      '```svelte\n<script lang="ts">\nconst id = `${mapId}`;\n</script>\n```'
    ),
    '```svelte\n<script lang="ts">\nconst id = `${mapId}`;\n</script>\n```'
  );
});

test('published links resolve between current and nested archive pages, preserving anchors', () => {
  const current = rewriteDocumentLinks(
    '[Earlier](./mapping-components-spec.md#scope)',
    'mapping'
  );
  const archive = rewriteDocumentLinks(
    '[Current](./svelte-mapping-components-development-plan.md)',
    'archive/mapping-spec'
  );
  const base = 'https://example.test/cii-design-system/design-system/design/';
  assert.ok(current.includes('../archive/mapping-spec/#scope'));
  assert.equal(
    new URL('../archive/mapping-spec/#scope', `${base}mapping/`).href,
    `${base}archive/mapping-spec/#scope`
  );
  assert.equal(archive, '[Current](../../mapping/)');
});

test('examples remain literal while prose links are rewritten', () => {
  const sample = '[Product](./product-design-spec.md)';
  const examples = `\`\`\`svelte\n${sample}\n\`\`\`\n~~~md\n${sample}\n~~~\n\`${sample}\``;
  assert.equal(rewriteDocumentLinks(examples, 'mapping'), examples);
  assert.equal(
    rewriteDocumentLinks(`${examples}\n${sample}`, 'mapping'),
    `${examples}\n[Product](../product/)`
  );
});

test('unpublished document links fail generation instead of publishing broken links', () => {
  assert.throws(
    () => rewriteDocumentLinks('[Missing](./missing.md)', 'mapping'),
    /Unpublished document link/
  );
});
