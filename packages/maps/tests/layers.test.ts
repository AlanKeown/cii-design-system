import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCrsRegistry, LayerManager, Registry } from '../src/index.ts';
import type {
  LayerRenderer,
  LayerSpec,
  MapError,
  PreparedLayer
} from '../src/index.ts';
import {
  features,
  gate,
  layer,
  mounted,
  renderers,
  confirmed
} from './engine-fixtures.ts';

test('R1.1 rejects missing, declared-only and incomplete confirmations before engine work', () => {
  const manager = new LayerManager({ renderers: renderers() });
  for (const crs of [
    undefined,
    { code: 'EPSG:3857', provenance: { kind: 'declared', by: 'config' } },
    { ...confirmed(), confirmedAt: 'invalid' },
    { ...confirmed(), provenance: { kind: 'declared', by: '' } }
  ]) {
    const input = {
      ...layer(),
      source: { ...layer().source, crs }
    } as unknown as LayerSpec;
    assert.throws(() => manager.add(input), { code: 'CRS_NOT_CONFIRMED' });
  }
  assert.equal(manager.size, 0);
});

test('queued registrations preserve order, latest settings and removal before attachment', async () => {
  const manager = new LayerManager({ renderers: renderers() });
  const first = manager.add(layer('first'));
  const removed = manager.add(layer('removed'));
  const last = manager.add(layer('last'));
  first.setOpacity(0.4);
  first.setVisible(false);
  removed.remove();
  removed.remove();
  await assert.rejects(removed.ready, { code: 'LAYER_REMOVED' });
  const { engine, display } = await mounted();
  await manager.attach(engine, display);
  await Promise.all([first.ready, last.ready]);
  assert.deepEqual(
    engine.operations.filter((op) => op.type === 'add').map((op) => op.id),
    ['first', 'last']
  );
  assert.equal(engine.layers.get('first')?.opacity, 0.4);
  assert.equal(engine.layers.get('first')?.visible, false);
  assert.deepEqual(
    manager.list().map((item) => item.id),
    ['first', 'last']
  );
  assert.equal(manager.get('first'), first);
  manager.destroy();
  engine.destroy();
});

test('attached additions reject unsupported render kinds, missing renderers and invalid settings synchronously', async () => {
  const { engine, display } = await mounted({
    capabilities: { renderKinds: new Set(['features']) }
  });
  const manager = new LayerManager({
    renderers: new Registry<LayerRenderer>()
  });
  await manager.attach(engine, display);
  assert.throws(() => manager.add(layer()), { code: 'LAYER_INCOMPATIBLE' });
  const input = layer();
  input.source.renderKind = 'raster-image';
  assert.throws(() => manager.add(input), { code: 'LAYER_INCOMPATIBLE' });
  assert.throws(() => manager.add({ ...layer(), opacity: 2 }), {
    code: 'LAYER_INVALID'
  });
  assert.equal(engine.layers.size, 0);
  manager.destroy();
  engine.destroy();
});

test('tile-grid CRS and resolutions must match; raster reprojection and service CRS are explicit', async () => {
  for (const reprojection of [false, true]) {
    const { engine, display } = await mounted({
      capabilities: { rasterReprojection: reprojection }
    });
    const manager = new LayerManager({ renderers: renderers() });
    await manager.attach(engine, display);
    const tiles: LayerSpec = {
      id: 'tiles',
      source: {
        provider: 'xyz',
        remote: true,
        identity: 'tiles',
        crs: confirmed(),
        renderKind: 'raster-tiles',
        data: {},
        spatial: {
          type: 'fixed-grid',
          crs: display.code,
          grid: display.tileMatrix!
        }
      },
      attribution: 'Fixture tiles'
    };
    const active = manager.add(tiles);
    await active.ready;
    const wrong = {
      ...tiles,
      id: 'wrong-grid',
      source: {
        ...tiles.source,
        spatial: {
          type: 'fixed-grid' as const,
          crs: display.code,
          grid: { ...display.tileMatrix!, origin: [0, 0] as const }
        }
      }
    };
    const service: LayerSpec = {
      ...layer('service'),
      source: {
        ...layer().source,
        renderKind: 'raster-image',
        crs: confirmed('EPSG:4326'),
        spatial: { type: 'service', supportedCrs: ['EPSG:4326'] }
      }
    };
    if (reprojection) {
      await manager.add(wrong).ready;
      await manager.add(service).ready;
    } else {
      assert.throws(() => manager.add(wrong), { code: 'LAYER_INCOMPATIBLE' });
      assert.throws(() => manager.add(service), { code: 'LAYER_INCOMPATIBLE' });
    }
    const vector = {
      ...wrong,
      id: 'vector',
      source: { ...wrong.source, renderKind: 'vector-tiles' }
    };
    assert.throws(() => manager.add(vector), { code: 'LAYER_INCOMPATIBLE' });
    manager.destroy();
    engine.destroy();
  }
});

