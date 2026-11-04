import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { format } from 'prettier';
import { definitions } from '../src/crs/definitions.ts';
import type { Coord } from '../src/crs/types.ts';

const run = promisify(execFile);
let version: string;
try {
  await run('cs2cs', ['-?']);
  throw new Error('Expected cs2cs version diagnostic.');
} catch (error) {
  if (
    !error ||
    typeof error !== 'object' ||
    !('stderr' in error) ||
    typeof error.stderr !== 'string' ||
    !error.stderr.startsWith('Rel.')
  )
    throw error;
  version = error.stderr.split('\n')[0];
}
const cases: { source: string; target: string; input: Coord }[] = [
  { source: 'OGC:CRS84', target: 'EPSG:3857', input: [151.21, -33.87] },
  { source: 'EPSG:7844', target: 'EPSG:8058', input: [151.21, -33.87] },
  { source: 'EPSG:7844', target: 'EPSG:7856', input: [151.21, -33.87] },
  ...Array.from({ length: 6 }, (_, index) => ({
    source: 'EPSG:7844',
    target: `EPSG:${7854 + index}`,
    input: [141 + 6 * index, -32] as Coord
  })),
  ...Array.from({ length: 6 }, (_, index) => ({
    source: 'EPSG:4283',
    target: index === 5 ? 'EPSG:6738' : `EPSG:${28354 + index}`,
    input: [141 + 6 * index, -32] as Coord
  }))
];
const directory = await mkdtemp(join(tmpdir(), 'cii-transform-fixtures-'));
try {
  const inputPath = join(directory, 'coordinate.txt');
  const fixtures = [];
  for (const entry of cases) {
    const source = definitions.find(
      (definition) => definition.code === entry.source
    );
    const target = definitions.find(
      (definition) => definition.code === entry.target
    );
    if (!source || !target) throw new Error('Fixture CRS not registered.');
    await writeFile(inputPath, `${entry.input[0]} ${entry.input[1]}\n`);
    // Explicit PROJ strings keep the CLI in x/y order, avoiding native EPSG axis order.
    const { stdout } = await run('cs2cs', [
      '-f',
      '%.12f',
      ...source.proj4.split(/\s+/),
      '+to',
      ...target.proj4.split(/\s+/),
      inputPath
    ]);
    const ordinates = stdout.trim().split(/\s+/).slice(0, 2).map(Number);
    if (ordinates.length !== 2 || !ordinates.every(Number.isFinite))
      throw new Error('PROJ did not produce finite fixture coordinates.');
    fixtures.push({ ...entry, expected: ordinates, tolerance: 0.001 });
  }
  const output = new URL('../tests/fixtures/transforms.json', import.meta.url);
  await mkdir(new URL('./', output), { recursive: true });
  await writeFile(
    output,
    await format(
      JSON.stringify({
        oracle: `PROJ cs2cs: ${version}`,
        scope:
          'Projection-only same-datum fixtures, x/y order; not PostGIS pipeline or datum-accuracy certification.',
        fixtures
      }),
      { parser: 'json' }
    )
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
