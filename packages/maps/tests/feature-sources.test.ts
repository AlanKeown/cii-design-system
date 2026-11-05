import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFeatureSources, parseGeoJson } from '../src/sources/geojson.ts';
import { createCrsRegistry, MapError, resolveSourceCrs } from '../src/index.ts';
import { geometryHitDistance } from '../src/engine/geometry-hit.ts';
import type { SourceInput } from '../src/crs/resolve.ts';

const point = { type: 'Point', coordinates: [151.21, -33.87, 12] };
const declaration = {
  code: 'OGC:CRS84',
  provenance: { kind: 'declared' as const, by: 'fixture author' }
};

test('GeoJSON copies coordinates, preserves feature IDs and ordinates, and normalises only the source boundary', () => {
  const parsed = parseGeoJson({
    type: 'Feature',
    id: 0,
    properties: null,
    geometry: point
  });
  assert.equal(parsed.features[0].id, 0);
  assert.deepEqual(parsed.features[0].properties, {});
  assert.deepEqual(parseGeoJson(parsed, 'yx').features[0].geometry, {
    type: 'Point',
    coordinates: [-33.87, 151.21, 12]
  });
  assert.deepEqual(point.coordinates, [151.21, -33.87, 12]);
});

test('malformed geometry and bounded payloads fail with distinct typed errors', () => {
  for (const value of [
    { type: 'FeatureCollection' },
    { type: 'Point', coordinates: [Infinity, 1] },
    { type: 'LineString', coordinates: [[1, 2]] },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1]
        ]
      ]
    }
  ]) {
    assert.throws(() => parseGeoJson(value), { code: 'SOURCE_INVALID' });
  }
  assert.throws(
    () =>
      parseGeoJson({
        type: 'FeatureCollection',
        features: Array(10_001).fill(null)
      }),
    { code: 'SOURCE_TOO_LARGE' }
  );
  assert.throws(
    () =>
      parseGeoJson({
        type: 'MultiPoint',
        coordinates: Array(100_001).fill([1, 2])
      }),
    { code: 'SOURCE_TOO_LARGE' }
  );
});

test('fetch probe and open share a request, confirm CRS, forward cancellation and retain source data', async () => {
  let requests = 0;
  const abort = new AbortController();
  const sources = createFeatureSources(async (_url, init) => {
    requests++;
    assert.equal(init?.signal, abort.signal);
    return Response.json(point);
  });
  const source = {
    provider: 'geojson',
    url: '/sites.geojson',
    crs: declaration
  };
  const confirmed = await resolveSourceCrs(source, {
    sources,
    crsRegistry: createCrsRegistry(),
    displayCrs: 'EPSG:3857',
    signal: abort.signal
  });
  if (!confirmed.ok) throw confirmed.error;
  const opened = await sources
    .require('geojson')
    .open(source, confirmed.value, { signal: abort.signal });
  assert.equal(requests, 1);
  assert.equal(opened.remote, true);
  assert.deepEqual(opened.data, parseGeoJson(point));
  assert.deepEqual(confirmed.value.provenance, {
    ...declaration.provenance,
    hint: { code: 'OGC:CRS84', from: 'rfc7946_default' }
  });
});

test('inline declared y/x is normalised after confirmation without altering input', async () => {
  const sources = createFeatureSources();
  const source = {
    provider: 'inline',
    data: { type: 'Point', coordinates: [-33.87, 151.21] },
    crs: { ...declaration, axisOrder: 'yx' as const }
  };
  const confirmed = await resolveSourceCrs(source, {
    sources,
    crsRegistry: createCrsRegistry(),
    displayCrs: 'EPSG:3857'
  });
  if (!confirmed.ok) throw confirmed.error;
  const result = await sources
    .require('inline')
    .open(source, confirmed.value, {});
  assert.deepEqual(
    result.data,
    parseGeoJson({ type: 'Point', coordinates: [151.21, -33.87] })
  );
  assert.deepEqual(source.data.coordinates, [-33.87, 151.21]);
});

test('GeoJSON hints cannot confirm or override a declaration', async () => {
  const sources = createFeatureSources(async () =>
    Response.json({
      ...point,
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::7844' } }
    })
  );
  const source = {
    provider: 'geojson',
    url: '/sites.geojson',
    crs: declaration
  };
  const context = {
    sources,
    crsRegistry: createCrsRegistry(),
    displayCrs: 'EPSG:3857'
  };
  const mismatch = await resolveSourceCrs(source, context);
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.error.code, 'CRS_HINT_MISMATCH');
  const missing = await resolveSourceCrs(
    { ...source, crs: undefined },
    context
  );
  assert.equal(missing.ok, false);
});

test('failed HTTP, invalid JSON and byte limits fail before rendering', async () => {
  for (const [response, code] of [
    [new Response('missing', { status: 404 }), 'SOURCE_LOAD_FAILED'],
    [new Response('{broken'), 'SOURCE_INVALID'],
    [
      new Response('{}', {
        headers: { 'content-length': String(6 * 1024 * 1024) }
      }),
      'SOURCE_TOO_LARGE'
    ],
    [new Response(' '.repeat(5 * 1024 * 1024 + 1)), 'SOURCE_TOO_LARGE']
  ] as const) {
    const sources = createFeatureSources(async () => response);
    const source: SourceInput & { url: string } = {
      provider: 'geojson',
      url: '/fixture',
      crs: declaration
    };
    await assert.rejects(
      sources.require('geojson').probe(source, {
        sources,
        crsRegistry: createCrsRegistry(),
        displayCrs: 'EPSG:3857'
      }),
      (error: unknown) => error instanceof MapError && error.code === code
    );
  }
});

test('hit distances respect polygon holes and line segments in screen space', () => {
  const geometry = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0]
      ],
      [
        [40, 40],
        [60, 40],
        [60, 60],
        [40, 60],
        [40, 40]
      ]
    ] as const
  };
  assert.equal(
    geometryHitDistance(geometry, [10, 10], (p) => [p[0], p[1]]),
    0
  );
  assert.equal(
    geometryHitDistance(geometry, [50, 50], (p) => [p[0], p[1]]),
    10
  );
  assert.equal(
    geometryHitDistance(
      {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [100, 0]
        ]
      },
      [50, 5],
      (p) => [p[0], p[1]]
    ),
    5
  );
});

test('adapter imports without browser globals and rejects unsupported display CRSs', async () => {
  const { default: LeafletEngine } = await import('../src/leaflet.ts');
  const engine = new LeafletEngine();
  assert.equal(engine.capabilities.displayCrs('EPSG:3857'), 'native');
  assert.equal(engine.capabilities.displayCrs('EPSG:7856'), 'unsupported');
  engine.destroy();
  engine.destroy();
});
