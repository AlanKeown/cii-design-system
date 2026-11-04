import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import proj4 from 'proj4';
import { createCrsRegistry, createTransformService } from '../src/index.ts';
import {
  accuracyCases,
  accuracyOracleImage
} from '../tests/support/accuracy-cases.ts';
import type { AccuracyFixtureSet } from '../tests/support/accuracy-cases.ts';
import { renderAccuracyReport } from '../tests/support/accuracy-report.ts';

const args = process.argv.slice(2);
if (args.length !== 1 || !['--write', '--check'].includes(args[0]))
  throw new Error(
    'Use --write to regenerate fixtures, or --check to compare the live oracle with checked-in fixtures.'
  );
const run = promisify(execFile);
const container = `cii-maps-accuracy-${randomUUID()}`;
const fixtureFile = new URL(
  '../tests/fixtures/postgis-accuracy.json',
  import.meta.url
);
const reportFile = new URL(
  '../tests/fixtures/accuracy-report.md',
  import.meta.url
);
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = `
CREATE FUNCTION pg_temp.cii_grid_probe(grid_name text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ST_TransformPipeline(ST_SetSRID(ST_MakePoint(151.21,-33.87),4283),
    '+proj=pipeline +step +proj=unitconvert +xy_in=deg +xy_out=rad +step +proj=hgridshift +grids=' || grid_name ||
    ' +step +proj=unitconvert +xy_in=rad +xy_out=deg', 7844);
  RETURN jsonb_build_object('name',grid_name,'usableAtSydney',true,'errorState',null);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('name',grid_name,'usableAtSydney',false,'errorState',SQLSTATE);
END $$;
WITH samples AS (
  SELECT value AS item FROM jsonb_array_elements(${quote(JSON.stringify(accuracyCases))}::jsonb)
), inputs AS (
  SELECT item, ST_SetSRID(ST_MakePoint((item->'input'->>0)::float8,(item->'input'->>1)::float8), (item->>'sourceSrid')::integer) AS geom FROM samples
), outputs AS (
  SELECT item, CASE WHEN item->>'method' = 'ST_TransformPipeline'
    THEN ST_TransformPipeline(geom,item->>'pipeline',(item->>'targetSrid')::integer)
    ELSE ST_Transform(geom,(item->>'targetSrid')::integer) END AS geom FROM inputs
)
SELECT jsonb_build_object(
  'postgisFullVersion', PostGIS_Full_Version(),
  'postgresVersion', current_setting('server_version'),
  'outputs', (SELECT jsonb_agg(jsonb_build_object('id',item->>'id','expected',jsonb_build_array(ST_X(geom),ST_Y(geom))) ORDER BY item->>'id') FROM outputs),
  'gridProbes', jsonb_build_array(
    pg_temp.cii_grid_probe('au_icsm_GDA94_GDA2020_conformal.tif'),
    pg_temp.cii_grid_probe('au_icsm_GDA94_GDA2020_conformal_and_distortion.tif'))
);`;

function psql(statement: string, timeout = 30_000) {
  return run(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-X',
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-Atq',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      statement
    ],
    { maxBuffer: 4 * 1024 * 1024, timeout }
  );
}

