import assert from 'node:assert/strict';
import { test } from 'node:test';
import proj4 from 'proj4';
import fixtures from './fixtures/transforms.json' with { type: 'json' };
import {
  createCrsRegistry,
  createTransformService,
  CrsRegistry,
  LayerManager,
  Registry,
  toCoreCoord
} from '../src/index.ts';
import type {
  ConfirmedCrs,
  Coord,
  CrsDef,
  FeatureBatch,
  Geometry,
  LayerRenderer,
  TransformAccuracy,
  TransformRequest
} from '../src/index.ts';
import { confirmed, layer, mounted } from './engine-fixtures.ts';

function near(actual: Coord, expected: readonly number[], tolerance: number) {
  assert.ok(
    Math.abs(actual[0] - expected[0]) <= tolerance,
    `${actual[0]} vs ${expected[0]}`
  );
  assert.ok(
    Math.abs(actual[1] - expected[1]) <= tolerance,
    `${actual[1]} vs ${expected[1]}`
  );
}

test('generated registry metadata identifies datums independently from projection ellipsoids', async () => {
  const registry = createCrsRegistry();
  const gda94 = await registry.resolve('EPSG:4283');
  const gda2020 = await registry.resolve('EPSG:7844');
  assert.equal(gda94.proj4, gda2020.proj4);
  assert.equal(gda94.datum?.id, 'EPSG:6283');
  assert.equal(gda2020.datum?.id, 'EPSG:1168');
  assert.equal(
    (await registry.resolve('EPSG:7856')).datum?.id,
    gda2020.datum?.id
  );
  assert.equal(
    (await registry.resolve('EPSG:28356')).datum?.id,
    gda94.datum?.id
  );
  assert.equal((await registry.resolve('EPSG:3857')).datum?.kind, 'ensemble');
  assert.equal(
    (await registry.resolve('OGC:CRS84')).datum?.id,
    (await registry.resolve('EPSG:4326')).datum?.id
  );
});

test('same-datum projections match independent PROJ CLI fixtures and round-trip all bundled MGA zones', async () => {
  const service = createTransformService(createCrsRegistry());
  assert.ok(fixtures.oracle.includes('PROJ cs2cs'));
  for (const entry of fixtures.fixtures) {
    const transform = await service.prepare({
      source: entry.source,
      target: entry.target,
      datumPolicy: 'require-same-datum'
    });
    near(
      transform.coordinate([entry.input[0], entry.input[1]]),
      entry.expected,
      entry.tolerance
    );
    assert.equal(transform.accuracy.datumRelationship, 'same');
    assert.equal(transform.accuracy.horizontalAccuracyMetres, null);
    const inverse = await service.prepare({
      source: entry.target,
      target: entry.source
    });
    near(
      inverse.coordinate([entry.expected[0], entry.expected[1]]),
      entry.input,
      1e-8
    );
  }
});

test('GDA94/GDA2020 browser display output explicitly reports unverified datum alignment', async () => {
  const service = createTransformService(createCrsRegistry());
  const transform = await service.prepare({
    source: 'EPSG:4283',
    target: 'EPSG:7844'
  });
  near(transform.coordinate([151.21, -33.87]), [151.21, -33.87], 1e-12);
  const report = transform.accuracy;
  assert.equal(report.authoritative, false);
  assert.equal(report.tier, 'display');
  assert.equal(report.datumRelationship, 'different');
  assert.equal(report.operation, 'definition-transform');
  assert.equal(report.horizontalAccuracyMetres, null);
  assert.deepEqual(
    report.warnings.map((warning) => warning.code),
    ['DATUM_DIFFERENCE']
  );
  await assert.rejects(
    service.prepare({
      source: 'EPSG:4283',
      target: 'EPSG:7844',
      datumPolicy: 'require-same-datum'
    }),
    { code: 'TRANSFORM_DATUM_POLICY' }
  );
});