test('features use a registered renderer for engine-ready coordinates; incompatible renderers are refused', async () => {
  const transformed = features(99);
  const registry = renderers({
    compatibility: (source) =>
      source.provider === 'blocked' ? 'No transform available.' : undefined,
    prepare: (source, ctx) => {
      assert.equal(source.crs.crs.code, 'EPSG:7856');
      assert.equal(ctx.displayCrs.code, 'EPSG:3857');
      return { data: transformed };
    }
  });
  const { engine, display } = await mounted();
  const manager = new LayerManager({ renderers: registry });
  await manager.attach(engine, display);
  const input = layer();
  input.source.crs = confirmed('EPSG:7856');
  const active = manager.add(input);
  await active.ready;
  assert.equal(engine.layers.get('points')?.data, transformed);
  assert.equal(input.source.data !== transformed, true);
  assert.throws(
    () =>
      manager.add({
        ...layer('blocked'),
        source: { ...layer().source, provider: 'blocked' }
      }),
    { code: 'LAYER_INCOMPATIBLE' }
  );
  manager.destroy();
  engine.destroy();
});

test('visibility/opacity/order/style patch in place and feature data is prepared then updated surgically', async () => {
  let disposed = 0;
  const { engine, display } = await mounted();
  const manager = new LayerManager({
    renderers: renderers({
      compatibility: () => undefined,
      prepare: (source) => ({ data: source.data, dispose: () => disposed++ })
    })
  });
  await manager.attach(engine, display);
  const active = manager.add(layer());
  await active.ready;
  active.setVisible(false);
  active.setOpacity(0.2);
  active.setOrder(4);
  active.setStyle({ fill: { color: 'red' } });
  active.update({
    ...active.spec,
    source: { ...active.spec.source, data: features(2) }
  });
  await active.ready;
  assert.equal(engine.operations.filter((op) => op.type === 'add').length, 1);
  assert.equal(engine.operations.filter((op) => op.type === 'data').length, 1);
  assert.equal(engine.layers.get('points')?.visible, false);
  assert.equal(engine.layers.get('points')?.opacity, 0.2);
  assert.equal(engine.layers.get('points')?.order, 4);
  assert.deepEqual(engine.layers.get('points')?.style, {
    fill: { color: 'red' }
  });
  assert.equal(disposed, 1);
  active.remove();
  active.remove();
  assert.equal(disposed, 2);
  manager.destroy();
  engine.destroy();
});

test('identity changes, duplicates and unsupported styles leave active state intact', async () => {
  const { engine, display } = await mounted({
    capabilities: { styleFeatures: new Set() }
  });
  const manager = new LayerManager({ renderers: renderers() });
  await manager.attach(engine, display);
  const active = manager.add(layer());
  await active.ready;
  assert.throws(() => manager.add(layer()), { code: 'LAYER_DUPLICATE' });
  assert.throws(
    () =>
      active.update({
        ...active.spec,
        source: { ...active.spec.source, identity: 'new-url' }
      }),
    { code: 'LAYER_IDENTITY_CHANGED' }
  );
  assert.throws(
    () => active.setStyle({ stroke: { color: 'red', width: 1, dash: [2, 2] } }),
    { code: 'STYLE_UNSUPPORTED' }
  );
  assert.equal(engine.layers.size, 1);
  assert.equal(active.status, 'ready');
  assert.equal(active.spec.style, undefined);
  manager.destroy();
  engine.destroy();
});

test('a failed queued layer reports its own error and does not block later registrations', async () => {
  const errors: MapError[] = [];
  const manager = new LayerManager({
    renderers: renderers({
      compatibility: () => undefined,
      prepare: (source) => {
        if (source.identity === 'bad')
          throw new Error('Provider failed with private data');
        return { data: source.data };
      }
    })
  });
  const bad = manager.add(layer('bad'), {
    onerror: (error) => errors.push(error)
  });
  const good = manager.add(layer('good'));
  const { engine, display } = await mounted();
  await manager.attach(engine, display);
  await assert.rejects(bad.ready, { code: 'LAYER_LOAD_FAILED' });
  await good.ready;
  assert.equal(errors.length, 1);
  assert.ok(!errors[0].message.includes('private data'));
  assert.equal(bad.status, 'error');
  assert.equal(good.status, 'ready');
  manager.destroy();
  engine.destroy();
});

