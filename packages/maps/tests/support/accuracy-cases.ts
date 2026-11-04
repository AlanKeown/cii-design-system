import projections from '../fixtures/transforms.json' with { type: 'json' };
import type { Coord, TransformWarningCode } from '../../src/index.ts';

export const accuracyOracleImage =
  'postgis/postgis@sha256:404171ea9058c801f405af25d63b3b8e5c9e50f2759e49390dbcc3c7ee533f4d';

// From `projinfo -k operation EPSG:8048 -o PROJ -q`. The two external
// axisswap steps are removed because PostGIS points and core use longitude/x first.
export const gda94To2020Pipeline =
  '+proj=pipeline +step +proj=unitconvert +xy_in=deg +xy_out=rad +step +proj=push +v_3 +step +proj=cart +ellps=GRS80 +step +proj=helmert +x=0.06155 +y=-0.01087 +z=-0.04019 +rx=-0.0394924 +ry=-0.0327221 +rz=-0.0328979 +s=-0.009994 +convention=coordinate_frame +step +inv +proj=cart +ellps=GRS80 +step +proj=pop +v_3 +step +proj=unitconvert +xy_in=rad +xy_out=deg';

export interface AccuracyCase {
  id: string;
  kind: 'projection' | 'datum-comparison';
  source: string;
  target: string;
  sourceSrid: number;
  targetSrid: number;
  input: Coord;
  method: 'ST_Transform' | 'ST_TransformPipeline';
  pipeline: string | null;
  operation: string;
  units: 'metres' | 'degrees';
  tolerance: number;
}

function srid(code: string): number {
  // Geometry x/y is explicit; CRS84 uses the EPSG:4326 database definition.
  if (code === 'OGC:CRS84') return 4326;
  if (!/^EPSG:[1-9]\d*$/.test(code))
    throw new Error(`Invalid fixture CRS: ${code}`);
  return Number(code.slice(5));
}

function sample(
  id: string,
  source: string,
  target: string,
  input: Coord,
  kind: AccuracyCase['kind'] = 'projection',
  pipeline: string | null = null,
  operation = 'Automatic operation selected by the oracle PROJ installation.'
): AccuracyCase {
  const degrees = ['EPSG:4326', 'OGC:CRS84', 'EPSG:7844', 'EPSG:4283'].includes(
    target
  );
  return {
    id,
    kind,
    source,
    target,
    sourceSrid: srid(source),
    targetSrid: srid(target),
    input,
    method: pipeline ? 'ST_TransformPipeline' : 'ST_Transform',
    pipeline,
    operation,
    units: degrees ? 'degrees' : 'metres',
    tolerance: degrees ? 1e-8 : 0.001
  };
}

const toMga56 = `${gda94To2020Pipeline} +step +proj=unitconvert +xy_in=deg +xy_out=rad +step +proj=utm +zone=56 +south +ellps=GRS80`;
const toMercator = `${gda94To2020Pipeline} +step +proj=unitconvert +xy_in=deg +xy_out=rad +step +proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0`;

export const accuracyCases: readonly AccuracyCase[] = [
  ...projections.fixtures.map((entry, i) =>
    sample(`projection-${i + 1}`, entry.source, entry.target, [
      entry.input[0],
      entry.input[1]
    ])
  ),
  ...Array.from({ length: 6 }, (_, i) =>
    sample(
      `gda2020-zone-${54 + i}-off-meridian`,
      'EPSG:7844',
      `EPSG:${7854 + i}`,
      [143 + i * 6, -30]
    )
  ),
  ...Array.from({ length: 6 }, (_, i) =>
    sample(
      `gda94-zone-${54 + i}-off-meridian`,
      'EPSG:4283',
      i === 5 ? 'EPSG:6738' : `EPSG:${28354 + i}`,
      [143 + i * 6, -30]
    )
  ),
  sample('lambert-western-nsw', 'EPSG:7844', 'EPSG:8058', [141.5, -31.5]),
  sample('lambert-northern-nsw', 'EPSG:7844', 'EPSG:8058', [152, -29]),
  sample(
    'inverse-mga56',
    'EPSG:7856',
    'EPSG:7844',
    [334435.70614098536, 6250816.397908207]
  ),
  sample(
    'inverse-gda94-mga56',
    'EPSG:28356',
    'EPSG:4283',
    [334435.70614098536, 6250816.397908207]
  ),
  sample(
    'inverse-lambert',
    'EPSG:8058',
    'EPSG:7844',
    [9689078.906195613, 4423455.77781939]
  ),
  sample(
    'gda94-to-2020-sydney-auto',
    'EPSG:4283',
    'EPSG:7856',
    [151.21, -33.87],
    'datum-comparison'
  ),
  sample(
    'gda94-to-2020-melbourne-auto',
    'EPSG:4283',
    'EPSG:7855',
    [144.96, -37.81],
    'datum-comparison'
  ),
  sample(
    'gda94-mga56-to-2020-mga56-auto',
    'EPSG:28356',
    'EPSG:7856',
    [334435.70614098536, 6250816.397908207],
    'datum-comparison'
  ),
  sample(
    'gda94-to-2020-lambert-auto',
    'EPSG:4283',
    'EPSG:8058',
    [151.21, -33.87],
    'datum-comparison'
  ),
  sample(
    'gda2020-to-94-sydney-auto',
    'EPSG:7844',
    'EPSG:28356',
    [151.21, -33.87],
    'datum-comparison'
  ),
  sample(
    'gda94-to-web-mercator-auto',
    'EPSG:4283',
    'EPSG:3857',
    [151.21, -33.87],
    'datum-comparison'
  ),
  sample(
    'gda94-to-2020-sydney-explicit-8048',
    'EPSG:4283',
    'EPSG:7856',
    [151.21, -33.87],
    'datum-comparison',
    toMga56,
    'EPSG:8048, normalised to x/y, followed by GDA2020 MGA zone 56 projection.'
  ),
  sample(
    'gda94-to-web-mercator-2020-aligned',
    'EPSG:4283',
    'EPSG:3857',
    [151.21, -33.87],
    'datum-comparison',
    toMercator,
    'EPSG:8048, normalised to x/y, followed by spherical Web Mercator. GDA2020-aligned ensemble approximation; no WGS84 realisation/epoch model.'
  )
];

export interface CapturedAccuracyCase extends AccuracyCase {
  expected: Coord;
  browserAtCapture: Coord;
  /** Euclidean residual in target coordinate units; Mercator metres are not ground metres. */
  residualAtCapture: number;
  warningsAtCapture: readonly TransformWarningCode[];
}

export interface AccuracyFixtureSet {
  schemaVersion: 1;
  browser: { library: 'proj4'; version: string };
  oracle: {
    image: string;
    postgisFullVersion: string;
    postgresVersion: string;
    networkEnabled: false;
    axisConvention: 'xy';
    gridProbes: {
      name: string;
      usableAtSydney: boolean;
      errorState: string | null;
    }[];
  };
  fixtures: CapturedAccuracyCase[];
}
