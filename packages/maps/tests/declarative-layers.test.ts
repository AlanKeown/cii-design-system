import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMapRuntime, MapController } from '../src/map-controller.ts';
import { FakeMapEngine } from '../src/testing.ts';
import { MapError } from '../src/errors.ts';
import { layer, gate } from './engine-fixtures.ts';
import type { MapConfig } from '../src/config/types.ts';
import type { ManagedLayer, PreparedLayer } from '../src/layers/types.ts';
const config: MapConfig = {
  engine: 'fake',
  view: { center: { crs: 'OGC:CRS84', coordinates: [151, -34] }, zoom: 14 },
  layers: []
};
function setup(callbacks: ConstructorParameters<typeof MapController>[2] = {}) {
  const runtime = createMapRuntime();
  runtime.engines.register('fake', async () => ({ default: FakeMapEngine }));
  runtime.renderers.register('fake:features', {
    compatibility: () => undefined,
    prepare: (source) => ({ data: source.data })
  });
  const controller = new MapController(
    { clientWidth: 800, clientHeight: 600 } as HTMLElement,
    runtime,
    callbacks
  );
  return { runtime, controller };
}
async function settled(handle: ManagedLayer) {
  await handle.ready;
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test('declarative ownership survives config reconciliation and participates in shared controls and attribution', async () => {
  const { controller } = setup();
  try {
    await controller.applyConfig(config);
    const spec = { ...layer('child'), attribution: 'Child attribution' };
    const child = controller.registerLayer(spec);
    await settled(child);
    assert.deepEqual(controller.snapshot().attributions, ['Child attribution']);
    const original = controller.layers.get('child');
    await controller.applyConfig({
      ...config,
      controls: [{ id: 'zoom' }, { id: 'layer-list' }]
    });
    assert.equal(controller.layers.get('child'), original);
    controller.updateLayer('child', {
      visible: false,
      opacity: 0.25,
      order: 5
    });
    assert.equal(child.spec.visible, false);
    assert.deepEqual(controller.snapshot().attributions, []);
    assert.equal(controller.snapshot().layers[0].opacity, 0.25);
    child.setVisible(true);
    assert.deepEqual(controller.snapshot().attributions, ['Child attribution']);
    child.remove();
    child.remove();
    assert.deepEqual(controller.snapshot().layers, []);
    assert.equal(controller.layers.size, 0);
  } finally {
    controller.destroy();
  }
});

test('declarative and config IDs cannot collide, and a rejected config preserves existing layers', async () => {
  const { controller } = setup();
  try {
    await controller.applyConfig(config);
    const child = controller.registerLayer(layer('child'));
    await settled(child);
    assert.throws(() => controller.registerLayer(layer('child')), {
      code: 'LAYER_DUPLICATE'
    });
    const configured = {
      id: 'child',
      source: {
        provider: 'inline' as const,
        crs: {
          code: 'EPSG:3857',
          provenance: { kind: 'declared' as const, by: 'fixture' }
        },
        data: child.spec.source.data
      }
    };
    await assert.rejects(
      controller.applyConfig({ ...config, layers: [configured] }),
      { code: 'LAYER_DUPLICATE' }
    );
    assert.equal(child.status, 'ready');
    child.remove();
    await controller.applyConfig({ ...config, layers: [configured] });
    assert.throws(() => controller.registerLayer(layer('child')), {
      code: 'LAYER_DUPLICATE'
    });
    assert.equal(controller.layers.size, 1);
  } finally {
    controller.destroy();
  }
});

test('declarative layers survive a CRS switch with their provenance, settings and updated accuracy', async () => {
  const { controller } = setup();
  try {
    await controller.applyConfig(config);
    const child = controller.registerLayer(layer('child'));
    await settled(child);
    child.setOpacity(0.4);
    await settled(child);
    const provenance = child.spec.source.crs;
    await controller.setDisplayCrs('EPSG:4326');
    assert.equal(child.status, 'ready');
    assert.deepEqual(child.spec.source.crs, provenance);
    assert.equal(child.spec.opacity, 0.4);
    assert.equal(
      controller.snapshot().layers[0].accuracy.target.code,
      'EPSG:4326'
    );
    child.remove();
    assert.equal(controller.layers.size, 0);
  } finally {
    controller.destroy();
  }
});

test('renderer failures report once per attempt and retry clears the shared error', async () => {
  let fail = true;
  const errors: MapError[] = [],
    ownErrors: MapError[] = [];
  const { controller, runtime } = setup({
    onlayererror: (error) => errors.push(error)
  });
  runtime.renderers.require('fake:features').prepare = (source) => {
    if (fail) throw new MapError('LAYER_LOAD_FAILED');
    return { data: source.data };
  };
  try {
    await controller.applyConfig(config);
    const child = controller.registerLayer(layer('child'), {
      onerror: (error) => ownErrors.push(error)
    });
    await assert.rejects(child.ready);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(errors.length, 1);
    assert.equal(ownErrors.length, 1);
    assert.equal(controller.snapshot().layerErrors.length, 1);
    fail = false;
    child.reload();
    await settled(child);
    assert.equal(controller.snapshot().layerErrors.length, 0);
    child.remove();
  } finally {
    controller.destroy();
  }
});

test('removing a pending declarative layer disposes late preparation and does not resurrect metadata', async () => {
  const pending = gate<PreparedLayer>();
  let disposed = 0;
  const errors: MapError[] = [];
  const { controller, runtime } = setup({
    onlayererror: (error) => errors.push(error)
  });
  runtime.renderers.require('fake:features').prepare = () => pending.promise;
  try {
    await controller.applyConfig(config);
    const child = controller.registerLayer(layer('child'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    await assert.rejects(controller.setDisplayCrs('EPSG:4326'), {
      code: 'DISPLAY_CRS_SWITCH_BLOCKED'
    });
    child.remove();
    pending.resolve({
      data: { type: 'FeatureCollection', features: [] },
      dispose: () => disposed++
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(disposed, 1);
    assert.equal(controller.layers.size, 0);
    assert.deepEqual(controller.snapshot().layers, []);
    assert.deepEqual(errors, []);
  } finally {
    controller.destroy();
  }
});
