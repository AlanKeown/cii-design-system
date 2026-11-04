import assert from 'node:assert/strict';
import { test } from 'node:test';
import { probeGeometryColumn } from '../src/index.ts';

test('geometry_columns metadata preserves source SRID separately from CRS authority', () => {
  const result = probeGeometryColumn({
    schema: 'assets',
    table: 'parcels',
    column: 'geom',
    srid: 100001,
    authority: { name: 'EPSG', code: 7856 }
  });
  assert.equal(result.kind, 'metadata');
  if (result.kind !== 'metadata') return;
  assert.equal(result.nativeCode, 'EPSG:7856');
  assert.deepEqual(result.candidates[0].provenance, {
    kind: 'database-metadata',
    table: 'assets.parcels',
    column: 'geom',
    srid: 100001
  });
});

test('undefined database CRS requires declaration and unknown authorities cannot be invented', () => {
  const metadata = {
    schema: 'assets',
    table: 'parcels',
    column: 'geom',
    srid: 0
  };
  assert.deepEqual(probeGeometryColumn(metadata), { kind: 'hint' });
  assert.throws(() => probeGeometryColumn({ ...metadata, srid: 7856 }), {
    code: 'CRS_METADATA_INVALID'
  });
  assert.throws(() => probeGeometryColumn({ ...metadata, srid: -1 }), {
    code: 'CRS_METADATA_INVALID'
  });
});
