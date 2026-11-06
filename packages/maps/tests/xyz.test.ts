import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRegistries, resolveSourceCrs } from '../src/index.ts';
import { assertXyzTileData } from '../src/sources/xyz.ts';
import { spatialIncompatibility } from '../src/layers/compatibility.ts';
import LeafletEngine from '../src/leaflet.ts';

const input = {
  provider: 'xyz',
  url: '/tiles/{z}/{x}/{y}.png',
  crs: {
    code: 'EPSG:3857',
    provenance: { kind: 'declared' as const, by: 'test author' }
  }
};

test('XYZ explicitly confirms CRS, opens without fetching, and enforces grid/display compatibility', async () => {
  const registries = createRegistries({
    fetch: async () => {
      throw new Error('Unexpected fetch');
    }
  });
  const context = {
    sources: registries.sources,
    crsRegistry: registries.crs,
    displayCrs: 'EPSG:3857'
  };
  const missing = await resolveSourceCrs(
    { provider: 'xyz', url: input.url },
    context
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, 'CRS_NOT_CONFIRMED');
  const confirmed = await resolveSourceCrs(input, context);
  assert.ok(confirmed.ok);
  assert.deepEqual(confirmed.value.provenance, input.crs.provenance);
  const source = await registries.sources
    .require('xyz')
    .open(input, confirmed.value, {});
  assert.equal(source.remote, true);
  assert.equal(source.renderKind, 'raster-tiles');
  const spec = { id: 'base', source, attribution: 'Fixture' };
  const engine = new LeafletEngine();
  const display = await registries.crs.resolve('EPSG:3857');
  assert.equal(
    spatialIncompatibility(spec, display, engine.capabilities),
    undefined
  );
  assert.match(
    spatialIncompatibility(
      spec,
      await registries.crs.resolve('EPSG:4326'),
      engine.capabilities
    )!,
    /must match/
  );
  assert.match(
    spatialIncompatibility(
      spec,
      { ...display, tileMatrix: { ...display.tileMatrix!, origin: [0, 0] } },
      engine.capabilities
    )!,
    /must match/
  );
  await assert.rejects(
    registries.sources
      .require('xyz')
      .open(
        input,
        { ...confirmed.value, crs: { code: 'EPSG:4326', axisOrder: 'xy' } },
        {}
      ),
    { code: 'LAYER_INCOMPATIBLE' }
  );
  await assert.rejects(
    registries.sources
      .require('xyz')
      .open(
        input,
        { ...confirmed.value, crs: { code: 'EPSG:3857', axisOrder: 'yx' } },
        {}
      ),
    { code: 'LAYER_INCOMPATIBLE' }
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    registries.sources
      .require('xyz')
      .open(input, confirmed.value, { signal: abort.signal }),
    { name: 'AbortError' }
  );
});

test('XYZ rejects unsafe protocols, missing coordinates and unsupported templates', () => {
  for (const url of [
    'javascript:{z}/{x}/{y}',
    'data:image/png,{z}{x}{y}',
    'file:///{z}/{x}/{y}',
    '\n javascript:{z}/{x}/{y}',
    '/tiles/{z}/{x}.png',
    '/tiles/{s}/{z}/{x}/{y}.png',
    '/tiles/{z}/{x}/{y}/{',
    ''
  ]) {
    assert.throws(() => assertXyzTileData({ url }), { code: 'SOURCE_INVALID' });
  }
  for (const url of [
    input.url,
    'https://tiles.example/{z}/{x}/{y}.png',
    '/demo.svg?z={z}&x={x}&y={y}'
  ]) {
    assert.doesNotThrow(() => assertXyzTileData({ url }));
  }
});
