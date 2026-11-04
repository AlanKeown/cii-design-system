import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { format } from 'prettier';
import proj4 from 'proj4';
import captured from './fixtures/postgis-accuracy.json' with { type: 'json' };
import { createCrsRegistry, createTransformService } from '../src/index.ts';
import {
  accuracyCases,
  accuracyOracleImage,
  gda94To2020Pipeline
} from './support/accuracy-cases.ts';
import { renderAccuracyReport } from './support/accuracy-report.ts';

test('PostGIS accuracy manifest matches the reviewed case catalog, oracle and browser version', () => {
  assert.equal(captured.schemaVersion, 1);
  assert.equal(captured.browser.library, 'proj4');
  assert.equal(captured.browser.version, proj4.version);
  assert.equal(captured.oracle.image, accuracyOracleImage);
  assert.ok(captured.oracle.postgisFullVersion.includes('POSTGIS='));
  assert.ok(captured.oracle.postgisFullVersion.includes('PROJ='));
  assert.ok(captured.oracle.postgisFullVersion.includes('NETWORK_ENABLED=OFF'));
  assert.equal(captured.oracle.networkEnabled, false);
  assert.equal(captured.oracle.axisConvention, 'xy');
  assert.equal(captured.fixtures.length, accuracyCases.length);
  assert.equal(
    new Set(captured.fixtures.map((entry) => entry.id)).size,
    accuracyCases.length
  );
  for (const expected of accuracyCases) {
    const entry = captured.fixtures.find(
      (fixture) => fixture.id === expected.id
    );
    assert.ok(entry, expected.id);
    const {
      expected: coordinate,
      browserAtCapture,
      residualAtCapture,
      warningsAtCapture: _warnings,
      ...caseDefinition
    } = entry;
    assert.deepEqual(caseDefinition, expected);
    assert.equal(coordinate.length, 2);
    assert.ok(coordinate.every(Number.isFinite));
    assert.equal(browserAtCapture.length, 2);
    assert.ok(browserAtCapture.every(Number.isFinite));
    assert.equal(entry.tolerance, entry.units === 'metres' ? 0.001 : 1e-8);
    assert.ok(Number.isFinite(residualAtCapture) && residualAtCapture >= 0);
    assert.ok(
      Math.abs(
        Math.hypot(
          browserAtCapture[0] - coordinate[0],
          browserAtCapture[1] - coordinate[1]
        ) - residualAtCapture
      ) <= 1e-12
    );
  }
});

const service = createTransformService(createCrsRegistry());
for (const entry of captured.fixtures) {
  test(`PostGIS accuracy: ${entry.id}`, async () => {
    const transform = await service.prepare({
      source: entry.source,
      target: entry.target
    });
    const actual = transform.coordinate([entry.input[0], entry.input[1]]);
    const residual = Math.hypot(
      actual[0] - entry.expected[0],
      actual[1] - entry.expected[1]
    );
    assert.deepEqual(
      transform.accuracy.warnings.map((warning) => warning.code),
      entry.warningsAtCapture
    );
    assert.equal(transform.accuracy.authoritative, false);
    assert.equal(transform.accuracy.horizontalAccuracyMetres, null);
    if (entry.kind === 'projection') {
      assert.equal(transform.accuracy.datumRelationship, 'same');
      assert.ok(
        residual <= entry.tolerance,
        `${entry.id}: ${residual} ${entry.units} exceeds ${entry.tolerance}`
      );
    } else {
      assert.equal(entry.units, 'metres');
      assert.ok(
        Math.hypot(
          actual[0] - entry.browserAtCapture[0],
          actual[1] - entry.browserAtCapture[1]
        ) <= entry.tolerance,
        `${entry.id}: characterised browser coordinate changed`
      );
      assert.equal(transform.accuracy.datumRelationship, 'different');
      assert.ok(
        transform.accuracy.warnings.some(
          (warning) => warning.code === 'DATUM_DIFFERENCE'
        )
      );
      // Characterise the missing datum correction, never loosen the projection tolerance
      // or describe a captured residual as an acceptable survey-accuracy threshold.
      assert.ok(
        Math.abs(residual - entry.residualAtCapture) <= entry.tolerance,
        `${entry.id}: browser/PostGIS residual changed from ${entry.residualAtCapture} to ${residual}`
      );
    }
  });
}

test('default Web Mercator agreement does not imply the explicitly GDA2020-aligned pipeline agrees', () => {
  const automatic = captured.fixtures.find(
    (entry) => entry.id === 'gda94-to-web-mercator-auto'
  )!;
  const aligned = captured.fixtures.find(
    (entry) => entry.id === 'gda94-to-web-mercator-2020-aligned'
  )!;
  assert.equal(automatic.method, 'ST_Transform');
  assert.equal(automatic.pipeline, null);
  assert.ok(automatic.residualAtCapture < 0.001);
  assert.equal(aligned.method, 'ST_TransformPipeline');
  assert.ok(aligned.pipeline?.startsWith(gda94To2020Pipeline));
  assert.ok(aligned.residualAtCapture > 1);
  assert.ok(aligned.warningsAtCapture.includes('DATUM_DIFFERENCE'));
  assert.ok(aligned.warningsAtCapture.includes('DATUM_ENSEMBLE'));
});

test('grid operation probes record availability at the test location without claiming grids were applied to automatic transforms', () => {
  assert.equal(captured.oracle.gridProbes.length, 2);
  for (const grid of captured.oracle.gridProbes) {
    assert.equal(typeof grid.usableAtSydney, 'boolean');
    assert.equal(grid.usableAtSydney, grid.errorState === null);
    assert.ok(grid.name.startsWith('au_icsm_GDA94_GDA2020_'));
  }
  assert.ok(
    captured.fixtures
      .filter((entry) => entry.method === 'ST_Transform')
      .every((entry) => entry.pipeline === null)
  );
});

test('human-readable accuracy report matches the captured numerical baseline', async () => {
  const actual = await readFile(
    new URL('./fixtures/accuracy-report.md', import.meta.url),
    'utf8'
  );
  const expected = await format(renderAccuracyReport(captured), {
    parser: 'markdown'
  });
  assert.equal(actual, expected);
});
