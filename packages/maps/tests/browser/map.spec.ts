import { expect, test } from '@playwright/test';
import type {} from './fixtures/main.ts';

test('controlled view applies after async mount, binds user movement, and reports invalid updates once', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?controlled-view');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.mapHarness!.view())).center[0]
    )
    .toBeCloseTo(0, 7);
  await page
    .getByRole('button', { name: 'Set controlled view', exact: true })
    .click();
  // Leaflet rounds same-zoom pans to a CSS pixel; compare in screen units.
  await expect
    .poll(async () => {
      const view = await page.evaluate(() => window.mapHarness!.view());
      return Math.abs(view.center[0] - 10000) / view.resolution;
    })
    .toBeLessThanOrEqual(0.5);
  await page.getByRole('application').focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () =>
      Number(await page.getByLabel('Bound center').textContent())
    )
    .toBeGreaterThan(10000);
  await page
    .getByRole('button', { name: 'Invalid controlled view', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('VIEW_INVALID');
  await page.waitForTimeout(100);
  await expect(page.getByLabel('Error count')).toHaveText('1');
  expect(errors).toEqual([]);
});

for (const crs of ['EPSG:4326', 'OGC:CRS84']) {
  test(`native ${crs} uses degree resolution with longitude/latitude core coordinates`, async ({
    page
  }) => {
    await page.goto(`/?display=${encodeURIComponent(crs)}`);
    await expect(page.getByLabel('Ready count')).toHaveText('1');
    const view = await page.evaluate(() => window.mapHarness!.view());
    expect(view.center[0]).toBeCloseTo(151.21, 8);
    expect(view.center[1]).toBeCloseTo(-33.87, 8);
    expect(view.resolution).toBeCloseTo(0.0001, 10);
    expect(view.zoom).toBeUndefined();
    expect(await page.evaluate(() => window.mapHarness!.hit())).toEqual([
      'site'
    ]);
  });
}

test('real Leaflet renders, patches data/style/visibility and responds to keyboard and theme', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('region', { name: 'Fixture', exact: true })
  ).toHaveAttribute('data-map-ready', 'true');
  const canvas = page.getByRole('application', { name: 'Fixture map canvas' });
  await expect(canvas.locator('canvas')).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1, radius: 6 });
  expect(await page.evaluate(() => window.mapHarness!.hit())).toEqual(['site']);
  const nativeCanvas = await canvas.locator('canvas').elementHandle();
  await page.getByRole('button', { name: 'Toggle size' }).click();
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ radius: 12 });
  expect(await nativeCanvas!.evaluate((node) => node.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Toggle visibility' }).click();
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 0 });
  expect(await page.evaluate(() => window.mapHarness!.hit())).toEqual([]);
  await page.getByRole('button', { name: 'Toggle visibility' }).click();
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1 });
  const color = (await page.evaluate(() => window.mapHarness!.stats())).color;
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect
    .poll(
      async () => (await page.evaluate(() => window.mapHarness!.stats())).color
    )
    .not.toBe(color);
  const before = await page.evaluate(() => window.mapHarness!.view());
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.mapHarness!.view())).center[0]
    )
    .toBeGreaterThan(before.center[0]);
  await page.keyboard.press('+');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.mapHarness!.view())).resolution
    )
    .toBeLessThan(before.resolution);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Zoom in', exact: true })
  ).toBeFocused();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('real adapter passes contract checks and repeatedly unmounts without leaked canvases', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  expect(await page.evaluate(() => window.mapHarness!.contract())).toEqual([]);
  for (let i = 1; i <= 3; i++) {
    await page.getByRole('button', { name: 'Toggle mount' }).click();
    await expect(page.getByLabel('Destroyed count')).toHaveText(String(i));
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await page.getByRole('button', { name: 'Toggle mount' }).click();
    await expect(page.getByLabel('Ready count')).toHaveText(String(i + 1));
    await expect(page.locator('.leaflet-container')).toHaveCount(1);
  }
});

test('unmounting during the lazy engine load cannot call ready or leave a map', async ({
  page
}) => {
  await page.goto('/?delayed-engine=600');
  await page.getByRole('button', { name: 'Toggle mount' }).click();
  await page.waitForTimeout(800);
  await expect(page.getByLabel('Ready count')).toHaveText('0');
  await expect(page.getByLabel('Error count')).toHaveText('0');
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('GeoJSON requests reject malformed data and recover; stale requests do not replace the current data', async ({
  page
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/sites.geojson', async (route) => {
    requests++;
    if (requests === 1) {
      await gate;
      await route
        .fulfill({ json: { type: 'FeatureCollection', features: [] } })
        .catch(() => {});
    } else if (requests === 2) await route.fulfill({ json: { bad: 'data' } });
    else
      await route.fulfill({
        json: {
          type: 'Feature',
          id: 'remote-site',
          properties: {},
          geometry: { type: 'Point', coordinates: [151.21, -33.87] }
        }
      });
  });
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await page.getByRole('button', { name: 'Toggle remote' }).click();
  await expect.poll(() => requests).toBe(1);
  await page.getByRole('button', { name: 'Toggle remote' }).click();
  release();
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1 });
  await page.getByRole('button', { name: 'Toggle remote' }).click();
  await expect(page.getByRole('alert')).toContainText('SOURCE_INVALID');
  await expect(page.getByLabel('Error count')).toHaveText('1');
  await page.getByRole('button', { name: 'Toggle remote' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1 });
  await page.getByRole('button', { name: 'Toggle remote' }).click();
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.hit()))
    .toEqual(['remote-site']);
  await expect(page.getByLabel('Ready count')).toHaveText('1');
});

test('untrusted properties and attribution remain text; narrow reduced-motion maps resize correctly', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 840 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await page.getByRole('button', { name: 'Hostile property' }).click();
  await expect(page.getByLabel('Feature name')).toHaveText(
    '<img src=x onerror=alert(1)>'
  );
  await expect(page.getByLabel('Map attribution')).toContainText(
    '<img src=x onerror=alert(1)>'
  );
  await expect(page.locator('img')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page.setViewportSize({ width: 700, height: 840 });
  await expect
    .poll(async () =>
      page.getByRole('application').evaluate((node) => node.clientWidth)
    )
    .toBeGreaterThan(600);
  await expect(page.getByLabel('Ready count')).toHaveText('1');
});
