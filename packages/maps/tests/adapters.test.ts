import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapRuntime } from '../src/map-controller.ts';
import { definitions } from '../src/crs/definitions.ts';
import { wmsTileUrl } from '../src/sources/ogc-raster.ts';
import type { CrsDef } from '../src/crs/types.ts';

test('all production adapters are lazy and can be created and destroyed without browser globals', async () => {
  const runtime = createMapRuntime();
  for (const id of ['leaflet', 'openlayers', 'maplibre']) {
    const engine = await runtime.engines.create(id);
    assert.equal(engine.id, id);
    assert.equal(engine.capabilities.displayCrs('EPSG:3857'), 'native');
    assert.ok(runtime.renderers.get(`${id}:features`));
    assert.ok(runtime.renderers.get(`${id}:raster-tiles`));
    engine.destroy();
    engine.destroy();
  }
});

test('projected Leaflet capability requires a configured grid and definitions stay instance scoped', async () => {
  const mga = definitions.find(
    (definition) => definition.code === 'EPSG:7856'
  )!;
  const configured: CrsDef = {
    ...mga,
    tileMatrix: { origin: [0, 10_000_000], resolutions: [100, 50, 25] }
  };
  const runtime = createMapRuntime({ definitions: [configured] });
  const ordinary = createMapRuntime();
  // Mutating caller metadata must not change either the registry or active grids.
  configured.tileMatrix = { origin: [99, 99], resolutions: [9, 3] };
  assert.deepEqual(
    (await runtime.crs.resolve(mga.code)).tileMatrix?.origin,
    [0, 10_000_000]
  );
  assert.equal((await ordinary.crs.resolve(mga.code)).tileMatrix, undefined);
  const projected = await runtime.engines.create('leaflet');
  const native = await ordinary.engines.create('leaflet');
  assert.equal(projected.capabilities.displayCrs(mga.code), 'native');
  assert.equal(native.capabilities.displayCrs(mga.code), 'unsupported');
  projected.destroy();
  native.destroy();
});

test('MapLibre refuses projected and geographic displays even with experimental opt-in', async () => {
  const engine = await createMapRuntime().engines.create('maplibre');
  for (const code of ['EPSG:7856', 'EPSG:4326', 'unknown'])
    assert.equal(engine.capabilities.displayCrs(code), 'unsupported');
  engine.destroy();
});

test('projected WMS request uses adapter envelope and protocol axes exactly once', () => {
  const source = {
    kind: 'wms' as const,
    url: 'https://example.test/map',
    version: '1.3.0' as const,
    layers: ['demo'],
    format: 'image/png',
    supportedCrs: ['EPSG:7856', 'EPSG:4326'],
    requestCrs: 'EPSG:7856',
    axisOrder: 'xy' as const
  };
  const projected = new URL(
    wmsTileUrl(source, [334000, 6250000, 335000, 6251000], 512, 256)
  );
  assert.equal(
    projected.searchParams.get('BBOX'),
    '334000,6250000,335000,6251000'
  );
  assert.equal(projected.searchParams.get('WIDTH'), '512');
  assert.equal(projected.searchParams.get('CRS'), 'EPSG:7856');
  const geographic = new URL(
    wmsTileUrl(
      { ...source, requestCrs: 'EPSG:4326', axisOrder: 'yx' },
      [151, -34, 152, -33],
      256,
      256
    )
  );
  assert.equal(geographic.searchParams.get('BBOX'), '-34,151,-33,152');
});
