import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EngineRegistry,
  createCrsRegistry,
  assertDisplayCrs
} from '../src/index.ts';
import { FakeMapEngine, checkEngineConformance } from '../src/testing.ts';
import { features, gate, mounted, resolvedLayer } from './engine-fixtures.ts';
import type { MapPointerEvent } from '../src/index.ts';

test('engine registry loads lazily, creates fresh engines and rejects unknown/mismatched IDs', async () => {
  const registry = new EngineRegistry();
  let loads = 0;
  registry.register('fake', async () => {
    loads++;
    return { default: FakeMapEngine };
  });
  assert.equal(loads, 0);
  const first = await registry.create('fake');
  const second = await registry.create('fake');
  assert.notEqual(first, second);
  assert.equal(loads, 2);
  await assert.rejects(registry.create('missing'), {
    code: 'ENGINE_NOT_REGISTERED'
  });
  registry.register('wrong-id', async () => ({ default: FakeMapEngine }));
  await assert.rejects(registry.create('wrong-id'), {
    code: 'ENGINE_ID_MISMATCH'
  });
});

test('full adapter conformance runs against the mounted fake and destroys all resources', async () => {
  const { engine } = await mounted();
  assert.deepEqual(checkEngineConformance(engine, resolvedLayer()), []);
  assert.equal(engine.diagnostics.state, 'destroyed');
  assert.equal(engine.diagnostics.layers, 0);
  assert.equal(engine.diagnostics.sketches, 0);
  assert.equal(engine.diagnostics.listeners, 0);
  assert.throws(() => engine.getView(), { code: 'ENGINE_STATE' });
});

test('view events identify API/user changes and unsubscribe idempotently', async () => {
  const { engine } = await mounted();
  const sources: string[] = [];
  const off = engine.on('viewchange', ({ source }) => sources.push(source));
  engine.setView({ center: [20, 30], resolution: 4 });
  engine.userSetView({ center: [50, 60] });
  assert.deepEqual(sources, ['api', 'user']);
  off();
  off();
  engine.setView({ resolution: 10 });
  assert.deepEqual(sources, ['api', 'user']);
  const returned = engine.getView();
  assert.deepEqual(returned.center, [50, 60]);
  engine.destroy();
});

test('resize preserves centre and resolution and recomputes coordinate plumbing', async () => {
  const engine = new FakeMapEngine();
  const displayCrs = await createCrsRegistry().resolve('EPSG:3857');
  const container = { clientWidth: 800, clientHeight: 600 };
  await engine.mount(container, {
    displayCrs,
    view: { center: [5, 10], resolution: 2 }
  });
  container.clientWidth = 1000;
  container.clientHeight = 500;
  const sizes: number[] = [];
  engine.on('resize', ({ width }) => sizes.push(width));
  engine.resize();
  assert.deepEqual(engine.pixelToCoord([500, 250]), [5, 10]);
  assert.equal(engine.getView().resolution, 2);
  assert.deepEqual(sizes, [1000]);
  engine.destroy();
});

test('experimental and unsupported display CRS never silently fall back', async () => {
  const capabilities = {
    ...new FakeMapEngine().capabilities,
    displayCrs: () => 'experimental' as const
  };
  assert.throws(() => assertDisplayCrs(capabilities, 'EPSG:7856'), {
    code: 'DISPLAY_CRS_UNSUPPORTED'
  });
  assert.doesNotThrow(() => assertDisplayCrs(capabilities, 'EPSG:7856', true));
  const engine = new FakeMapEngine({
    capabilities: { displayCrs: () => 'unsupported' }
  });
  await assert.rejects(
    engine.mount(
      { clientWidth: 800, clientHeight: 600 },
      { displayCrs: await createCrsRegistry().resolve('EPSG:7856') }
    ),
    { code: 'DISPLAY_CRS_UNSUPPORTED' }
  );
  assert.equal(engine.diagnostics.state, 'new');
});

test('destroy or abort during an asynchronous mount prevents ready and late resurrection', async () => {
  for (const mode of ['destroy', 'abort'] as const) {
    const pending = gate<void>();
    const engine = new FakeMapEngine({ beforeMount: () => pending.promise });
    const abort = new AbortController();
    let ready = 0;
    engine.on('ready', () => ready++);
    const mounting = engine.mount(
      { clientWidth: 800, clientHeight: 600 },
      {
        displayCrs: await createCrsRegistry().resolve('EPSG:3857'),
        signal: abort.signal
      }
    );
    if (mode === 'destroy') engine.destroy();
    else abort.abort();
    pending.resolve();
    await assert.rejects(mounting, { code: 'ENGINE_MOUNT_ABORTED' });
    assert.equal(ready, 0);
    assert.equal(engine.diagnostics.listeners, 0);
    engine.destroy();
  }
});

