import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRegistries, isConformantPersistence } from '../src/index.ts';
import { createLeafletRuntime } from '../src/map-controller.ts';
import type { PersistenceAdapter } from '../src/index.ts';

test('registry collections are isolated, ordered, and share the live CRS provider registry', async () => {
  const first = createRegistries({ australia: false });
  const second = createRegistries();
  assert.equal(first.crsProviders, first.crs.providers);
  assert.ok(first.sources.get('inline'));
  assert.ok(first.sources.get('geojson'));
  assert.equal(first.engines.get('leaflet'), undefined);
  const definition = await second.crs.resolve('EPSG:7856');
  await assert.rejects(first.crs.resolve(definition.code));
  const unregister = first.crsProviders.register('external', {
    resolve: (code) => (code === definition.code ? definition : undefined)
  });
  assert.equal(await first.crs.resolve(definition.code), definition);
  unregister();
  await assert.rejects(first.crs.resolve(definition.code));
  first.exporters.register('custom', () => new Blob(['example']));
  assert.equal(second.exporters.get('custom'), undefined);
  assert.throws(() => first.exporters.register('custom', () => new Blob()));
});

test('Leaflet runtime uses the public collection and registers its renderer and engine', () => {
  const runtime = createLeafletRuntime();
  assert.ok(runtime.engines.get('leaflet'));
  assert.ok(runtime.renderers.get('leaflet:features'));
  assert.equal(runtime.crsProviders, runtime.crs.providers);
  for (const registry of [
    runtime.controls,
    runtime.captureModes,
    runtime.validators,
    runtime.persistence,
    runtime.exporters,
    runtime.styleCompilers
  ]) {
    assert.equal([...registry.values()].length, 0);
  }
});

test('persistence conformance requires authoritative transforms, database introspection and conflict checks', () => {
  const adapter: PersistenceAdapter = {
    describeTarget: async () => {
      throw new Error('not used');
    },
    commit: async () => ({ status: 'committed', results: [] }),
    capabilities: {
      atomicMultiFeature: true,
      optimisticConcurrency: 'version-column',
      authoritativeTransform: true,
      targetIntrospection: 'database',
      idempotentRetry: true
    }
  };
  assert.equal(isConformantPersistence(adapter), true);
  for (const override of [
    { authoritativeTransform: false },
    { targetIntrospection: 'declared' as const },
    { optimisticConcurrency: 'none' as const }
  ]) {
    assert.equal(
      isConformantPersistence({
        ...adapter,
        capabilities: { ...adapter.capabilities, ...override }
      }),
      false
    );
  }
});