test('Web Mercator display reports ensemble limitations and any Australian datum crossing', async () => {
  const service = createTransformService(createCrsRegistry());
  for (const source of ['EPSG:7844', 'EPSG:4283']) {
    const transform = await service.forDisplay(confirmed(source), 'EPSG:3857');
    assert.equal(transform.accuracy.datumRelationship, 'different');
    assert.deepEqual(
      transform.accuracy.warnings.map((warning) => warning.code),
      ['DATUM_DIFFERENCE', 'DATUM_ENSEMBLE']
    );
    near(
      transform.coordinate([151.21, -33.87]),
      fixtures.fixtures[0].expected,
      0.001
    );
  }
});

test('explicit source/display CRS requires confirmation and never swaps already-normalised core coordinates twice', async () => {
  const service = createTransformService(createCrsRegistry());
  const source: ConfirmedCrs = {
    ...confirmed('EPSG:4326'),
    crs: { code: 'EPSG:4326', axisOrder: 'yx' }
  };
  const transform = await service.forDisplay(source, 'EPSG:3857');
  near(
    transform.coordinate(toCoreCoord([-33.87, 151.21], source.crs)),
    fixtures.fixtures[0].expected,
    0.001
  );
  await assert.rejects(
    service.forDisplay(
      { code: 'EPSG:4326' } as unknown as ConfirmedCrs,
      'EPSG:3857'
    ),
    { code: 'CRS_NOT_CONFIRMED' }
  );
});

test('unknown codes, missing codes, invalid policies and nonfinite epochs fail without fallback', async () => {
  const service = createTransformService(createCrsRegistry());
  await assert.rejects(
    service.prepare({ source: 'EPSG:28359', target: 'EPSG:3857' }),
    { code: 'CRS_NOT_FOUND' }
  );
  await assert.rejects(
    service.prepare({ source: 'EPSG:4326', target: 'UNKNOWN:1' }),
    { code: 'CRS_NOT_FOUND' }
  );
  for (const request of [
    { source: 'EPSG:4326' },
    { source: '', target: 'EPSG:3857' },
    { source: 'EPSG:4326', target: 'EPSG:3857', sourceEpoch: Infinity },
    { source: 'EPSG:4326', target: 'EPSG:3857', datumPolicy: 'silent' }
  ])
    await assert.rejects(service.prepare(request as TransformRequest), {
      code: 'TRANSFORM_REQUEST_INVALID'
    });
});

test('epochs are retained in reports but never masquerade as applied plate motion', async () => {
  const service = createTransformService(createCrsRegistry());
  const source: ConfirmedCrs = {
    ...confirmed('EPSG:7844'),
    crs: { code: 'EPSG:7844', axisOrder: 'xy', epoch: 2020 }
  };
  const transform = await service.forDisplay(source, 'EPSG:3857', {
    targetEpoch: 2026.8
  });
  assert.equal(transform.accuracy.source.epoch, 2020);
  assert.equal(transform.accuracy.target.epoch, 2026.8);
  assert.ok(
    transform.accuracy.warnings.some(
      (warning) => warning.code === 'EPOCH_NOT_APPLIED'
    )
  );
  const report = transform.accuracy;
  report.source.epoch = 1900;
  report.source.datum!.id = 'changed';
  assert.equal(transform.accuracy.source.epoch, 2020);
  assert.equal(transform.accuracy.source.datum?.id, 'EPSG:1168');
  assert.deepEqual(
    JSON.parse(JSON.stringify(transform.accuracy)),
    transform.accuracy
  );
});