console.log(
  'Starting isolated PostGIS accuracy oracle (no host ports or persistent data).'
);
try {
  await run(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      container,
      '--network',
      'none',
      '--memory',
      '512m',
      '--pids-limit',
      '256',
      '--tmpfs',
      '/var/lib/postgresql/data:rw,size=512m',
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      '-e',
      'PROJ_NETWORK=OFF',
      accuracyOracleImage
    ],
    { timeout: 120_000 }
  );
  let ready = false;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await psql('SELECT PostGIS_Full_Version();', 1000);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error('Disposable PostGIS did not become ready.');
  const { stdout } = await psql(sql);
  const captured = JSON.parse(stdout.trim()) as {
    postgisFullVersion: string;
    postgresVersion: string;
    outputs: { id: string; expected: [number, number] }[];
    gridProbes: AccuracyFixtureSet['oracle']['gridProbes'];
  };
  if (!captured.postgisFullVersion.includes('NETWORK_ENABLED=OFF'))
    throw new Error('Oracle must keep PROJ network access disabled.');
  if (captured.outputs.length !== accuracyCases.length)
    throw new Error('Oracle returned an incomplete fixture set.');
  const transforms = createTransformService(createCrsRegistry());
  const fixtures: AccuracyFixtureSet['fixtures'] = [];
  for (const entry of accuracyCases) {
    const expected = captured.outputs.find(
      (output) => output.id === entry.id
    )?.expected;
    if (!expected || expected.length !== 2 || !expected.every(Number.isFinite))
      throw new Error(`Invalid oracle coordinate: ${entry.id}`);
    const transform = await transforms.prepare({
      source: entry.source,
      target: entry.target
    });
    const browser = transform.coordinate(entry.input);
    fixtures.push({
      ...entry,
      expected,
      browserAtCapture: browser,
      residualAtCapture: Math.hypot(
        browser[0] - expected[0],
        browser[1] - expected[1]
      ),
      warningsAtCapture: transform.accuracy.warnings.map(
        (warning) => warning.code
      )
    });
  }
  const result: AccuracyFixtureSet = {
    schemaVersion: 1,
    browser: { library: 'proj4', version: proj4.version },
    oracle: {
      image: accuracyOracleImage,
      postgisFullVersion: captured.postgisFullVersion,
      postgresVersion: captured.postgresVersion,
      networkEnabled: false,
      axisConvention: 'xy',
      gridProbes: captured.gridProbes
    },
    fixtures
  };
  if (args[0] === '--write') {
    await writeFile(
      fixtureFile,
      await format(JSON.stringify(result), { parser: 'json' })
    );
    await writeFile(
      reportFile,
      await format(renderAccuracyReport(result), { parser: 'markdown' })
    );
    console.log(`Wrote ${fixtures.length} PostGIS accuracy fixtures.`);
  } else {
    const expected = JSON.parse(
      await readFile(fixtureFile, 'utf8')
    ) as AccuracyFixtureSet;
    if (
      (await readFile(reportFile, 'utf8')) !==
      (await format(renderAccuracyReport(expected), { parser: 'markdown' }))
    )
      throw new Error(
        'Accuracy report is stale; regenerate and review the fixtures.'
      );
    if (JSON.stringify(result.browser) !== JSON.stringify(expected.browser))
      throw new Error(
        'Browser transform version changed; regenerate and review the fixtures.'
      );
    if (JSON.stringify(result.oracle) !== JSON.stringify(expected.oracle))
      throw new Error(
        'Accuracy oracle metadata changed; regenerate and review the fixtures.'
      );
    if (result.fixtures.length !== expected.fixtures.length)
      throw new Error('Accuracy fixture count changed.');
    for (const actual of result.fixtures) {
      const previous = expected.fixtures.find(
        (entry) => entry.id === actual.id
      );
      if (!previous) throw new Error(`Missing fixture: ${actual.id}`);
      const {
        expected: _old,
        browserAtCapture: _browser,
        residualAtCapture: _residual,
        warningsAtCapture: _warnings,
        ...oldCase
      } = previous;
      const {
        expected: _new,
        browserAtCapture: _newBrowser,
        residualAtCapture: _newResidual,
        warningsAtCapture: _newWarnings,
        ...newCase
      } = actual;
      if (JSON.stringify(oldCase) !== JSON.stringify(newCase))
        throw new Error(`Accuracy case changed: ${actual.id}`);
      if (
        Math.hypot(
          actual.expected[0] - previous.expected[0],
          actual.expected[1] - previous.expected[1]
        ) > actual.tolerance
      )
        throw new Error(`PostGIS output drift: ${actual.id}`);
      if (
        Math.abs(actual.residualAtCapture - previous.residualAtCapture) >
        actual.tolerance
      )
        throw new Error(`Browser/PostGIS residual drift: ${actual.id}`);
      if (
        Math.hypot(
          actual.browserAtCapture[0] - previous.browserAtCapture[0],
          actual.browserAtCapture[1] - previous.browserAtCapture[1]
        ) > actual.tolerance
      )
        throw new Error(`Browser coordinate drift: ${actual.id}`);
      if (
        JSON.stringify(actual.warningsAtCapture) !==
        JSON.stringify(previous.warningsAtCapture)
      )
        throw new Error(`Datum warning drift: ${actual.id}`);
    }
    console.log(
      `Live PostGIS verification passed for ${fixtures.length} accuracy fixtures.`
    );
  }
} finally {
  // Remove only the unique container created by this invocation; never touch app databases.
  await run('docker', ['rm', '--force', container], { timeout: 30_000 }).catch(
    (error: unknown) => {
      if (
        !error ||
        typeof error !== 'object' ||
        !('stderr' in error) ||
        typeof error.stderr !== 'string' ||
        !error.stderr.includes('No such container')
      )
        throw error;
    }
  );
}
