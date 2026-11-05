import { createCrsRegistry, createTransformService } from '../../src/index.ts';
import type { Coord } from '../../src/index.ts';
import {
  inspectPostgisTarget,
  postgisFunction,
  probeAustralianGrid,
  AUSTRALIAN_TRANSFORM_GRIDS,
  auditSqlState
} from '../../../maps-server/src/target-audit.ts';
import type { AuditQuery } from '../../../maps-server/src/target-audit.ts';
import { accuracyCases } from '../../tests/support/accuracy-cases.ts';
import type { AccuracyCase } from '../../tests/support/accuracy-cases.ts';
import { sqlLiteral } from './postgis.ts';
import proj4 from 'proj4';

type Comparison = AccuracyCase &
  (
    | {
        status: 'measured';
        expected: Coord;
        browser: Coord;
        residualTargetUnits: number;
        withinProjectionTolerance: boolean | null;
      }
    | { status: 'unsupported' | 'failed'; reason: string; sqlState?: string }
  );

/** Portable audit algorithm: each adapter returns one JSON value from an authored SELECT. */
export async function runTargetAudit(query: AuditQuery, target: string) {
  const inspection = await inspectPostgisTarget(
    query,
    accuracyCases.flatMap((sample) => [sample.sourceSrid, sample.targetSrid])
  );
  const transforms = createTransformService(createCrsRegistry());
  const results: Comparison[] = [];
  const fn = (name: Parameters<typeof postgisFunction>[1]) =>
    postgisFunction(inspection, name);
  for (const sample of accuracyCases) {
    if (!inspection.hasTransform) {
      results.push({
        ...sample,
        status: 'unsupported',
        reason: 'PostGIS transformation support is unavailable.'
      });
      continue;
    }
    if (
      [sample.sourceSrid, sample.targetSrid].some(
        (srid) =>
          !inspection.crsAuthorities.some(
            (authority) =>
              authority.srid === srid &&
              authority.authority === 'EPSG' &&
              authority.authorityCode === srid
          )
      )
    ) {
      results.push({
        ...sample,
        status: 'failed',
        reason:
          'CRS authority is missing or does not match the fixture EPSG code.'
      });
      continue;
    }
    if (
      sample.method === 'ST_TransformPipeline' &&
      !inspection.hasTransformPipeline
    ) {
      results.push({
        ...sample,
        status: 'unsupported',
        reason:
          'ST_TransformPipeline is unavailable; no alternative operation was substituted.'
      });
      continue;
    }
    const point = `${fn('st_setsrid')}(${fn('st_makepoint')}(${sample.input[0]},${sample.input[1]}),${sample.sourceSrid})`;
    const operation =
      sample.method === 'ST_TransformPipeline'
        ? `${fn('st_transformpipeline')}(${point},${sqlLiteral(sample.pipeline!)},${sample.targetSrid})`
        : `${fn('st_transform')}(${point},${sample.targetSrid})`;
    let output: unknown;
    try {
      output = await query(
        `WITH result AS (SELECT ${operation} AS geom) SELECT jsonb_build_object('id',${sqlLiteral(sample.id)},'expected',jsonb_build_array(${fn('st_x')}(geom),${fn('st_y')}(geom))) AS audit FROM result;`
      );
    } catch (error) {
      const sqlState = auditSqlState(error);
      if (!sqlState) throw error;
      results.push({
        ...sample,
        status: 'failed',
        reason: 'Server transform failed.',
        sqlState
      });
      continue;
    }
    if (
      !output ||
      typeof output !== 'object' ||
      !('id' in output) ||
      output.id !== sample.id ||
      !('expected' in output) ||
      !Array.isArray(output.expected) ||
      output.expected.length !== 2 ||
      !output.expected.every(
        (value) => typeof value === 'number' && Number.isFinite(value)
      )
    )
      throw new Error('Invalid server transform response.');
    const expected: Coord = [output.expected[0], output.expected[1]];
    const browser = (
      await transforms.prepare({ source: sample.source, target: sample.target })
    ).coordinate(sample.input);
    const residualTargetUnits = Math.hypot(
      browser[0] - expected[0],
      browser[1] - expected[1]
    );
    results.push({
      ...sample,
      status: 'measured',
      expected,
      browser,
      residualTargetUnits,
      withinProjectionTolerance:
        sample.kind === 'projection'
          ? residualTargetUnits <= sample.tolerance
          : null
    });
  }
  const gridControl = await probeAustralianGrid(
    query,
    inspection,
    AUSTRALIAN_TRANSFORM_GRIDS[0],
    { nullControl: true }
  );
  const gridProbes = [];
  for (const grid of AUSTRALIAN_TRANSFORM_GRIDS)
    gridProbes.push(await probeAustralianGrid(query, inspection, grid));
  const measured = results.filter((result) => result.status === 'measured');
  const failures = results.filter(
    (result) =>
      result.status === 'failed' ||
      (result.status === 'measured' &&
        result.withinProjectionTolerance === false)
  );
  return {
    schemaVersion: 2,
    measuredAt: new Date().toISOString(),
    target,
    status: failures.length
      ? 'failed'
      : !inspection.hasTransform
        ? 'postgis-unavailable'
        : results.some((result) => result.status === 'unsupported') ||
            gridProbes.some((probe) => probe.status !== 'usable')
          ? 'completed-with-limitations'
          : 'completed',
    inspection,
    browser: { library: 'proj4', version: proj4.version },
    comparisons: {
      planned: results.length,
      executed: measured.length,
      unsupported: results.filter((result) => result.status === 'unsupported')
        .length,
      failed: failures.length,
      sameDatumProjectionCasesPassed: measured.filter(
        (result) =>
          result.kind === 'projection' && result.withinProjectionTolerance
      ).length,
      datumComparisons: measured.filter(
        (result) => result.kind === 'datum-comparison'
      ).length
    },
    results,
    gridControl,
    gridProbes,
    limits:
      'Synthetic coordinates and system/extension metadata only. No application rows or DDL/DML. Function availability is inspected, not inferred from version. Unsupported exact pipelines are not replaced. Grid probes establish usability at Sydney only, not file installation or geographic coverage. Automatic operation selection is not introspected. Capabilities do not certify survey/epoch/vertical accuracy or authorise persistence.'
  };
}