test('geometry/batch transforms preserve originals, ring closure, null geometry and extra ordinates', async () => {
  const transform = await createTransformService(createCrsRegistry()).prepare({
    source: 'EPSG:7844',
    target: 'EPSG:7856'
  });
  const ring = [
    [151.21, -33.87],
    [151.22, -33.87],
    [151.22, -33.88],
    [151.21, -33.87]
  ] as const;
  const geometries: Geometry[] = [
    { type: 'Point', coordinates: [151.21, -33.87, 50, 123] },
    { type: 'MultiPoint', coordinates: ring },
    { type: 'LineString', coordinates: ring },
    { type: 'MultiLineString', coordinates: [ring] },
    { type: 'Polygon', coordinates: [ring] },
    { type: 'MultiPolygon', coordinates: [[ring]] }
  ];
  const collection: Geometry = { type: 'GeometryCollection', geometries };
  const original = JSON.stringify(collection);
  const transformed = transform.geometry(collection);
  assert.equal(JSON.stringify(collection), original);
  assert.notEqual(transformed, collection);
  assert.equal(transformed.type, 'GeometryCollection');
  if (transformed.type !== 'GeometryCollection') return;
  const point = transformed.geometries[0];
  assert.equal(point.type, 'Point');
  if (point.type === 'Point')
    assert.deepEqual(point.coordinates.slice(2), [50, 123]);
  const polygon = transformed.geometries[4];
  if (polygon.type === 'Polygon')
    assert.deepEqual(polygon.coordinates[0][0], polygon.coordinates[0].at(-1));
  const properties = { name: 'Shared immutable attributes' };
  const batch: FeatureBatch = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', id: 'point', properties, geometry: geometries[0] },
      { type: 'Feature', id: 'null', properties: {}, geometry: null }
    ]
  };
  const output = transform.features(batch);
  assert.equal(output.features[0].id, 'point');
  assert.equal(output.features[0].properties, properties);
  assert.notEqual(output.features[0].geometry, geometries[0]);
  assert.equal(output.features[1].geometry, null);
  assert.equal(transform.accuracy.dimensions, 'horizontal-only');
});

test('identity transforms return fresh coordinates without inventing input accuracy', async () => {
  const transform = await createTransformService(createCrsRegistry()).prepare({
    source: 'EPSG:7856',
    target: 'EPSG:7856'
  });
  const input: Coord = [334435.7, 6250816.4];
  assert.deepEqual(transform.coordinate(input), input);
  assert.notEqual(transform.coordinate(input), input);
  assert.equal(transform.accuracy.operation, 'identity');
  assert.equal(transform.accuracy.horizontalAccuracyMetres, null);
});

test('invalid coordinates, geographic latitude, projection singularities and malformed geometry are typed failures', async () => {
  const transform = await createTransformService(createCrsRegistry()).prepare({
    source: 'EPSG:4326',
    target: 'EPSG:3857'
  });
  for (const input of [[NaN, 0], [0, Infinity], [0, 100], [1], [1, 2, 3]]) {
    assert.throws(() => transform.coordinate(input as unknown as Coord), {
      code: 'TRANSFORM_COORDINATE_INVALID'
    });
  }
  assert.throws(() => transform.coordinate([0, 90]), {
    code: 'TRANSFORM_FAILED'
  });
  assert.throws(
    () => transform.geometry({ type: 'Unknown' } as unknown as Geometry),
    { code: 'TRANSFORM_GEOMETRY_INVALID' }
  );
  assert.throws(
    () =>
      transform.geometry({
        type: 'Polygon',
        coordinates: [undefined]
      } as unknown as Geometry),
    { code: 'TRANSFORM_GEOMETRY_INVALID' }
  );
});

test('custom registry definitions stay instance scoped and cannot use proj4 global aliases as a fallback', async () => {
  const base = await createCrsRegistry().resolve('EPSG:7844');
  const left = new CrsRegistry();
  const right = new CrsRegistry();
  left.providers.register('custom', {
    resolve: (code) => (code === 'ORG:1' ? { ...base, code } : undefined)
  });
  const service = createTransformService(left);
  const prepared = await service.prepare({ source: 'ORG:1', target: 'ORG:1' });
  await assert.rejects(
    createTransformService(right).prepare({ source: 'ORG:1', target: 'ORG:1' }),
    { code: 'CRS_NOT_FOUND' }
  );
  assert.equal(proj4.defs('ORG:1'), undefined);
  left.providers.register('alias', {
    resolve: (code) => ({ ...base, code, proj4: 'EPSG:4326' })
  });
  await assert.rejects(service.prepare({ source: 'ORG:2', target: 'ORG:2' }), {
    code: 'TRANSFORM_DEFINITION_INVALID'
  });
  near(prepared.coordinate([151, -33]), [151, -33], 0);
});

