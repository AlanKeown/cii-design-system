import { expect, test } from '@playwright/test';
import type {} from './fixtures/sqlite-benchmark.ts';
import { writeFile } from 'node:fs/promises';

test('S4: compare worker SQLite readers and streaming OPFS across file sizes', async ({
  page,
  browserName
}) => {
  test.skip(
    process.env.CII_SQLITE_BENCHMARK !== '1',
    'Run npm run spike:sqlite -w @cii/maps to generate the large fixtures.'
  );
  test.setTimeout(180_000);
  await page.goto('/sqlite-benchmark.html');
  await expect.poll(() => page.evaluate(() => !!window.sqliteSpike)).toBe(true);
  const results = [];
  for (const mib of [1, 16, 64, 128])
    for (const mode of ['sqljs', 'sqlite-memory', 'sqlite-opfs'] as const) {
      const result = await page.evaluate(
        ({ mode, mib }) => window.sqliteSpike!(mode, mib),
        { mode, mib }
      );
      expect(result.count).toBe(1000);
      expect(result.srid).toBe(4326);
      expect(result.bytes).toBeGreaterThan(mib * 1024 * 1024 * 0.8);
      if (mode === 'sqlite-opfs' && mib >= 16)
        expect(result.inputBufferBytes).toBeLessThan(result.bytes);
      results.push({ mib, ...result });
      console.log(JSON.stringify(results.at(-1)));
    }
  await writeFile(
    new URL('../fixtures/sqlite-benchmark.json', import.meta.url),
    JSON.stringify(
      {
        browserName,
        measuredAt: new Date().toISOString(),
        limitations:
          'Synthetic GeoPackage metadata reads with a padding table. Heap snapshots exclude transient allocations, browser overhead and OS caches; this is not a peak-memory or mobile-device certification.',
        results
      },
      null,
      2
    ) + '\n'
  );
});
