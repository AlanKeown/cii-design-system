import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLeafletRuntime, MapController } from '../src/map-controller.ts';
import { FakeMapEngine } from '../src/testing.ts';
import type { EngineInit } from '../src/engine/types.ts';
import type { MapConfig } from '../src/config/types.ts';
import { LayerManager } from '../src/layers/manager.ts';
import { layer, renderers, mounted, gate } from './engine-fixtures.ts';
import { EngineRegistry } from '../src/engine/registry.ts';

function config(): MapConfig {
  return {
    engine: 'fake',
    view: { center: { crs: 'OGC:CRS84', coordinates: [151, -34] }, zoom: 14 },
    layers: [
      {
        id: 'sites',
        source: {
          provider: 'inline',
          crs: {
            code: 'OGC:CRS84',
            provenance: { kind: 'declared', by: 'test' }
          },
          data: {
            type: 'Feature',
            id: 'site',
            properties: {},
            geometry: { type: 'Point', coordinates: [151, -34] }
          }
        }
      }
    ]
  };
}
function runtimeWith(engine: typeof FakeMapEngine = FakeMapEngine) {
  const runtime = createLeafletRuntime();
  runtime.engines.register('fake', async () => ({ default: engine }));
  runtime.renderers.register('fake:features', {
    compatibility: () => undefined,
    prepare: (source) => ({ data: source.data })
  });
  return runtime;
}
const node = () => ({ clientWidth: 800, clientHeight: 600 }) as HTMLElement;

test('CRS switches preserve registrations, source provenance, UI settings and the live geographic view', async () => {
  const runtime = runtimeWith();
  const changes: string[] = [];
  let ready = 0;
  const controller = new MapController(node(), runtime, {
    onready: () => ready++,
    ondisplaycrschange: (change) => changes.push(change.current)
  });
  try {
    const original = config();
    await controller.applyConfig(original);
    const engine = controller.engine!;
    const registration = controller.layers.get('sites')!;
    const confirmed = registration.spec.source.crs;
    controller.updateLayer('sites', { visible: false, opacity: 0.4, order: 7 });
    engine.setView({ center: [16800000, -4010000] });
    const before = engine.getView();
    const geographic = await runtime.transforms.prepare({
      source: 'EPSG:3857',
      target: 'EPSG:4326'
    });
    const expected = geographic.coordinate(before.center);
    await controller.setDisplayCrs('EPSG:4326');
    assert.notEqual(controller.engine, engine);
    assert.equal(controller.layers.get('sites'), registration);
    assert.deepEqual(registration.spec.source.crs, confirmed);
    assert.equal(registration.spec.visible, false);
    assert.equal(registration.spec.opacity, 0.4);
    assert.equal(registration.spec.order, 7);
    assert.ok(
      Math.abs(controller.engine!.getView().center[0] - expected[0]) < 1e-8
    );
    assert.ok(
      Math.abs(controller.engine!.getView().center[1] - expected[1]) < 1e-8
    );
    assert.equal(controller.snapshot().displayCrs, 'EPSG:4326');
    assert.equal(controller.snapshot().switching, false);
    // An unchanged original zoom declaration must not be reinterpreted in degree units.
    await controller.applyConfig({
      ...original,
      display: { crs: 'EPSG:4326' }
    });
    assert.equal(registration.spec.opacity, 0.4);
    assert.equal(registration.spec.visible, false);
    await controller.setDisplayCrs('EPSG:3857');
    assert.ok(
      Math.abs(
        controller.engine!.getView().resolution / before.resolution - 1
      ) < 1e-7
    );
    assert.deepEqual(changes, ['EPSG:4326', 'EPSG:3857']);
    assert.equal(ready, 3);
  } finally {
    controller.destroy();
  }
});

test('failed replacement mounts and layer preparation leave the old map and handles intact', async () => {
  for (const failure of ['mount', 'renderer']) {
    class FailingEngine extends FakeMapEngine {
      override async mount(container: HTMLElement, init: EngineInit) {
        if (failure === 'mount' && init.displayCrs.code === 'EPSG:4326')
          throw new Error('Synthetic mount failure');
        await super.mount(container, init);
      }
    }
    const runtime = runtimeWith(FailingEngine);
    const renderer = runtime.renderers.require('fake:features');
    renderer.prepare = (source, context) => {
      if (failure === 'renderer' && context.displayCrs.code === 'EPSG:4326')
        throw new Error('Synthetic prepare failure');
      return { data: source.data };
    };
    const controller = new MapController(node(), runtime);
    try {
      await controller.applyConfig(config());
      const engine = controller.engine!,
        before = engine.getView();
      const registration = controller.layers.get('sites')!;
      await assert.rejects(controller.setDisplayCrs('EPSG:4326'), {
        code: 'DISPLAY_CRS_SWITCH_BLOCKED'
      });
      assert.equal(controller.engine, engine);
      assert.deepEqual(engine.getView(), before);
      assert.equal(registration.status, 'ready');
      registration.setOpacity(0.3);
      assert.equal(registration.spec.opacity, 0.3);
      assert.equal(controller.snapshot().displayCrs, 'EPSG:3857');
      assert.equal(controller.snapshot().switching, false);
    } finally {
      controller.destroy();
    }
  }
});