test('custom missing/dynamic datum metadata is reported and optional named grids cannot silently fall back', async () => {
  const base = await createCrsRegistry().resolve('EPSG:7844');
  const registry = createCrsRegistry();
  registry.providers.register('custom', {
    resolve: (code) => {
      if (code === 'ORG:unknown') return { ...base, code, datum: undefined };
      if (code === 'ORG:dynamic')
        return {
          ...base,
          code,
          datum: {
            id: 'ORG:datum',
            name: 'Dynamic fixture',
            kind: 'dynamic',
            referenceEpoch: 2020
          }
        };
      if (code === 'ORG:grid')
        return {
          ...base,
          code,
          proj4: `${base.proj4} +nadgrids=@missing-grid,null`
        };
      if (code === 'ORG:compact-grid')
        return {
          ...base,
          code,
          proj4: `${base.proj4.replace(/\s+/g, '')}+nadgrids=@missing-grid,null`
        };
      if (code === 'ORG:invalid')
        return { ...base, code, proj4: '+proj=not-a-projection' };
      return undefined;
    }
  });
  const service = createTransformService(registry);
  const unknown = await service.prepare({
    source: 'ORG:unknown',
    target: 'EPSG:7844'
  });
  assert.equal(unknown.accuracy.datumRelationship, 'unknown');
  assert.ok(
    unknown.accuracy.warnings.some(
      (warning) => warning.code === 'DATUM_UNKNOWN'
    )
  );
  await assert.rejects(
    service.prepare({
      source: 'ORG:unknown',
      target: 'EPSG:7844',
      datumPolicy: 'require-same-datum'
    }),
    { code: 'TRANSFORM_DATUM_POLICY' }
  );
  const dynamic = await service.prepare({
    source: 'ORG:dynamic',
    target: 'ORG:dynamic'
  });
  assert.ok(
    dynamic.accuracy.warnings.some(
      (warning) => warning.code === 'EPOCH_NOT_APPLIED'
    )
  );
  await assert.rejects(
    service.prepare({ source: 'ORG:grid', target: 'EPSG:7844' }),
    { code: 'TRANSFORM_GRID_UNSUPPORTED' }
  );
  await assert.rejects(
    service.prepare({ source: 'ORG:compact-grid', target: 'EPSG:7844' }),
    { code: 'TRANSFORM_GRID_UNSUPPORTED' }
  );
  await assert.rejects(
    service.prepare({ source: 'ORG:invalid', target: 'EPSG:7844' }),
    { code: 'TRANSFORM_DEFINITION_INVALID' }
  );
});

test('registered feature renderers can use actual source/display transforms without modifying source geometry', async () => {
  const registry = createCrsRegistry();
  const service = createTransformService(registry);
  const reports: TransformAccuracy[] = [];
  const renderers = new Registry<LayerRenderer>();
  renderers.register('fake:features', {
    compatibility: () => undefined,
    prepare: async (source, context) => {
      const transform = await service.forDisplay(
        source.crs,
        context.displayCrs.code
      );
      reports.push(transform.accuracy);
      return { data: transform.features(source.data as FeatureBatch) };
    }
  });
  const manager = new LayerManager({ renderers });
  const { engine, display } = await mounted();
  await manager.attach(engine, display);
  const input = layer();
  input.source.crs = confirmed('EPSG:7844');
  const original = JSON.stringify(input.source.data);
  const active = manager.add(input);
  await active.ready;
  const output = engine.layers.get('points')!.data as FeatureBatch;
  assert.equal(JSON.stringify(input.source.data), original);
  assert.ok(output.features[0].geometry?.type === 'Point');
  if (output.features[0].geometry?.type === 'Point')
    near(
      [
        output.features[0].geometry.coordinates[0],
        output.features[0].geometry.coordinates[1]
      ],
      (
        await service.prepare({ source: 'EPSG:7844', target: display.code })
      ).coordinate([151, -33]),
      0
    );
  assert.equal(reports[0].datumRelationship, 'different');
  manager.destroy();
  engine.destroy();
});