test('removing during preparation cancels immediately and disposes an uncooperative late result', async () => {
  const started = gate<void>();
  const pending = gate<PreparedLayer>();
  let disposed = 0;
  const manager = new LayerManager({
    renderers: renderers({
      compatibility: () => undefined,
      prepare: () => {
        started.resolve();
        return pending.promise;
      }
    })
  });
  const active = manager.add(layer());
  const { engine, display } = await mounted();
  const attaching = manager.attach(engine, display);
  await started.promise;
  active.remove();
  await attaching;
  await assert.rejects(active.ready, { code: 'LAYER_REMOVED' });
  pending.resolve({ data: features(), dispose: () => disposed++ });
  await pending.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(disposed, 1);
  assert.equal(engine.layers.size, 0);
  manager.destroy();
  engine.destroy();
});

test('detach/reattach retains settings and rejects stale loads from the previous engine', async () => {
  const started = gate<void>();
  const pending = gate<PreparedLayer>();
  let calls = 0;
  let disposed = 0;
  const manager = new LayerManager({
    renderers: renderers({
      compatibility: () => undefined,
      prepare: (source) => {
        calls++;
        if (calls === 1) {
          started.resolve();
          return pending.promise;
        }
        return { data: source.data };
      }
    })
  });
  const active = manager.add(layer());
  active.setOpacity(0.3);
  const first = await mounted();
  const attaching = manager.attach(first.engine, first.display);
  await started.promise;
  const oldReady = active.ready;
  manager.detach();
  await attaching;
  await assert.rejects(oldReady, { code: 'LAYER_LOAD_FAILED' });
  const second = await mounted();
  await manager.attach(second.engine, second.display);
  await active.ready;
  pending.resolve({ data: features(), dispose: () => disposed++ });
  await pending.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(first.engine.layers.size, 0);
  assert.equal(second.engine.layers.get('points')?.opacity, 0.3);
  assert.equal(disposed, 1);
  manager.destroy();
  first.engine.destroy();
  second.engine.destroy();
});

test('rapid feature updates supersede queued work and only latest data reaches the engine', async () => {
  const { engine, display } = await mounted();
  const manager = new LayerManager({ renderers: renderers() });
  await manager.attach(engine, display);
  const active = manager.add(layer());
  active.update({
    ...active.spec,
    source: { ...active.spec.source, data: features(2) }
  });
  active.update({
    ...active.spec,
    source: { ...active.spec.source, data: features(3) }
  });
  await active.ready;
  assert.equal(engine.operations.filter((op) => op.type === 'add').length, 1);
  assert.equal(
    (engine.layers.get('points')?.data as ReturnType<typeof features>)
      .features[0].id,
    3
  );
  manager.destroy();
  engine.destroy();
});

test('display CRS switch preflight names incompatible active layers and staged targets without mutation', async () => {
  const { engine, display } = await mounted();
  const manager = new LayerManager({ renderers: renderers() });
  await manager.attach(engine, display);
  const active = manager.add(layer());
  await active.ready;
  const next = await createCrsRegistry().resolve('EPSG:7856');
  const staged: LayerSpec = {
    ...layer('staged-parcels'),
    source: {
      ...layer().source,
      renderKind: 'raster-image',
      spatial: { type: 'image' }
    }
  };
  assert.throws(
    () => manager.assertCanSwitchDisplayCrs(next, { stagedTargets: [staged] }),
    (error: unknown) => {
      assert.ok(error instanceof Error && 'details' in error);
      const mapError = error as MapError;
      assert.equal(mapError.code, 'DISPLAY_CRS_SWITCH_BLOCKED');
      assert.deepEqual(
        (mapError.details.layers as { id: string }[]).map((item) => item.id),
        ['staged-parcels']
      );
      return true;
    }
  );
  assert.equal(active.status, 'ready');
  assert.equal(engine.diagnostics.displayCrs, display.code);
  assert.equal(engine.layers.size, 1);
  assert.doesNotThrow(() => manager.assertCanSwitchDisplayCrs(next));
  manager.destroy();
  engine.destroy();
});

