import { expect, test } from '@playwright/test';
import type {} from './fixtures/capture.ts';
test.use({ hasTouch: true });

for (const input of ['mouse', 'touch'] as const)
  test(`S5: ${input} polygon produces identical retained-vertex changes across engine surfaces`, async ({
    page
  }) => {
    const results = [];
    for (const engine of ['leaflet', 'maplibre', 'openlayers']) {
      await page.goto(`/capture.html?engine=${engine}`);
      await expect
        .poll(() => page.evaluate(() => !!window.captureSpike), {
          timeout: 15000
        })
        .toBe(true);
      const before = await page.evaluate(() => window.captureSpike!.zoom());
      const box = (await page.locator('#map').boundingBox())!;
      const pixels = [
        [344, 216],
        [424, 216],
        [384, 296]
      ];
      for (const [index, [x, y]] of pixels.entries()) {
        if (input === 'touch') await page.touchscreen.tap(box.x + x, box.y + y);
        else if (index === 2) await page.mouse.dblclick(box.x + x, box.y + y);
        else await page.mouse.click(box.x + x, box.y + y);
      }
      if (input === 'touch') {
        await page.locator('#map').focus();
        await page.keyboard.press('Enter');
      }
      const changes = await page.evaluate(() => window.captureSpike!.changes());
      expect(changes).toHaveLength(1);
      expect(changes[0].inserts[0].geometry).toEqual({
        type: 'Polygon',
        coordinates: [
          [
            [-40, 40],
            [40, 40],
            [0, -40],
            [-40, 40]
          ]
        ]
      });
      expect(await page.evaluate(() => window.captureSpike!.zoom())).toBe(
        before
      );
      const events = await page.evaluate(() => window.captureSpike!.events());
      expect(
        events.some((event) =>
          event.includes(input === 'touch' ? ':touch' : ':mouse')
        )
      ).toBe(true);
      results.push(changes);
      await page.evaluate(() => window.captureSpike!.destroy());
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
  });
