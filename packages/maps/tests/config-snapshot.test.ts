import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  restoreMapConfigSnapshot,
  validateMapConfigSnapshot
} from '../src/index.ts';
import { MapController, createMapRuntime } from '../src/map-controller.ts';
import { FakeMapEngine } from '../src/testing.ts';
import type { MapConfig } from '../src/index.ts';
import { features, layer, gate } from './engine-fixtures.ts';
import { wmsCapabilities } from './support/ogc.ts';

function controller(
  fetch?: typeof globalThis.fetch,
  acknowledgeHintMismatch = false
) {
  const runtime = createMapRuntime({ fetch, acknowledgeHintMismatch });
  runtime.engines.register('fake', async () => ({ default: FakeMapEngine }));
  for (const kind of ['features', 'raster-tiles'])
    runtime.renderers.register(`fake:${kind}`, {
      compatibility: () => undefined,
      prepare: (source) => ({ data: source.data })
    });
  return new MapController(
    { clientWidth: 800, clientHeight: 600 } as HTMLElement,
    runtime
  );
}

function config(): MapConfig {
  return {
    engine: 'fake',
    view: { center: { crs: 'EPSG:3857', coordinates: [0, 0] }, zoom: 12 },
    layers: [
      {
        id: 'points',
        source: {
          provider: 'inline',
          data: features(),
          crs: {
            code: 'EPSG:3857',
            provenance: { kind: 'declared', by: 'Reviewer' }
          }
        }
      }
    ]
  };
}

test('snapshot round trip preserves detached provenance and restores only validated declarations', async () => {
  const first = controller();
  const second = controller();
  try {
    await first.applyConfig(config());
    const child = first.registerLayer(layer('child'));
    await child.ready;
    const saved = first.exportSnapshot();
    assert.equal(saved.version, 1);
    assert.equal(saved.provenance.length, 2);
    assert.equal(
      saved.provenance.find((item) => item.id === 'child')?.origin,
      'declarative'
    );
    assert.equal(saved.provenance[0].crs.provenance.kind, 'declared');
    assert.equal('confirmedAt' in saved.config.layers[0].source.crs, false);
    const json: unknown = JSON.parse(JSON.stringify(saved));
    assert.deepEqual(validateMapConfigSnapshot(json), saved);
    saved.provenance[0].crs.crs.code = 'EPSG:4326';
    assert.equal(first.snapshot().layers[0].crs.crs.code, 'EPSG:3857');
    const restored = restoreMapConfigSnapshot(json);
    restored.layers[0].visible = false;
    assert.equal(
      validateMapConfigSnapshot(json).config.layers[0].visible,
      undefined
    );
    await second.applyConfig(restored);
    assert.deepEqual(
      second.snapshot().layers.map((item) => item.id),
      ['points']
    );
    assert.equal(second.snapshot().layers[0].crs.crs.code, 'EPSG:3857');
  } finally {
    first.destroy();
    second.destroy();
  }
});

test('restoration re-probes changed service metadata and never trusts saved confirmations', async () => {
  let requests = 0;
  const first = controller(async () => {
    requests++;
    return new Response(wmsCapabilities());
  });
  const second = controller(async () => {
    requests++;
    return new Response(
      wmsCapabilities('1.3.0', '/changed', ['CRS:84', 'EPSG:3857'])
    );
  });
  const input = config();
  input.layers = [
    {
      id: 'wms',
      attribution: 'Synthetic service',
      source: {
        provider: 'wms',
        url: '/catalogue',
        layers: 'demo',
        crs: { fromMetadata: true, policy: 'prefer-native' }
      }
    }
  ];
  try {
    await first.applyConfig(input);
    const saved = first.exportSnapshot();
    assert.equal(saved.provenance[0].crs.crs.code, 'EPSG:4326');
    saved.provenance[0].crs.confirmedAt = '2000-01-01T00:00:00.000Z';
    await second.applyConfig(
      restoreMapConfigSnapshot(JSON.parse(JSON.stringify(saved)))
    );
    assert.equal(requests, 2);
    assert.deepEqual(second.snapshot().layerErrors, []);
    const fresh = second.exportSnapshot().provenance[0].crs;
    assert.equal(fresh.crs.code, 'OGC:CRS84');
    assert.notEqual(fresh.confirmedAt, saved.provenance[0].crs.confirmedAt);
    assert.equal(fresh.provenance.kind, 'service-metadata');
  } finally {
    first.destroy();
    second.destroy();
  }
});