test('manager destroy removes every registration and is idempotent without owning engine destruction', async () => {
  const { engine, display } = await mounted();
  const manager = new LayerManager({ renderers: renderers() });
  await manager.attach(engine, display);
  const active = manager.add(layer());
  await active.ready;
  manager.destroy();
  manager.destroy();
  active.remove();
  assert.equal(manager.size, 0);
  assert.equal(engine.layers.size, 0);
  assert.equal(engine.diagnostics.state, 'mounted');
  assert.throws(() => manager.add(layer()), { code: 'ENGINE_STATE' });
  engine.destroy();
});

test('in-flight updates cancel obsolete preparation, retain latest settings and extend attach readiness', async () => {
  const started = gate<void>();
  const old = gate<PreparedLayer>();
  const latest = gate<PreparedLayer>();
  let calls = 0;
  let disposed = 0;
  const manager = new LayerManager({
    renderers: renderers({
      compatibility: () => undefined,
      prepare: () => {
        if (++calls === 1) {
          started.resolve();
          return old.promise;
        }
        return latest.promise;
      }
    })
  });
  const active = manager.add(layer());
  const { engine, display } = await mounted();
  let attached = false;
  const attaching = manager.attach(engine, display).then(() => {
    attached = true;
  });
  await started.promise;
  active.update({
    ...active.spec,
    source: { ...active.spec.source, data: features(2) }
  });
  active.setStyle({ fill: { color: 'red' } });
  active.setOpacity(0.6);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(attached, false);
  latest.resolve({ data: features(2) });
  await attaching;
  assert.equal(active.status, 'ready');
  old.resolve({ data: features(1), dispose: () => disposed++ });
  await old.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(disposed, 1);
  assert.equal(
    engine.operations.filter((operation) => operation.type === 'add').length,
    1
  );
  assert.equal(engine.layers.get('points')?.opacity, 0.6);
  assert.deepEqual(engine.layers.get('points')?.style, {
    fill: { color: 'red' }
  });
  manager.destroy();
  engine.destroy();
});

test('renderer and engine add failures dispose prepared resources; explicit reload retries failed layers', async () => {
  let disposed = 0;
  let fail = true;
  const { engine, display } = await mounted();
  const originalAdd = engine.addLayer.bind(engine);
  engine.addLayer = (resolved) => {
    if (fail) throw new Error('Adapter failed');
    return originalAdd(resolved);
  };
  const manager = new LayerManager({
    renderers: renderers({
      compatibility: () => undefined,
      prepare: (source) => ({ data: source.data, dispose: () => disposed++ })
    })
  });
  await manager.attach(engine, display);
  const active = manager.add(layer());
  await assert.rejects(active.ready, { code: 'LAYER_LOAD_FAILED' });
  assert.equal(disposed, 1);
  assert.equal(engine.layers.size, 0);
  fail = false;
  active.reload();
  await active.ready;
  assert.equal(active.status, 'ready');
  active.remove();
  assert.equal(disposed, 2);
  manager.destroy();
  engine.destroy();
});

test('cleanup attempts every layer even when a renderer disposer throws', async () => {
  const { engine, display } = await mounted();
  const disposed: string[] = [];
  const manager = new LayerManager({
    renderers: renderers({
      compatibility: () => undefined,
      prepare: (source) => ({
        data: source.data,
        dispose: () => {
          disposed.push(source.identity);
          throw new Error('Cleanup failed');
        }
      })
    })
  });
  manager.add(layer('first'));
  manager.add(layer('second'));
  await manager.attach(engine, display);
  assert.throws(() => manager.destroy(), AggregateError);
  assert.deepEqual(disposed, ['first', 'second']);
  assert.equal(engine.layers.size, 0);
  assert.equal(manager.size, 0);
  assert.doesNotThrow(() => manager.destroy());
  engine.destroy();
});

test('runtime spatial metadata and renderer feature payloads are validated before engine calls', async () => {
  const { engine, display } = await mounted();
  const manager = new LayerManager({
    renderers: renderers({
      compatibility: () => undefined,
      prepare: () => ({ data: {} })
    })
  });
  await manager.attach(engine, display);
  for (const spatial of [
    { type: 'fixed-grid' },
    { type: 'service', supportedCrs: [] },
    {
      type: 'fixed-grid',
      crs: display.code,
      grid: { origin: [0, 0], resolutions: [10, 10] }
    }
  ]) {
    assert.throws(
      () =>
        manager.add({
          ...layer(),
          source: { ...layer().source, spatial }
        } as unknown as LayerSpec),
      { code: 'LAYER_INVALID' }
    );
  }
  const bypass: LayerSpec = {
    ...layer('bypass'),
    source: {
      ...layer().source,
      renderKind: 'vector-tiles',
      spatial: { type: 'custom', supportedCrs: [display.code] }
    }
  };
  assert.throws(() => manager.add(bypass), { code: 'LAYER_INCOMPATIBLE' });
  const malformed = manager.add(layer('malformed'));
  await assert.rejects(malformed.ready, { code: 'LAYER_LOAD_FAILED' });
  assert.equal(engine.layers.size, 0);
  manager.destroy();
  engine.destroy();
});

