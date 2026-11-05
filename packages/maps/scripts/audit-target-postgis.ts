import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import proj4 from 'proj4';
import { createCrsRegistry, createTransformService } from '../src/index.ts';
import { accuracyCases } from '../tests/support/accuracy-cases.ts';
import { sqlLiteral } from './support/postgis.ts';

/** Credentials are resolved by libpq's existing service/passfile configuration, never command arguments. */
const output = process.argv[2];
if (!output)
  throw new Error('Pass an output JSON path to retain the target audit.');
const service = process.env.CII_MAPS_AUDIT_SERVICE;
if (!service || !/^[\w.-]+$/.test(service))
  throw new Error(
    'Set CII_MAPS_AUDIT_SERVICE to an authorised, read-only libpq service profile name.'
  );
const run = promisify(execFile);
const query = async (sql: string) => {
  const result = await run(
    'psql',
    [
      '-X',
      '-Atq',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'VERBOSITY=sqlstate',
      '-c',
      `BEGIN READ ONLY; SET LOCAL statement_timeout = 15000; ${sql} COMMIT;`
    ],
    {
      env: {
        ...process.env,
        PGSERVICE: service,
        PGOPTIONS:
          '-c default_transaction_read_only=on -c statement_timeout=15000'
      },
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024
    }
  );
  return result.stdout.trim();
};
const transforms = createTransformService(createCrsRegistry());
const results = [];
for (const sample of accuracyCases) {
  const point = `ST_SetSRID(ST_MakePoint(${sample.input[0]},${sample.input[1]}),${sample.sourceSrid})`;
  const operation =
    sample.method === 'ST_TransformPipeline'
      ? `ST_TransformPipeline(${point},${sqlLiteral(sample.pipeline!)},${sample.targetSrid})`
      : `ST_Transform(${point},${sample.targetSrid})`;
  const expected = JSON.parse(
    await query(
      `WITH result AS (SELECT ${operation} AS geom) SELECT jsonb_build_array(ST_X(geom),ST_Y(geom)) FROM result;`
    )
  ) as number[];
  const transform = await transforms.prepare({
    source: sample.source,
    target: sample.target
  });
  const browser = transform.coordinate(sample.input);
  results.push({
    id: sample.id,
    method: sample.method,
    pipeline: sample.pipeline ?? null,
    expected,
    browser,
    residualTargetUnits: Math.hypot(
      browser[0] - expected[0],
      browser[1] - expected[1]
    )
  });
}
const gridProbes = [];
for (const grid of [
  'au_icsm_GDA94_GDA2020_conformal.tif',
  'au_icsm_GDA94_GDA2020_conformal_and_distortion.tif'
]) {
  const pipeline = `+proj=pipeline +step +proj=unitconvert +xy_in=deg +xy_out=rad +step +proj=hgridshift +grids=${grid} +step +proj=unitconvert +xy_in=rad +xy_out=deg`;
  try {
    const output = await query(
      `SELECT ST_AsGeoJSON(ST_TransformPipeline(ST_SetSRID(ST_MakePoint(151.21,-33.87),4283),${sqlLiteral(pipeline)},7844),17,0);`
    );
    gridProbes.push({ grid, usableAtSydney: true, output: JSON.parse(output) });
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error
        ? String(error.stderr)
        : '';
    gridProbes.push({
      grid,
      usableAtSydney: false,
      sqlState: stderr.match(/ERROR:\s+([A-Z0-9]{5})/)?.[1] ?? 'unknown'
    });
  }
}
const report = {
  measuredAt: new Date().toISOString(),
  target: process.env.CII_MAPS_AUDIT_LABEL ?? service,
  postgis: await query('SELECT PostGIS_Full_Version();'),
  readOnly: await query('SHOW transaction_read_only;'),
  proj4: proj4.version,
  gridProbes,
  results,
  limits:
    'Default ST_Transform operation selection is not introspected. Named-grid probes and explicit pipeline cases show only the operations tested. No DDL, DML or target-data reads are performed.'
};
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(
  `Wrote read-only audit (${results.length} comparisons, ${gridProbes.length} grid probes).`
);
