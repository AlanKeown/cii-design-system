import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCrsRegistry,
  CrsRegistry,
  Registry,
  MapError,
  resolveSourceCrs,
  toCoreCoord
} from '../src/index.ts';
import type {
  CrsDeclaration,
  ProbeContext,
  ProbeResult,
  SourceProvider
} from '../src/index.ts';

const declared = (code = 'EPSG:7856'): CrsDeclaration => ({
  code,
  provenance: { kind: 'declared', by: 'test-user' }
});
function context(
  crsMode: SourceProvider['crsMode'],
  probe: ProbeResult
): ProbeContext {
  const sources = new Registry<SourceProvider>();
  sources.register('fixture', { crsMode, probe: async () => probe });
  return {
    sources,
    crsRegistry: createCrsRegistry(),
    displayCrs: 'EPSG:3857',
    now: () => new Date('2026-11-04T00:00:00Z')
  };
}
const service: ProbeResult = {
  kind: 'metadata',
  nativeCode: 'EPSG:4326',
  candidates: [
    {
      crs: { code: 'EPSG:4326', axisOrder: 'yx' },
      provenance: {
        kind: 'service-metadata',
        url: 'https://example.org/wms?request=GetCapabilities',
        element: 'Layer/CRS'
      }
    },
    {
      crs: { code: 'EPSG:3857', axisOrder: 'xy' },
      provenance: {
        kind: 'service-metadata',
        url: 'https://example.org/wms?request=GetCapabilities',
        element: 'Layer/CRS'
      }
    }
  ]
};

test('bundled core and Australian definitions resolve without online lookups', async () => {
  const registry = createCrsRegistry();
  const mercator = await registry.resolve('EPSG:3857');
  assert.equal(
    mercator.tileMatrix?.resolutions[0],
    (2 * Math.PI * 6378137) / 256
  );
  assert.equal((await registry.resolve('OGC:CRS84')).projected, false);
  for (const code of [
    'EPSG:7844',
    'EPSG:4283',
    'EPSG:8058',
    'EPSG:6738',
    ...Array.from({ length: 6 }, (_, i) => `EPSG:${7854 + i}`),
    ...Array.from({ length: 5 }, (_, i) => `EPSG:${28354 + i}`)
  ]) {
    const def = await registry.resolve(code);
    assert.equal(def.code, code);
    assert.ok(def.proj4.startsWith('+proj='));
  }
  assert.match((await registry.resolve('EPSG:6738')).name, /zone 59/);
  await assert.rejects(registry.resolve('EPSG:28359'), {
    code: 'CRS_NOT_FOUND'
  });
  await assert.rejects(
    createCrsRegistry({ australia: false }).resolve('EPSG:7856'),
    { code: 'CRS_NOT_FOUND' }
  );
});

test('definition providers are queried in registration order; unknown codes never fall back', async () => {
  const registry = new CrsRegistry();
  const calls: string[] = [];
  const def = await createCrsRegistry().resolve('EPSG:3857');
  registry.providers.register('first', {
    resolve: async () => {
      calls.push('first');
      return undefined;
    }
  });
  registry.providers.register('custom', {
    resolve: () => {
      calls.push('custom');
      return { ...def, code: 'ORG:1' };
    }
  });
  assert.equal((await registry.resolve('ORG:1')).code, 'ORG:1');
  assert.deepEqual(calls, ['first', 'custom']);
});

test('R1.3: an embedded GeoJSON CRS is a hint, never confirmation', async () => {
  const ctx = context('declared', {
    kind: 'hint',
    hint: { code: 'OGC:CRS84', from: 'rfc7946_default' }
  });
  for (const crs of [undefined, { fromMetadata: true } as const]) {
    const result = await resolveSourceCrs({ provider: 'fixture', crs }, ctx);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'CRS_NOT_CONFIRMED');
  }
  const result = await resolveSourceCrs(
    { provider: 'fixture', crs: declared('OGC:CRS84') },
    ctx
  );
  assert.ok(result.ok);
  assert.equal(result.value.confirmedAt, '2026-11-04T00:00:00.000Z');
  assert.deepEqual(JSON.parse(JSON.stringify(result.value)), result.value);
});