test('switch preflight blocks fixed-grid active layers and leaves engine state untouched', async () => {
  const { engine, display } = await mounted();
  const manager = new LayerManager({ renderers: renderers() });
  await manager.attach(engine, display);
  const active = manager.add({
    ...layer('basemap'),
    source: {
      ...layer().source,
      renderKind: 'raster-tiles',
      spatial: {
        type: 'fixed-grid',
        crs: display.code,
        grid: display.tileMatrix!
      }
    }
  });
  await active.ready;
  const next = await createCrsRegistry().resolve('EPSG:7856');
  assert.throws(() => manager.assertCanSwitchDisplayCrs(next), {
    code: 'DISPLAY_CRS_SWITCH_BLOCKED'
  });
  assert.equal(engine.diagnostics.displayCrs, display.code);
  assert.equal(active.status, 'ready');
  manager.destroy();
  engine.destroy();
});

test('remote attribution and experimental display permission are enforced at the manager boundary', async () => {
  const { engine, display } = await mounted();
  const manager = new LayerManager({ renderers: renderers() });
  await manager.attach(engine, display);
  const remote = { ...layer(), source: { ...layer().source, remote: true } };
  assert.throws(() => manager.add(remote), { code: 'ATTRIBUTION_REQUIRED' });
  await manager.add({ ...remote, attribution: 'Fixture data' }).ready;
  manager.destroy();
  engine.destroy();
  const experimental = await mounted({
    capabilities: {
      displayCrs: (code) => (code === 'EPSG:3857' ? 'native' : 'experimental')
    }
  });
  const second = new LayerManager({ renderers: renderers() });
  await second.attach(experimental.engine, experimental.display);
  const next = await createCrsRegistry().resolve('EPSG:7856');
  assert.throws(() => second.assertCanSwitchDisplayCrs(next), {
    code: 'DISPLAY_CRS_UNSUPPORTED'
  });
  assert.doesNotThrow(() =>
    second.assertCanSwitchDisplayCrs(next, { allowExperimental: true })
  );
  second.destroy();
  experimental.engine.destroy();
});

test('matching tile grids can expose fewer levels; incompatible resolutions are still blocked', async () => {
  const { engine, display } = await mounted();
  const manager = new LayerManager({ renderers: renderers() });
  await manager.attach(engine, display);
  const input: LayerSpec = {
    ...layer(),
    source: {
      ...layer().source,
      renderKind: 'vector-tiles',
      spatial: {
        type: 'fixed-grid',
        crs: display.code,
        grid: {
          ...display.tileMatrix!,
          resolutions: display.tileMatrix!.resolutions.slice(0, 12)
        }
      }
    }
  };
  await manager.add(input).ready;
  const wrong: LayerSpec = {
    ...input,
    id: 'wrong',
    source: {
      ...input.source,
      spatial: {
        type: 'fixed-grid',
        crs: display.code,
        grid: {
          ...display.tileMatrix!,
          resolutions: display.tileMatrix!.resolutions.map((value) => value * 3)
        }
      }
    }
  };
  assert.throws(() => manager.add(wrong), { code: 'LAYER_INCOMPATIBLE' });
  manager.destroy();
  engine.destroy();
});

test('queue opt-out and removed registrations cannot resurrect or affect replacement IDs', async () => {
  assert.throws(
    () => new LayerManager({ queueUntilAttached: false }).add(layer()),
    { code: 'ENGINE_STATE' }
  );
  const manager = new LayerManager({ renderers: renderers() });
  const old = manager.add(layer());
  old.remove();
  const active = manager.add(layer());
  const { engine, display } = await mounted();
  await manager.attach(engine, display);
  old.remove();
  assert.equal(manager.get('points'), active);
  assert.equal(engine.layers.size, 1);
  assert.throws(() => old.setVisible(false), { code: 'LAYER_REMOVED' });
  manager.destroy();
  engine.destroy();
});
