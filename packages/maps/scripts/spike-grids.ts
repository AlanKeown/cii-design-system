import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type * as GeoTiff from 'geotiff' with { 'resolution-mode': 'require' };
import proj4 from 'proj4';
import { withPostgis, sqlLiteral } from './support/postgis.ts';

const { fromArrayBuffer }: typeof GeoTiff = createRequire(import.meta.url)(
  'geotiff'
);

// Pinned from https://cdn.proj.org/files.geojson. Grid data stays in the temporary cache.
const grids = [
  {
    name: 'au_icsm_GDA94_GDA2020_conformal.tif',
    bytes: 4561222,
    sha256: '92b39b4898aff9e9921dce83daed4f942da0c1e714905612fa7ffdc0081dcc9c'
  },
  {
    name: 'au_icsm_GDA94_GDA2020_conformal_and_distortion.tif',
    bytes: 27272664,
    sha256: '89bb9e5c55a714c8925ddc134bf4c191be8df2607b229a05efb778f5f6166ee0'
  }
];
const samples = [
  { name: 'Sydney', coordinate: [151.21, -33.87] },
  { name: 'Melbourne', coordinate: [144.96, -37.81] },
  { name: 'Canberra', coordinate: [149.13, -35.28] },
  { name: 'Darwin', coordinate: [130.84, -12.46] }
];
const cache = join(tmpdir(), 'cii-maps-grid-spike');
await mkdir(cache, { recursive: true });
const converters = new Map<string, proj4.Converter>();
for (const grid of grids) {
  const path = join(cache, grid.name);
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    const response = await fetch(`https://cdn.proj.org/${grid.name}`, {
      signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) throw new Error('Grid download failed.');
    bytes = Buffer.from(await response.arrayBuffer());
    if (
      bytes.byteLength !== grid.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== grid.sha256
    )
      throw new Error('Grid checksum mismatch.');
    await writeFile(path, bytes);
  }
  assert.equal(bytes.byteLength, grid.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), grid.sha256);
  const key = `cii-spike-${grid.sha256}`;
  await proj4.nadgrid(key, await fromArrayBuffer(Uint8Array.from(bytes).buffer))
    .ready;
  // proj4's nadgrids contract uses a WGS84 intermediate. Explicit zero Helmert parameters
  // enable that operation; the final ellipsoid is GRS80 for GDA2020. Compare against PROJ below.
  converters.set(
    grid.name,
    proj4(
      `+proj=longlat +ellps=GRS80 +towgs84=0,0,0 +nadgrids=${key} +no_defs`,
      '+proj=longlat +ellps=GRS80 +towgs84=0,0,0 +no_defs'
    )
  );
}
await withPostgis(
  async (query) => {
    const results = [];
    for (const grid of grids)
      for (const sample of samples) {
        const pipeline = `+proj=pipeline +step +proj=unitconvert +xy_in=deg +xy_out=rad +step +proj=hgridshift +grids=${grid.name} +step +proj=unitconvert +xy_in=rad +xy_out=deg`;
        const expected = JSON.parse(
          await query(
            `WITH transformed AS (SELECT ST_TransformPipeline(ST_SetSRID(ST_MakePoint(${sample.coordinate[0]},${sample.coordinate[1]}),4283),${sqlLiteral(pipeline)},7844) AS geom) SELECT jsonb_build_array(ST_X(geom),ST_Y(geom)) FROM transformed;`
          )
        ) as number[];
        const actual = converters.get(grid.name)!.forward(sample.coordinate);
        const residualDegrees = Math.hypot(
          actual[0] - expected[0],
          actual[1] - expected[1]
        );
        assert.ok(
          residualDegrees < 1e-9,
          `${grid.name} ${sample.name}: ${residualDegrees}`
        );
        results.push({
          grid: grid.name,
          sample: sample.name,
          input: sample.coordinate,
          expected,
          actual,
          residualDegrees,
          pipeline
        });
      }
    const report = {
      measuredAt: new Date().toISOString(),
      proj4: proj4.version,
      geotiff: '3.1.0-beta.0',
      postgis: await query('SELECT PostGIS_Full_Version();'),
      grids,
      results,
      limits:
        'Four sampled geographic points per grid. The isolated CLI process owns proj4 global grid registrations; this does not enable grids in the production transform service or audit target-server grid installations. No epoch/vertical or survey-accuracy certification.'
    };
    await writeFile(
      new URL('../tests/fixtures/grid-comparison.json', import.meta.url),
      JSON.stringify(report, null, 2) + '\n'
    );
    console.log(JSON.stringify(report));
  },
  {
    grids: grids.map((grid) => ({
      name: grid.name,
      path: join(cache, grid.name)
    }))
  }
);
