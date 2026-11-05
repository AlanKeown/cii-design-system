import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { withPostgis } from './support/postgis.ts';
import { runTargetAudit } from './support/target-audit.ts';
import { assertTargetTransformation } from '../../maps-server/src/target-audit.ts';
import { accuracyOracleImage } from '../tests/support/accuracy-cases.ts';

await withPostgis(
  async (query) => {
    const report = await runTargetAudit(async (sql) => {
      assert.match(sql, /^\s*(SELECT|WITH)\b/i);
      return JSON.parse(
        await query(
          `BEGIN READ ONLY; SET LOCAL statement_timeout=15000; ${sql} COMMIT;`
        )
      );
    }, 'disposable-local-development-reference');
    assert.equal(report.inspection.schema, 'mapping audit');
    assert.equal(report.inspection.readOnly, true);
    assert.equal(report.comparisons.executed, 40);
    assert.equal(report.comparisons.failed, 0);
    assert.equal(report.comparisons.sameDatumProjectionCasesPassed, 32);
    assert.equal(report.gridControl.status, 'usable');
    assert.doesNotThrow(() =>
      assertTargetTransformation(report.inspection, report.gridProbes, {
        kind: 'automatic'
      })
    );
    assert.doesNotThrow(() =>
      assertTargetTransformation(report.inspection, report.gridProbes, {
        kind: 'explicit-pipeline'
      })
    );
    for (const probe of report.gridProbes)
      if (probe.status !== 'usable')
        assert.throws(
          () =>
            assertTargetTransformation(report.inspection, report.gridProbes, {
              kind: 'named-grid',
              grid: probe.grid
            }),
          { code: 'TARGET_CAPABILITY_UNSUPPORTED' }
        );
    await writeFile(
      new URL('../tests/fixtures/local-target-audit.json', import.meta.url),
      JSON.stringify({ ...report, oracleImage: accuracyOracleImage }, null, 2) +
        '\n'
    );
    console.log(
      JSON.stringify({
        status: report.status,
        inspection: report.inspection.schema,
        comparisons: report.comparisons,
        gridProbes: report.gridProbes
      })
    );
  },
  { postgisSchema: 'mapping audit' }
);
