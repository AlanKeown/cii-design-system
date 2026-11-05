import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLeafletRuntime, MapController } from '../src/map-controller.ts';
import { FakeMapEngine } from '../src/testing.ts';
import { features, layer } from './engine-fixtures.ts';
import type { MapConfig } from '../src/config/types.ts';
import type { MapError } from '../src/errors.ts';

test('config reconciles a manager registration missing from controller records', async () => {
  const runtime = createLeafletRuntime();
  runtime.engines.register('fake', async () => ({ default: FakeMapEngine }));
  runtime.renderers.register('fake:features', {
    compatibility: () => undefined,
    prepare: (source) => ({ data: source.data })
  });
  const errors: MapError[] = [];
  const controller = new MapController(
    { clientWidth: 800, clientHeight: 600 } as HTMLElement,
    runtime,
    { onlayererror: (error) => errors.push(error) }
  );
  const config: MapConfig = {
    engine: 'fake',
    view: { center: { crs: 'EPSG:3857', coordinates: [0, 0] }, zoom: 12 },
    layers: []
  };
  try {
    await controller.applyConfig(config);
    // Simulate a registration left behind before controller bookkeeping completed.
    const orphan = controller.layers.add(layer('added'));
    await orphan.ready;
    config.layers = [
      {
        id: 'added',
        source: {
          provider: 'inline',
          data: features(2),
          crs: {
            code: 'EPSG:3857',
            provenance: { kind: 'declared', by: 'test' }
          }
        }
      }
    ];
    await controller.applyConfig(config);
    assert.equal(orphan.status, 'removed');
    assert.equal(controller.layers.size, 1);
    assert.deepEqual(
      controller.snapshot().layers.map((entry) => entry.id),
      ['added']
    );
    await controller.applyConfig(config);
    assert.equal(controller.layers.size, 1);
    assert.deepEqual(errors, []);
  } finally {
    controller.destroy();
  }
});
