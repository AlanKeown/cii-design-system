import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  inspectPostgisTarget,
  assertTargetTransformation,
  probeAustralianGrid,
  AUSTRALIAN_TRANSFORM_GRIDS,
  postgisFunction,
  quoteSqlIdentifier
} from '../src/index.ts';
import type { AuditQuery, GridProbe, PostgisInspection } from '../src/index.ts';

function inspection(
  overrides: Partial<PostgisInspection> = {}
): PostgisInspection {
  return {
    postgresVersion: '17.11',
    readOnly: true,
    schema: 'extensions',
    version: '3.3.7',
    fullVersion: 'POSTGIS="3.3.7" PROJ="9.7.1"',
    projVersion: '9.7.1',
    hasTransform: true,
    hasTransformPipeline: false,
    crsAuthorities: [],
    ...overrides
  };
}
const grid = AUSTRALIAN_TRANSFORM_GRIDS[0];
function probe(overrides: Partial<GridProbe> = {}): GridProbe {
  return {
    grid,
    input: [151.21, -33.87],
    control: false,
    method: 'definitions',
    status: 'failed',
    physicalGridInstallation: 'unknown',
    ...overrides
  };
}

test('PostGIS schema is discovered and quoted; function support is not inferred from version', async () => {
  const statements: string[] = [];
  const query: AuditQuery = async (sql) => {
    statements.push(sql);
    if (statements.length === 1)
      return {
        postgresVersion: '17.11',
        readOnly: true,
        extension: { schema: 'geo"audit', version: '99.0' }
      };
    return {
      fullVersion: 'POSTGIS="99.0" PROJ="9.7.1 NETWORK_ENABLED=OFF"',
      hasTransform: true,
      hasTransformPipeline: false,
      crsAuthorities: [{ srid: 7856, authority: 'EPSG', authorityCode: 7856 }]
    };
  };
  const result = await inspectPostgisTarget(query, [7856]);
  assert.equal(result.schema, 'geo"audit');
  assert.equal(result.hasTransformPipeline, false);
  assert.equal(result.projVersion, '9.7.1');
  assert.ok(statements[1].includes('"geo""audit".postgis_full_version()'));
  assert.ok(statements[1].includes('"geo""audit".spatial_ref_sys'));
  assert.equal(quoteSqlIdentifier('extensions'), '"extensions"');
  assert.throws(
    () =>
      Reflect.apply(postgisFunction, undefined, [
        result,
        'st_transform(); SELECT 1'
      ]),
    { code: 'TARGET_AUDIT_INVALID' }
  );
});
test('missing PostGIS is a capability result, while non-read-only or malformed metadata is rejected', async () => {
  const absent = await inspectPostgisTarget(
    async () => ({ postgresVersion: '17', readOnly: true, extension: null }),
    []
  );
  assert.equal(absent.schema, null);
  assert.equal(absent.hasTransform, false);
  assert.throws(
    () => assertTargetTransformation(absent, [], { kind: 'automatic' }),
    { code: 'TARGET_CAPABILITY_UNSUPPORTED' }
  );
  await assert.rejects(
    inspectPostgisTarget(
      async () => ({ postgresVersion: '17', readOnly: false, extension: null }),
      []
    ),
    { code: 'TARGET_AUDIT_INVALID' }
  );
  await assert.rejects(
    inspectPostgisTarget(
      async () => ({
        postgresVersion: '17',
        readOnly: true,
        extension: { schema: 'x', version: null }
      }),
      []
    )
  );
  let calls = 0;
  await assert.rejects(
    inspectPostgisTarget(async () => {
      calls++;
      return {};
    }, [NaN])
  );
  assert.equal(calls, 0);
});
test('automatic transforms never satisfy an explicit-pipeline or failed-grid requirement', () => {
  const target = inspection();
  assert.doesNotThrow(() =>
    assertTargetTransformation(target, [], { kind: 'automatic' })
  );
  assert.throws(
    () => assertTargetTransformation(target, [], { kind: 'explicit-pipeline' }),
    { code: 'TARGET_CAPABILITY_UNSUPPORTED' }
  );
  for (const record of [
    probe(),
    probe({ status: 'unsupported' }),
    probe({ status: 'usable', control: true })
  ])
    assert.throws(
      () =>
        assertTargetTransformation(target, [record], {
          kind: 'named-grid',
          grid
        }),
      { code: 'TARGET_CAPABILITY_UNSUPPORTED' }
    );
  assert.doesNotThrow(() =>
    assertTargetTransformation(target, [probe({ status: 'usable' })], {
      kind: 'named-grid',
      grid
    })
  );
  assert.doesNotThrow(() =>
    assertTargetTransformation(inspection({ hasTransformPipeline: true }), [], {
      kind: 'explicit-pipeline'
    })
  );
});
test('older target grid probes use labelled definitions and failed operations do not claim missing files', async () => {
  let statement = '';
  const failed = await probeAustralianGrid(
    async (sql) => {
      statement = sql;
      throw Object.assign(
        new Error('ERROR: XX000: No inverse operation (4098)'),
        { sqlState: 'XX000' }
      );
    },
    inspection(),
    grid
  );
  assert.equal(failed.method, 'definitions');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.sqlState, 'XX000');
  assert.equal(failed.projErrorCode, 4098);
  assert.equal(failed.physicalGridInstallation, 'unknown');
  assert.ok(statement.includes('"extensions".st_transform('));
  assert.ok(!statement.includes('.st_transformpipeline('));
  assert.ok(statement.includes('+nadgrids=' + grid));
  const control = await probeAustralianGrid(
    async (sql) => {
      assert.ok(sql.includes('+nadgrids=null'));
      return [151.21, -33.87];
    },
    inspection(),
    grid,
    { nullControl: true }
  );
  assert.equal(control.status, 'usable');
  assert.equal(control.control, true);
  assert.throws(() =>
    assertTargetTransformation(inspection(), [control], {
      kind: 'named-grid',
      grid
    })
  );
});
test('grid transport errors and invalid responses are not misclassified as capability failures', async () => {
  await assert.rejects(
    probeAustralianGrid(
      async () => {
        throw new Error('ECONNRESET');
      },
      inspection(),
      grid
    ),
    /ECONNRESET/
  );
  await assert.rejects(
    probeAustralianGrid(async () => [NaN, 0], inspection(), grid),
    { code: 'TARGET_AUDIT_INVALID' }
  );
  const pipeline = await probeAustralianGrid(
    async (sql) => {
      assert.ok(sql.includes('.st_transformpipeline('));
      return [151.21, -33.87];
    },
    inspection({ hasTransformPipeline: true }),
    grid
  );
  assert.equal(pipeline.method, 'pipeline');
  assert.equal(pipeline.status, 'usable');
});