test('prepared converters retain registry snapshots while later definitions and separate registries stay independent', async () => {
  const base = await createCrsRegistry().resolve('EPSG:3857');
  const definition = (offset: number): CrsDef => ({
    ...base,
    code: 'ORG:mercator',
    proj4: base.proj4.replace('+x_0=0', `+x_0=${offset}`)
  });
  const first = createCrsRegistry();
  const remove = first.providers.register('custom', {
    resolve: (code) => (code === 'ORG:mercator' ? definition(1000) : undefined)
  });
  const service = createTransformService(first);
  const prepared = await service.prepare({
    source: 'EPSG:4326',
    target: 'ORG:mercator'
  });
  near(prepared.coordinate([0, 0]), [1000, 0], 1e-8);
  remove();
  first.providers.register('replacement', {
    resolve: (code) => (code === 'ORG:mercator' ? definition(3000) : undefined)
  });
  near(
    (
      await service.prepare({ source: 'EPSG:4326', target: 'ORG:mercator' })
    ).coordinate([0, 0]),
    [3000, 0],
    1e-8
  );
  near(prepared.coordinate([0, 0]), [1000, 0], 1e-8);
  const second = createCrsRegistry();
  second.providers.register('custom', {
    resolve: (code) => (code === 'ORG:mercator' ? definition(5000) : undefined)
  });
  near(
    (
      await createTransformService(second).prepare({
        source: 'EPSG:4326',
        target: 'ORG:mercator'
      })
    ).coordinate([0, 0]),
    [5000, 0],
    1e-8
  );
  assert.equal(proj4.defs('ORG:mercator'), undefined);
});

test('native definition axes do not change core x/y order and display options cannot replace the confirmed source', async () => {
  const base = await createCrsRegistry().resolve('EPSG:4326');
  const registry = createCrsRegistry();
  registry.providers.register('axis-fixture', {
    resolve: (code) =>
      code === 'ORG:latitude-first'
        ? { ...base, code, proj4: `${base.proj4} +axis=neu` }
        : undefined
  });
  const service = createTransformService(registry);
  const transform = await service.forDisplay(
    confirmed('ORG:latitude-first'),
    'EPSG:3857'
  );
  near(
    transform.coordinate([151.21, -33.87]),
    fixtures.fixtures[0].expected,
    0.001
  );
  const overridden = await service.forDisplay(
    confirmed('EPSG:7844'),
    'EPSG:7856',
    { source: 'UNKNOWN', target: 'UNKNOWN' } as unknown as Parameters<
      typeof service.forDisplay
    >[2]
  );
  assert.equal(overridden.accuracy.source.code, 'EPSG:7844');
  assert.equal(overridden.accuracy.target.code, 'EPSG:7856');
});

test('malformed sparse geometry and cyclic collections fail without changing source data', async () => {
  const transform = await createTransformService(createCrsRegistry()).prepare({
    source: 'EPSG:7844',
    target: 'EPSG:7856'
  });
  assert.throws(
    () => transform.geometry({ type: 'LineString', coordinates: new Array(2) }),
    { code: 'TRANSFORM_COORDINATE_INVALID' }
  );
  const cyclic: Geometry = { type: 'GeometryCollection', geometries: [] };
  cyclic.geometries = [cyclic];
  assert.throws(() => transform.geometry(cyclic), {
    code: 'TRANSFORM_GEOMETRY_INVALID'
  });
});