test('saved mismatch acknowledgement cannot bypass a new runtime confirmation', async () => {
  const first = controller(
    async () => new Response(JSON.stringify(features())),
    true
  );
  const input = config();
  input.layers[0].source = {
    provider: 'geojson',
    url: '/points.geojson',
    crs: { code: 'EPSG:3857', provenance: { kind: 'declared', by: 'Reviewer' } }
  };
  input.layers[0].attribution = 'Fixture';
  try {
    await first.applyConfig(input);
    const saved = first.exportSnapshot();
    const provenance = saved.provenance[0].crs.provenance;
    assert.equal(provenance.kind, 'declared');
    if (provenance.kind === 'declared') {
      assert.equal(provenance.hintMismatchAcknowledged, true);
    }
    const restored = restoreMapConfigSnapshot(
      JSON.parse(JSON.stringify(saved))
    );
    const fresh = controller(
      async () => new Response(JSON.stringify(features()))
    );
    try {
      await fresh.applyConfig(restored);
      assert.equal(
        fresh.snapshot().layerErrors[0].error.code,
        'CRS_HINT_MISMATCH'
      );
      assert.throws(() => fresh.exportSnapshot(), { code: 'ENGINE_STATE' });
    } finally {
      fresh.destroy();
    }
  } finally {
    first.destroy();
  }
});

test('snapshot rejects unknown versions, malformed provenance and invalid configuration', async () => {
  const map = controller();
  try {
    await map.applyConfig(config());
    const saved = map.exportSnapshot();
    const invalid: unknown[] = [
      { ...saved, version: 2 },
      { ...saved, engine: () => {} },
      { ...saved, provenance: [] },
      { ...saved, provenance: [saved.provenance[0], saved.provenance[0]] },
      {
        ...saved,
        provenance: [{ ...saved.provenance[0], origin: 'declarative' }]
      },
      {
        ...saved,
        provenance: [{ ...saved.provenance[0], crs: { confirmedAt: 'old' } }]
      },
      {
        ...saved,
        config: {
          ...saved.config,
          layers: [
            { id: 'points', source: { provider: 'inline', data: features() } }
          ]
        }
      }
    ];
    for (const value of invalid)
      assert.throws(() => restoreMapConfigSnapshot(value));
    const hostile = Proxy.revocable({}, {});
    hostile.revoke();
    assert.throws(() => restoreMapConfigSnapshot(hostile.proxy), {
      code: 'CONFIG_INVALID'
    });
    let getterRead = false;
    const accessor = {
      get version() {
        getterRead = true;
        return 1;
      }
    };
    assert.throws(() => restoreMapConfigSnapshot(accessor), {
      code: 'CONFIG_INVALID'
    });
    assert.equal(getterRead, false);
    const cycle: Record<string, unknown> = { ...saved };
    cycle.loop = cycle;
    assert.throws(() => restoreMapConfigSnapshot(cycle), {
      code: 'CONFIG_INVALID'
    });
  } finally {
    map.destroy();
  }
});

test('snapshot refuses pending, failed and destroyed maps', async () => {
  const pending = gate<Response>();
  const map = controller(() => pending.promise);
  const input = config();
  input.layers = [
    {
      id: 'remote',
      attribution: 'Fixture',
      source: {
        provider: 'geojson',
        url: '/pending',
        crs: {
          code: 'OGC:CRS84',
          provenance: { kind: 'declared', by: 'Reviewer' }
        }
      }
    }
  ];
  assert.throws(() => map.exportSnapshot(), { code: 'ENGINE_STATE' });
  const applying = map.applyConfig(input);
  try {
    assert.throws(() => map.exportSnapshot(), { code: 'ENGINE_STATE' });
    pending.resolve(new Response(JSON.stringify(features())));
    await applying;
    assert.equal(map.exportSnapshot().provenance.length, 1);
  } finally {
    pending.resolve(new Response('{}'));
    map.destroy();
  }
  assert.throws(() => map.exportSnapshot(), { code: 'ENGINE_STATE' });
});