test('layer handles patch data/style/order and stale removers cannot affect replacement layers', async () => {
  const { engine } = await mounted();
  const first = engine.addLayer(resolvedLayer());
  first.setData?.(features(2));
  first.setStyle({ fill: { color: 'red' } });
  first.setOrder(4);
  assert.equal(
    (engine.layers.get('points')?.data as ReturnType<typeof features>)
      .features[0].id,
    2
  );
  first.remove();
  const replacement = engine.addLayer(resolvedLayer());
  first.remove();
  assert.equal(engine.layers.size, 1);
  assert.throws(() => first.setVisible(false), { code: 'LAYER_REMOVED' });
  replacement.remove();
  engine.destroy();
});

test('interaction suspension is reference counted and all surfaces clean up on destroy', async () => {
  const { engine } = await mounted();
  const releaseA = engine.interaction.suspend([
    'dragPan',
    'dragPan',
    'keyboard'
  ]);
  const releaseB = engine.interaction.suspend(['dragPan']);
  releaseA();
  releaseA();
  assert.deepEqual(engine.diagnostics.suspended, ['dragPan']);
  releaseB();
  assert.deepEqual(engine.diagnostics.suspended, []);
  let pointers = 0;
  const off = engine.interaction.onPointer(() => pointers++);
  engine.interaction.onKey(() => {});
  engine.interaction.setCursor('crosshair');
  const event: MapPointerEvent = {
    type: 'click',
    pixel: [0, 0],
    coord: [0, 0],
    buttons: 1,
    pointerType: 'touch',
    modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    preventDefault() {}
  };
  engine.dispatchPointer(event);
  assert.equal(pointers, 1);
  off();
  off();
  engine.dispatchPointer(event);
  assert.equal(pointers, 1);
  const sketch = engine.interaction.sketch();
  sketch.setData(features());
  engine.destroy();
  sketch.remove();
  releaseA();
  releaseB();
  assert.equal(engine.diagnostics.sketches, 0);
  assert.equal(engine.diagnostics.listeners, 0);
  assert.equal(engine.diagnostics.cursor, null);
});

test('hit fixtures respect visibility, layer filters and pixel tolerance', async () => {
  const { engine } = await mounted();
  const handle = engine.addLayer(resolvedLayer());
  engine.setHitResults([
    { layerId: 'points', feature: features().features[0], distancePx: 3 }
  ]);
  assert.equal(
    engine.interaction.hitTest([0, 0], { tolerancePx: 4 }).length,
    1
  );
  assert.equal(
    engine.interaction.hitTest([0, 0], { tolerancePx: 2 }).length,
    0
  );
  assert.equal(
    engine.interaction.hitTest([0, 0], { tolerancePx: 4, layers: ['other'] })
      .length,
    0
  );
  handle.setVisible(false);
  assert.equal(
    engine.interaction.hitTest([0, 0], { tolerancePx: 4 }).length,
    0
  );
  engine.destroy();
});

test('reconfigure supports an explicit rebuild result and never changes state when refused', async () => {
  const next = await createCrsRegistry().resolve('EPSG:7856');
  const { engine } = await mounted({ reconfigure: 'rebuild-required' });
  assert.equal(
    await engine.reconfigure({ displayCrs: next }),
    'rebuild-required'
  );
  assert.equal(engine.diagnostics.displayCrs, 'EPSG:3857');
  engine.destroy();
  const inPlace = await mounted();
  assert.equal(await inPlace.engine.reconfigure({ displayCrs: next }), 'done');
  assert.equal(inPlace.engine.diagnostics.displayCrs, 'EPSG:7856');
  assert.equal(inPlace.engine.getView().zoom, undefined);
  inPlace.engine.destroy();
});

test('pre-aborted mounts do no work and cancellation settles an uncooperative mount promptly', async () => {
  const displayCrs = await createCrsRegistry().resolve('EPSG:3857');
  const abort = new AbortController();
  abort.abort();
  let work = 0;
  const alreadyAborted = new FakeMapEngine({
    beforeMount: async () => {
      work++;
    }
  });
  await assert.rejects(
    alreadyAborted.mount(
      { clientWidth: 800, clientHeight: 600 },
      { displayCrs, signal: abort.signal }
    ),
    { code: 'ENGINE_MOUNT_ABORTED' }
  );
  assert.equal(work, 0);
  const pending = gate<void>();
  const engine = new FakeMapEngine({ beforeMount: () => pending.promise });
  const mounting = engine.mount(
    { clientWidth: 800, clientHeight: 600 },
    { displayCrs }
  );
  engine.destroy();
  await assert.rejects(mounting, { code: 'ENGINE_MOUNT_ABORTED' });
  pending.reject(new Error('Late mount failure'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(engine.diagnostics.state, 'destroyed');
});
