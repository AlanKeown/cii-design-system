import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { withPostgis, sqlLiteral } from './support/postgis.ts';
import { rebuildPolygon } from '../spikes/rebuild-polygon.ts';
import type { VertexProjection } from '../spikes/rebuild-polygon.ts';
import type { Coord, Geometry, VertexSource } from '../src/index.ts';

const sql = await readFile(
  new URL('../spikes/rebuild-polygon.sql', import.meta.url),
  'utf8'
);
const input = {
  type: 'Polygon' as const,
  coordinates: [
    Array.from({ length: 999 }, (_, i): Coord => [
      334435.70614098536 + Math.cos((i / 999) * 2 * Math.PI) * 100,
      6250816.397908207 + Math.sin((i / 999) * 2 * Math.PI) * 100
    ])
  ]
};
input.coordinates[0].push(input.coordinates[0][0]);
const stored = structuredClone(input);
const origins: VertexSource[] = input.coordinates[0].map((coordinate, i) =>
  i % 3 === 0
    ? { kind: 'stored', path: [0, i] }
    : i % 3 === 1
      ? { kind: 'snapped', layer: 'sites', crs: 'EPSG:7856', coordinate }
      : { kind: 'freehand' }
);
const manifest = sqlLiteral(JSON.stringify(origins));
const expected = sqlLiteral(JSON.stringify(stored));
await withPostgis(async (query) => {
  const version = await query('SELECT PostGIS_Full_Version();');
  const display = JSON.parse(
    await query(
      `SELECT ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${expected}),7856),3857),17,0);`
    )
  ) as typeof input;
  const request = `SELECT pg_temp.rebuild_polygon(${sqlLiteral(JSON.stringify(display))},3857,7856,${manifest},${expected},'7','7');`;
  // pg_temp functions are connection-scoped, so prepend the definition for each psql connection.
  const startedSql = performance.now();
  const resultSql = JSON.parse(
    (await query(sql + request)).split('\n').at(-1)!
  ) as Geometry;
  const sqlMs = performance.now() - startedSql;
  const project = async (
    requests: readonly VertexProjection[]
  ): Promise<Coord[]> => {
    if (!requests.length) return [];
    const rows = sqlLiteral(JSON.stringify(requests));
    const text =
      await query(`WITH items AS (SELECT value,ordinality FROM jsonb_array_elements(${rows}::jsonb) WITH ORDINALITY), projected AS (
      SELECT ordinality, ST_Transform(ST_SetSRID(ST_MakePoint((value->'coordinate'->>0)::float8,(value->'coordinate'->>1)::float8),CASE value->>'source' WHEN 'EPSG:7856' THEN 7856 WHEN 'EPSG:3857' THEN 3857 END),7856) AS geom FROM items)
      SELECT jsonb_agg(jsonb_build_array(ST_X(geom),ST_Y(geom)) ORDER BY ordinality) FROM projected;`);
    return JSON.parse(text);
  };
  const startedA = performance.now();
  const resultA = await rebuildPolygon(
    display,
    'EPSG:3857',
    'EPSG:7856',
    origins,
    project,
    { geometry: stored, version: '7', baseVersion: '7' }
  );
  const adapterAMs = performance.now() - startedA;
  assert.deepEqual(resultA, resultSql);
  for (let i = 0; i < origins.length; i++)
    if (origins[i].kind !== 'freehand')
      assert.deepEqual(resultA.coordinates[0][i], stored.coordinates[0][i]);
  await assert.rejects(
    query(sql + request.replace("'7','7'", "'6','7'")),
    /EDIT_CONFLICT/
  );
  await assert.rejects(
    rebuildPolygon(display, 'EPSG:3857', 'EPSG:7856', origins, project, {
      geometry: stored,
      version: '7',
      baseVersion: '6'
    }),
    /EDIT_CONFLICT/
  );
  await assert.rejects(
    rebuildPolygon(display, 'EPSG:3857', 'EPSG:7856', origins.slice(1), project)
  );
  const report = {
    measuredAt: new Date().toISOString(),
    version,
    vertices: 1000,
    sqlMs,
    adapterAMs,
    exactRetainedVertices: origins.filter(
      (origin) => origin.kind !== 'freehand'
    ).length,
    conclusion:
      'Rebuild retained coordinates in target CRS after transforming freehand vertices. SQL and batched adapter A results agree exactly; stale stored-row versions fail.',
    limits:
      'XY Polygon prototype, one ring, one sample per path. Timing includes docker exec/psql startup and JSON transport. Not a production persistence adapter or RLS/transaction certification.'
  };
  await writeFile(
    new URL('../tests/fixtures/vertex-benchmark.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n'
  );
  console.log(JSON.stringify(report));
});