test('removed fixed-grid staged edit targets block before mutation', async () => {
  const runtime = runtimeWith();
  const controller = new MapController(node(), runtime);
  try {
    await controller.applyConfig(config());
    const engine = controller.engine!,
      before = engine.getView();
    const grid = await runtime.crs.resolve('EPSG:3857');
    const target = {
      ...layer('staged-target'),
      source: {
        ...layer('staged-target').source,
        renderKind: 'raster-tiles',
        spatial: {
          type: 'fixed-grid' as const,
          crs: grid.code,
          grid: grid.tileMatrix!
        }
      }
    };
    const release = controller.layers.retainStagedTarget(target);
    await assert.rejects(
      controller.setDisplayCrs('EPSG:4326'),
      (error: unknown) => {
        assert.equal(
          (error as { code: string }).code,
          'DISPLAY_CRS_SWITCH_BLOCKED'
        );
        assert.match((error as Error).message, /staged-target/);
        return true;
      }
    );
    assert.equal(controller.engine, engine);
    assert.deepEqual(engine.getView(), before);
    release();
    release();
    await controller.setDisplayCrs('EPSG:4326');
    assert.equal(controller.snapshot().displayCrs, 'EPSG:4326');
  } finally {
    controller.destroy();
  }
});

test('staged attachment detects changed layer state and disposes late uncooperative work', async () => {
  const old = await mounted();
  const replacement = await mounted();
  const entered = gate<void>(),
    complete = gate<{ data: unknown; dispose(): void }>();
  let slow = false,
    disposed = 0;
  const manager = new LayerManager({
    renderers: renderers({
      compatibility: () => undefined,
      prepare: (source) => {
        if (!slow) return { data: source.data };
        entered.resolve();
        return complete.promise;
      }
    })
  });
  try {
    const entry = manager.add(layer('sites'));
    await manager.attach(old.engine, old.display);
    await entry.ready;
    slow = true;
    const abort = new AbortController();
    const task = manager.prepareDisplayCrsSwitch(
      replacement.engine,
      replacement.display,
      { signal: abort.signal }
    );
    await entered.promise;
    abort.abort();
    await assert.rejects(task);
    complete.resolve({
      data: entry.spec.source.data,
      dispose: () => disposed++
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(disposed, 1);
    assert.equal(entry.status, 'ready');
    entry.setOpacity(0.2);
    slow = false;
    const prepared = await manager.prepareDisplayCrsSwitch(
      replacement.engine,
      replacement.display,
      { signal: new AbortController().signal }
    );
    entry.setOrder(4);
    assert.throws(() => prepared.commit(), {
      code: 'DISPLAY_CRS_SWITCH_BLOCKED'
    });
    prepared.dispose();
    assert.equal(replacement.engine.layers.size, 0);
  } finally {
    manager.destroy();
    old.engine.destroy();
    replacement.engine.destroy();
  }
});

test('latest request wins a delayed engine load and cannot resurrect an obsolete CRS', async () => {
  const runtime = runtimeWith();
  const controller = new MapController(node(), runtime);
  try {
    await controller.applyConfig(config());
    const delay = gate<{ default: typeof FakeMapEngine }>();
    let calls = 0;
    // Registry entries are intentionally replaceable only by unregistering first.
    const registry = new EngineRegistry();
    registry.register('fake', () =>
      ++calls === 1
        ? delay.promise
        : Promise.resolve({ default: FakeMapEngine })
    );
    runtime.engines = registry;
    const first = controller.setDisplayCrs('EPSG:4326');
    while (!calls) await new Promise((resolve) => setTimeout(resolve, 0));
    await controller.setDisplayCrs('OGC:CRS84');
    assert.equal(controller.snapshot().displayCrs, 'OGC:CRS84');
    delay.resolve({ default: FakeMapEngine });
    await first;
    assert.equal(controller.snapshot().displayCrs, 'OGC:CRS84');
  } finally {
    controller.destroy();
  }
});

test('a polar centre is refused rather than clipped during a switch to Web Mercator', async () => {
  const runtime = runtimeWith();
  const controller = new MapController(node(), runtime);
  try {
    await controller.applyConfig({
      ...config(),
      display: { crs: 'EPSG:4326' },
      view: {
        center: { crs: 'OGC:CRS84', coordinates: [0, 89] },
        resolution: 0.01
      }
    });
    const before = controller.engine!;
    await assert.rejects(controller.setDisplayCrs('EPSG:3857'), {
      code: 'DISPLAY_CRS_SWITCH_BLOCKED'
    });
    assert.equal(controller.engine, before);
    assert.deepEqual(before.getView().center, [0, 89]);
  } finally {
    controller.destroy();
  }
});
