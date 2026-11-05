import { expect, test } from '@playwright/test';
import type {} from './fixtures/openlayers-crs.ts';
import reference from '../fixtures/postgis-accuracy.json' with { type: 'json' };
import { oracleVectorTile, tileBbox } from './support/tiles.ts';
const sample = reference.fixtures.find(
  (item) =>
    item.source === 'EPSG:7844' &&
    item.target === 'EPSG:7856' &&
    item.input[0] === 151.21
)!;

for (const display of ['EPSG:7856', 'EPSG:7855'])
  test(`S3: OpenLayers MGA vector tile grid renders in ${display}`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let requests = 0;
    await page.route('**/spike-mvt/**', async (route) => {
      const match = new URL(route.request().url()).pathname.match(
        /\/(\d+)\/(\d+)\/(\d+)\.pbf$/
      )!;
      requests++;
      await route.fulfill({
        contentType: 'application/vnd.mapbox-vector-tile',
        body: oracleVectorTile(
          tileBbox(...(match.slice(1).map(Number) as [number, number, number])),
          sample.expected
        )
      });
    });
    await page.goto(
      `/openlayers-crs.html?display=${encodeURIComponent(display)}`
    );
    await expect
      .poll(() => page.evaluate(() => !!window.openlayersCrsSpike), {
        timeout: 20000
      })
      .toBe(true);
    expect(
      await page.evaluate(() => window.openlayersCrsSpike!.rendered())
    ).toBe(true);
    expect(requests).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        display,
        requests,
        hits: await page.evaluate(() => window.openlayersCrsSpike!.hits()),
        center: await page.evaluate(() => window.openlayersCrsSpike!.center())
      })
    );
    await page.evaluate(() => window.openlayersCrsSpike!.destroy());
    await expect(page.locator('.ol-viewport')).toHaveCount(0);
  });
