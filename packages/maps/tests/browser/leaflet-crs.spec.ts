import { expect, test } from '@playwright/test';
import type {} from './fixtures/leaflet-crs.ts';

test('S2: first-party MGA grid aligns oracle tiles and features and gives a ground scale', async ({
  page
}) => {
  await page.goto('/leaflet-crs.html');
  await expect
    .poll(() => page.evaluate(() => !!window.leafletCrsSpike))
    .toBe(true);
  for (const zoom of [12, 15.5, 18]) {
    const result = await page.evaluate(
      (zoom) => window.leafletCrsSpike!.measure(zoom),
      zoom
    );
    expect(result.tileResidualPx).toBeLessThan(1);
    expect(result.featureResidualPx).toBeLessThan(1);
    expect(result.roundTripMetres).toBeLessThan(0.001);
    expect(result.tileCount).toBeGreaterThan(0);
    // Spherical ground scale differs slightly from the ellipsoidal MGA grid;
    // this is a display scale, with a 0.5% feasibility tolerance at Sydney.
    expect(Math.abs(result.groundToGridRatio - 1)).toBeLessThan(0.005);
    expect(result.scaleWidthPx).toBeGreaterThan(0);
    expect(result.scaleWidthPx).toBeLessThanOrEqual(100);
    await expect(page.locator('#scale')).toHaveText(`${result.scaleMetres} m`);
    console.log(JSON.stringify(result));
  }
  await page.evaluate(() => window.leafletCrsSpike!.destroy());
  await expect(page.locator('.leaflet-pane')).toHaveCount(0);
});
