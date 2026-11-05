import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runTargetAudit } from '../scripts/support/target-audit.ts';

const fixture = JSON.parse(
  await readFile(
    new URL('./fixtures/supabase-target-audit.json', import.meta.url),
    'utf8'
  )
);

test('hosted audit regression preserves 38 measurements and skips the two unavailable exact operations', async () => {
  let metadata = 0,
    pipelineQueries = 0;
  const report = await runTargetAudit(async (sql) => {
    if (sql.includes("'extension'")) {
      metadata++;
      return {
        postgresVersion: fixture.inspection.postgresVersion,
        readOnly: true,
        extension: {
          schema: fixture.inspection.schema,
          version: fixture.inspection.version
        }
      };
    }
    if (sql.includes("'fullVersion'")) {
      metadata++;
      return {
        fullVersion: fixture.inspection.fullVersion,
        hasTransform: true,
        hasTransformPipeline: false,
        crsAuthorities: fixture.inspection.crsAuthorities
      };
    }
    if (sql.includes('.st_transformpipeline(')) pipelineQueries++;
    assert.ok(sql.includes('"extensions".st_transform('));
    const id = sql.match(/'id','([^']+)'/)?.[1];
    if (id) {
      const row = fixture.results.find(
        (entry: { id: string }) => entry.id === id
      );
      assert.ok(row?.expected);
      return { id, expected: row.expected };
    }
    if (sql.includes('+nadgrids=null')) return [151.21, -33.87];
    throw Object.assign(
      new Error('ERROR: XX000: No inverse operation (4098)'),
      { sqlState: 'XX000' }
    );
  }, 'hosted-regression');
  assert.equal(metadata, 2);
  assert.equal(pipelineQueries, 0);
  assert.equal(report.comparisons.executed, 38);
  assert.equal(report.comparisons.unsupported, 2);
  assert.equal(report.comparisons.failed, 0);
  assert.equal(report.comparisons.sameDatumProjectionCasesPassed, 32);
  assert.equal(report.comparisons.datumComparisons, 6);
  assert.equal(report.status, 'completed-with-limitations');
  assert.equal(report.gridControl.status, 'usable');
  assert.ok(
    report.gridProbes.every(
      (probe) =>
        probe.status === 'failed' &&
        probe.physicalGridInstallation === 'unknown'
    )
  );
});
test('changed authority metadata blocks measurements rather than reinterpreting local SRIDs as EPSG', async () => {
  const report = await runTargetAudit(async (sql) => {
    if (sql.includes("'extension'"))
      return {
        postgresVersion: '17',
        readOnly: true,
        extension: { schema: 'public', version: '3.3.7' }
      };
    if (sql.includes("'fullVersion'"))
      return {
        fullVersion: 'PROJ="9"',
        hasTransform: true,
        hasTransformPipeline: false,
        crsAuthorities: []
      };
    return [151.21, -33.87];
  }, 'missing-authorities');
  assert.equal(report.status, 'failed');
  assert.equal(report.comparisons.executed, 0);
  assert.equal(report.comparisons.failed, 40);
});
