import { expect, test } from '@playwright/test';
import type {} from './fixtures/maplibre-crs.ts';
import reference from '../fixtures/postgis-accuracy.json' with { type: 'json' };
import { oracleTile, tileBbox } from './support/tiles.ts';
const sample = reference.fixtures.find(
  (item) =>
    item.source === 'EPSG:7844' &&
    item.target === 'EPSG:7856' &&
    item.input[0] === 151.21
)!;

test('S1: experimental MapLibre MGA tiles, WMS bbox and worker sketch align at maximum zoom', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const bboxes: number[][] = [];
  await page.route('**/spike-tiles/**', async (route) => {
    const match = new URL(route.request().url()).pathname.match(
      /\/(\d+)\/(\d+)\/(\d+)\.png$/
    )!;
    await route.fulfill({
      contentType: 'image/png',
      body: oracleTile(
        tileBbox(...(match.slice(1).map(Number) as [number, number, number])),
        sample.expected,
        [255, 0, 0],
        12
      )
    });
  });
  await page.route('**/spike-wms?**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('crs')).toBe('EPSG:7856');
    const bbox = params.get('bbox')!.split(',').map(Number);
    bboxes.push(bbox);
    await route.fulfill({
      contentType: 'image/png',
      body: oracleTile(bbox, sample.expected, [0, 0, 255], 9)
    });
  });
  await page.goto('/maplibre-crs.html');
  await expect
    .poll(() => page.evaluate(() => !!window.maplibreCrsSpike), {
      timeout: 20000
    })
    .toBe(true);
  const positions = [];
  for (const layer of ['tiles', 'wms', 'sketch']) {
    const result = await page.evaluate(
      (layer) => window.maplibreCrsSpike!.measure(layer),
      layer
    );
    expect(result.count).toBeGreaterThan(layer === 'sketch' ? 100 : 0);
    expect(Math.hypot(result.x - 384, result.y - 256)).toBeLessThan(1);
    positions.push(result);
  }
  expect(bboxes.length).toBeGreaterThan(0);
  expect(
    bboxes.every(
      (bbox) =>
        bbox.every(Number.isFinite) && bbox[0] >= 0 && bbox[3] <= 10_000_000
    )
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ positions, exampleBbox: bboxes[0] }));
  await page.evaluate(() => window.maplibreCrsSpike!.destroy());
});