test('mismatched code and WKT-only hints block until explicitly acknowledged', async () => {
  for (const hint of [
    { code: 'EPSG:4283', from: 'prj' as const },
    { wkt: 'unresolved WKT', from: 'prj' as const }
  ]) {
    const ctx = context('declared', { kind: 'hint', hint });
    const source = { provider: 'fixture', crs: declared() };
    const result = await resolveSourceCrs(source, ctx);
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'CRS_HINT_MISMATCH');
    const accepted = await resolveSourceCrs(source, {
      ...ctx,
      acknowledgeHintMismatch: true
    });
    assert.ok(accepted.ok);
    assert.equal(accepted.value.provenance.kind, 'declared');
    if (accepted.value.provenance.kind === 'declared')
      assert.equal(accepted.value.provenance.hintMismatchAcknowledged, true);
  }
});

test('service policy selects display or native CRS and preserves delivered axis order and provenance', async () => {
  const ctx = context('service-metadata', service);
  for (const policy of ['prefer-display', 'prefer-native'] as const) {
    const result = await resolveSourceCrs(
      { provider: 'fixture', crs: { fromMetadata: true, policy } },
      ctx
    );
    assert.ok(result.ok);
    assert.equal(
      result.value.crs.code,
      policy === 'prefer-display' ? 'EPSG:3857' : 'EPSG:4326'
    );
    assert.equal(result.value.provenance.kind, 'service-metadata');
    assert.deepEqual(
      toCoreCoord([1, 2], result.value.crs),
      policy === 'prefer-display' ? [1, 2] : [2, 1]
    );
  }
  const result = await resolveSourceCrs(
    { provider: 'fixture', crs: declared() },
    ctx
  );
  assert.ok(!result.ok);
  assert.equal(result.error.code, 'CRS_DECLARATION_NOT_ALLOWED');
});

test('database metadata can require a declaration by organisation policy', async () => {
  const ctx = context('database-metadata', {
    kind: 'metadata',
    nativeCode: 'EPSG:7856',
    candidates: [
      {
        crs: { code: 'EPSG:7856', axisOrder: 'xy' },
        provenance: {
          kind: 'database-metadata',
          table: 'assets.parcels',
          column: 'geom',
          srid: 7856
        }
      }
    ]
  });
  const automatic = await resolveSourceCrs(
    { provider: 'fixture', crs: { fromMetadata: true } },
    ctx
  );
  assert.ok(automatic.ok);
  const blocked = await resolveSourceCrs(
    { provider: 'fixture', crs: { fromMetadata: true } },
    { ...ctx, requireDeclaration: true }
  );
  assert.ok(!blocked.ok);
  assert.equal(blocked.error.code, 'CRS_NOT_CONFIRMED');
  const explicit = await resolveSourceCrs(
    { provider: 'fixture', crs: declared() },
    { ...ctx, requireDeclaration: true }
  );
  assert.ok(explicit.ok);
});

test('unknown CRS, empty metadata and forged metadata kinds fail explicitly', async () => {
  const unknown = await resolveSourceCrs(
    { provider: 'fixture', crs: declared('UNKNOWN:1') },
    context('declared', { kind: 'hint' })
  );
  assert.ok(!unknown.ok);
  assert.equal(unknown.error.code, 'CRS_NOT_FOUND');
  for (const ctx of [
    context('service-metadata', { kind: 'metadata', candidates: [] }),
    context('database-metadata', service)
  ]) {
    const result = await resolveSourceCrs(
      { provider: 'fixture', crs: { fromMetadata: true } },
      ctx
    );
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'CRS_METADATA_INVALID');
  }
});

test('registry rejects duplicates, isolates instances and protects replacement registrations', () => {
  const registry = new Registry<object>();
  const value = {};
  const remove = registry.register('extension', value);
  assert.throws(() => registry.register('extension', {}), MapError);
  remove();
  registry.register('extension', value);
  remove();
  assert.equal(registry.require('extension'), value);
  assert.equal(new Registry().get('extension'), undefined);
});
