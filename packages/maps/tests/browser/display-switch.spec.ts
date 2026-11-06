import { expect, test, type Page } from '@playwright/test';
import { wmsCapabilities } from '../support/ogc.ts';
import type {} from './fixtures/main.ts';

async function display(page: Page, code: string) {
  await page.evaluate((code) => {
    const config = window.mapHarness!.config();
    config.display = { crs: code };
    window.mapHarness!.setConfig(config);
  }, code);
}

test('Leaflet rebuilds atomically, preserves layer settings and binds the transformed view', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?readouts&switching');
  const map = page.getByRole('region', { name: 'Fixture', exact: true });
  await expect(map).toHaveAttribute('data-display-crs', 'EPSG:3857');
  const canvas = page.getByRole('application');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  const before = await page.evaluate(() => window.mapHarness!.view());
  const oldCanvas = await canvas.locator('canvas').elementHandle();
  const slider = page.getByRole('slider', {
    name: 'Opacity for sites',
    exact: true
  });
  await slider.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.getByRole('checkbox', { name: 'sites', exact: true }).uncheck();
  await canvas.focus();
  await display(page, 'EPSG:4326');
  await expect(map).toHaveAttribute('data-display-crs', 'EPSG:4326');
  await expect(page.getByLabel('Ready count')).toHaveText('2');
  await expect(page.getByRole('application')).toBeFocused();
  expect(await oldCanvas!.evaluate((node) => node.isConnected)).toBe(false);
  await expect(slider).toHaveValue('0.05');
  await expect(
    page.getByRole('checkbox', { name: 'sites', exact: true })
  ).not.toBeChecked();
  const current = await page.evaluate(() => window.mapHarness!.view());
  expect(current.center[0]).toBeCloseTo(
    ((before.center[0] / 6378137) * 180) / Math.PI,
    6
  );
  expect(
    Number(await page.getByLabel('Bound center').textContent())
  ).toBeCloseTo(current.center[0], 8);
  await expect(
    page.getByRole('region', { name: 'Coordinate readout', exact: true })
  ).toContainText('EPSG:4326');
  await page.getByRole('checkbox', { name: 'sites', exact: true }).check();
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1 });
  await display(page, 'OGC:CRS84');
  await expect(map).toHaveAttribute('data-display-crs', 'OGC:CRS84');
  await display(page, 'EPSG:3857');
  await expect(map).toHaveAttribute('data-display-crs', 'EPSG:3857');
  await expect(page.locator('.leaflet-container')).toHaveCount(1);
  await expect(page.getByLabel('Destroyed count')).toHaveText('3');
  expect(errors).toEqual([]);
});

test('hidden XYZ layers refuse the switch and name the blocker without destroying the old map', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await page.evaluate(() => {
    const config = window.mapHarness!.config();
    config.layers.unshift({
      id: 'fixed-basemap',
      visible: false,
      attribution: 'Fixture',
      source: {
        provider: 'xyz',
        url: '/tiles/{z}/{x}/{y}.png',
        crs: { code: 'EPSG:3857', provenance: { kind: 'declared', by: 'test' } }
      }
    });
    window.mapHarness!.setConfig(config);
  });
  await page.getByText('Layer information', { exact: true }).click();
  await expect(
    page.getByText('fixed-basemap: raster tiles', { exact: false })
  ).toBeVisible();
  const before = await page.getByRole('application').elementHandle();
  await display(page, 'EPSG:4326');
  await expect(page.getByRole('alert')).toContainText('fixed-basemap');
  await expect(
    page.getByRole('region', { name: 'Fixture', exact: true })
  ).toHaveAttribute('data-display-crs', 'EPSG:3857');
  expect(await before!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await expect(page.getByLabel('Destroyed count')).toHaveText('0');
});

test('failed replacement mounts keep old interactions and rendering usable', async ({
  page
}) => {
  await page.goto('/?switch-fail');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  const old = await page.getByRole('application').elementHandle();
  await display(page, 'EPSG:4326');
  await expect(page.getByRole('alert')).toContainText(
    'previous map is still active'
  );
  expect(await old!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.leaflet-container')).toHaveCount(1);
  await page.getByRole('application').focus();
  await page.keyboard.press('ArrowRight');
  expect((await page.evaluate(() => window.mapHarness!.stats())).count).toBe(1);
  await expect(page.getByLabel('Ready count')).toHaveText('1');
});

test('rapid requests and unmount during a delayed replacement cannot resurrect stale maps', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?switch-delay=250');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  const map = page.getByRole('region', { name: 'Fixture', exact: true });
  await display(page, 'EPSG:4326');
  await expect(map).toHaveAttribute('data-map-switching', 'true');
  await display(page, 'OGC:CRS84');
  await expect(map).toHaveAttribute('data-display-crs', 'OGC:CRS84');
  await expect(page.getByLabel('Ready count')).toHaveText('2');
  await display(page, 'EPSG:4326');
  await expect(map).toHaveAttribute('data-map-switching', 'true');
  await page.getByRole('button', { name: 'Toggle mount', exact: true }).click();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await page.waitForTimeout(350);
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await expect(page.getByLabel('Ready count')).toHaveText('2');
  expect(errors).toEqual([]);
});

test('WMS switches request CRS and BBOX axis order without fetching capabilities again', async ({
  page
}) => {
  let metadata = 0;
  const maps: URL[] = [];
  await page.route('**/switch-wms*', (route) => {
    metadata++;
    return route.fulfill({
      contentType: 'text/xml',
      body: wmsCapabilities('1.3.0', '/switch-tile')
    });
  });
  await page.route('**/switch-tile*', (route) => {
    maps.push(new URL(route.request().url()));
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="white"/></svg>'
    });
  });
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await page.evaluate(() => {
    const config = window.mapHarness!.config();
    config.layers.unshift({
      id: 'service',
      attribution: 'Synthetic service',
      source: {
        provider: 'wms',
        url: '/switch-wms',
        layers: 'demo',
        crs: { fromMetadata: true, policy: 'prefer-display' }
      }
    });
    window.mapHarness!.setConfig(config);
  });
  await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  await display(page, 'EPSG:4326');
  await expect(
    page.getByRole('region', { name: 'Fixture', exact: true })
  ).toHaveAttribute('data-display-crs', 'EPSG:4326');
  await expect
    .poll(() => maps.some((url) => url.searchParams.get('CRS') === 'EPSG:4326'))
    .toBe(true);
  const request = maps.find(
    (url) => url.searchParams.get('CRS') === 'EPSG:4326'
  )!;
  expect(Number(request.searchParams.get('BBOX')!.split(',')[0])).toBeLessThan(
    -30
  );
  expect(metadata).toBe(1);
});
