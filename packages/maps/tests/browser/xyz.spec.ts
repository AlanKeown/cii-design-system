import { expect, test, type Page } from '@playwright/test';
import type {} from './fixtures/main.ts';

const tile =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#bcd"/></svg>';

async function addBasemap(page: Page) {
  await page.evaluate(() => {
    const config = window.mapHarness!.config();
    config.controls = [{ id: 'zoom' }, { id: 'layer-list' }];
    config.layers.unshift({
      id: 'basemap',
      attribution: 'XYZ fixture <img src=x onerror=alert(1)>',
      order: -1,
      source: {
        provider: 'xyz',
        url: '/tiles/{z}/{x}/{y}.svg',
        crs: {
          code: 'EPSG:3857',
          provenance: { kind: 'declared', by: 'fixture author' }
        }
      }
    });
    window.mapHarness!.setConfig(config);
  });
}

test('XYZ tiles and features share patches, accessible layer controls, attribution and teardown', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/tiles/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: tile })
  );
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await addBasemap(page);
  const image = page.locator('img.leaflet-tile-loaded').first();
  await expect(image).toBeVisible();
  const node = await image.elementHandle();
  const canvas = await page
    .locator('.leaflet-container canvas')
    .elementHandle();
  const list = page.getByRole('group', { name: 'Layers', exact: true });
  await expect(
    list.getByRole('checkbox', { name: 'basemap', exact: true })
  ).toBeChecked();
  await expect(page.locator('.attribution')).toContainText('XYZ fixture <img');
  await expect(page.locator('.attribution img')).toHaveCount(0);
  await page.getByText('Layer information', { exact: true }).click();
  await expect(
    page.getByText('basemap: raster tiles', { exact: false })
  ).toBeVisible();
  await list.getByRole('slider', { name: 'Opacity for basemap' }).focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.leaflet-layer').first()).toHaveCSS(
    'opacity',
    '0.05'
  );
  expect(await node!.evaluate((element) => element.isConnected)).toBe(true);
  await list
    .getByRole('button', { name: 'Move basemap up', exact: true })
    .click();
  await expect(list.locator('li').first()).toContainText('basemap');
  expect(
    await page.evaluate(() => {
      const tilePane = document
        .querySelector('img.leaflet-tile')
        ?.closest('.leaflet-pane');
      const canvasPane = document
        .querySelector('.leaflet-container canvas')
        ?.closest('.leaflet-pane');
      return (
        Number((tilePane as HTMLElement)?.style.zIndex) >
        Number((canvasPane as HTMLElement)?.style.zIndex)
      );
    })
  ).toBe(true);
  await list.getByRole('checkbox', { name: 'basemap', exact: true }).uncheck();
  await expect(page.locator('img.leaflet-tile')).toHaveCount(0);
  await expect(page.locator('.attribution')).not.toContainText('XYZ fixture');
  await list.getByRole('checkbox', { name: 'basemap', exact: true }).check();
  await expect(image).toBeVisible();
  expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Toggle mount', exact: true }).click();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle mount', exact: true }).click();
  await expect(image).toBeVisible();
  await page.screenshot({
    path: 'test-results/maps/xyz-layers.png',
    fullPage: true
  });
  expect(errors).toEqual([]);
});

test('tile failures report a typed layer error and a visibility toggle retries without rebuilding', async ({
  page
}) => {
  let fail = true;
  await page.route('**/tiles/**', (route) =>
    route.fulfill(
      fail
        ? { status: 503, body: 'Unavailable' }
        : { contentType: 'image/svg+xml', body: tile }
    )
  );
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await addBasemap(page);
  await expect(page.getByRole('alert')).toContainText('Layer basemap');
  expect(await page.evaluate(() => window.mapHarness!.errorCodes())).toContain(
    'LAYER_LOAD_FAILED'
  );
  fail = false;
  await page.getByRole('checkbox', { name: 'basemap', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'basemap', exact: true }).check();
  await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Layer basemap' })
  ).toHaveCount(0);
  await expect(page.getByLabel('Ready count')).toHaveText('1');
});

test('removing a loading XYZ source cancels tiles and late responses cannot restore it', async ({
  page
}) => {
  let started = 0;
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/tiles/**', async (route) => {
    started++;
    await gate;
    await route
      .fulfill({ contentType: 'image/svg+xml', body: tile })
      .catch(() => {});
  });
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await addBasemap(page);
  await expect.poll(() => started).toBeGreaterThan(0);
  await page.evaluate(() => {
    const config = window.mapHarness!.config();
    config.layers = config.layers.filter((layer) => layer.id !== 'basemap');
    window.mapHarness!.setConfig(config);
  });
  await expect(page.locator('img.leaflet-tile')).toHaveCount(0);
  finish();
  await page.getByRole('application').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('img.leaflet-tile')).toHaveCount(0);
  await expect(
    page.getByRole('checkbox', { name: 'basemap', exact: true })
  ).toHaveCount(0);
});
