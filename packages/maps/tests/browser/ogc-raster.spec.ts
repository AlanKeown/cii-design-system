import { expect, test, type Page } from '@playwright/test';
import { wmsCapabilities, wmtsCapabilities } from '../support/ogc.ts';
import { oracleTile } from './support/tiles.ts';
import type {} from './fixtures/main.ts';

const png = oracleTile([-1, -1, 1, 1], [0, 0], [40, 90, 120], 40);
async function addService(
  page: Page,
  provider: 'wms' | 'wmts',
  layer = 'demo'
) {
  await page.evaluate(
    ({ provider, layer }) => {
      const config = window.mapHarness!.config();
      config.controls = [{ id: 'zoom' }, { id: 'layer-list' }];
      config.layers = config.layers.filter((item) => item.id !== 'service');
      // Keep WMTS within the synthetic catalogue's advertised zoom range.
      if (provider === 'wmts')
        config.view = {
          center: { crs: 'OGC:CRS84', coordinates: [0, 0] },
          zoom: 2
        };
      config.layers.unshift({
        id: 'service',
        order: -1,
        attribution: 'Synthetic OGC <script> attribution',
        source: {
          provider,
          url: `/ogc/${provider}-capabilities`,
          crs: { fromMetadata: true, policy: 'prefer-display' },
          ...(provider === 'wms'
            ? { layers: layer }
            : { layer, matrixSet: 'web' })
        }
      });
      window.mapHarness!.setConfig(config);
    },
    { provider, layer }
  );
}

for (const code of ['EPSG:3857', 'EPSG:4326', 'OGC:CRS84']) {
  test(`WMS renders metadata-selected ${code} tiles, patches handles, and retains attribution`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let capabilities = 0;
    const tiles: URL[] = [];
    await page.route('**/ogc/**', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('capabilities')) {
        capabilities++;
        return route.fulfill({
          contentType: 'text/xml',
          body: wmsCapabilities()
        });
      }
      tiles.push(url);
      return route.fulfill({ contentType: 'image/png', body: png });
    });
    await page.goto(`/?display=${encodeURIComponent(code)}`);
    await expect(page.getByLabel('Ready count')).toHaveText('1');
    const canvas = await page
      .locator('.leaflet-container canvas')
      .elementHandle();
    await addService(page, 'wms');
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();
    expect(capabilities).toBe(1);
    expect(tiles.length).toBeGreaterThan(0);
    for (const url of tiles) {
      expect(url.pathname).toBe('/ogc/maps');
      expect(url.searchParams.get('CRS')).toBe(
        code === 'OGC:CRS84' ? 'CRS:84' : code
      );
      const bbox = url.searchParams.get('BBOX')!.split(',').map(Number);
      if (code === 'EPSG:4326') expect(bbox[0]).toBeLessThan(-30);
      if (code === 'OGC:CRS84') expect(bbox[0]).toBeGreaterThan(140);
    }
    const visible = page.getByRole('checkbox', {
      name: 'service',
      exact: true
    });
    await visible.uncheck();
    await expect(page.locator('img.leaflet-tile')).toHaveCount(0);
    await visible.check();
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();
    expect(capabilities).toBe(1);
    expect(await canvas!.evaluate((node) => node.isConnected)).toBe(true);
    await expect(page.locator('.attribution')).toContainText(
      'Synthetic OGC <script>'
    );
    await expect(page.locator('.attribution script')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const rest of [false, true]) {
  test(`WMTS ${rest ? 'REST' : 'KVP'} requests use advertised matrix identifiers and clean up on unmount`, async ({
    page
  }) => {
    const requests: URL[] = [];
    await page.route('**/ogc/**', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('capabilities'))
        return route.fulfill({
          contentType: 'text/xml',
          body: wmtsCapabilities({ rest })
        });
      requests.push(url);
      return route.fulfill({ contentType: 'image/png', body: png });
    });
    await page.goto('/');
    await expect(page.getByLabel('Ready count')).toHaveText('1');
    await addService(page, 'wmts');
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();
    expect(requests.length).toBeGreaterThan(0);
    for (const url of requests) {
      if (rest) expect(url.pathname).toMatch(/\/web\/level-2\/\d+\/\d+\.png$/);
      else {
        expect(url.searchParams.get('TILEMATRIX')).toBe('level-2');
        expect(url.searchParams.get('REQUEST')).toBe('GetTile');
      }
    }
    await page
      .getByRole('button', { name: 'Toggle mount', exact: true })
      .click();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Toggle mount', exact: true })
      .click();
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  });
}

test('unadvertised WMS display CRSs and incompatible WMTS tile sizes refuse before image requests', async ({
  page
}) => {
  let images = 0;
  await page.route('**/ogc/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('wms-capabilities'))
      return route.fulfill({
        body: wmsCapabilities('1.3.0', '/ogc/maps', ['EPSG:4326']),
        contentType: 'text/xml'
      });
    if (url.pathname.endsWith('wmts-capabilities'))
      return route.fulfill({
        body: wmtsCapabilities({ size: 512 }),
        contentType: 'text/xml'
      });
    images++;
    return route.fulfill({ body: png, contentType: 'image/png' });
  });
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  for (const provider of ['wms', 'wmts'] as const) {
    await addService(page, provider);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Layer service' })
    ).toBeVisible();
    expect(
      await page.evaluate(() => window.mapHarness!.errorCodes())
    ).toContain('LAYER_INCOMPATIBLE');
    await expect(page.locator('img.leaflet-tile')).toHaveCount(0);
  }
  expect(images).toBe(0);
});

test('capabilities failures recover, superseded metadata is cancelled, and raster tile errors retry', async ({
  page
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let count = 0,
    failTiles = true;
  await page.route('**/ogc/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('capabilities')) {
      count++;
      if (count === 1) {
        await gate;
        return route
          .fulfill({ contentType: 'text/xml', body: '<invalid/>' })
          .catch(() => {});
      }
      if (count === 2)
        return route.fulfill({ status: 503, body: 'Unavailable' });
      return route.fulfill({
        contentType: 'text/xml',
        body: wmsCapabilities()
      });
    }
    return route.fulfill(
      failTiles
        ? { status: 503, body: 'Unavailable' }
        : { contentType: 'image/png', body: png }
    );
  });
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await addService(page, 'wms');
  await expect.poll(() => count).toBe(1);
  await page.evaluate(() => {
    const config = window.mapHarness!.config();
    config.layers = config.layers.filter((layer) => layer.id !== 'service');
    window.mapHarness!.setConfig(config);
  });
  release();
  await addService(page, 'wms');
  await expect.poll(() => count).toBe(2);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Layer service' })
  ).toBeVisible();
  await page.evaluate(() =>
    window.mapHarness!.setConfig(window.mapHarness!.config())
  );
  await expect.poll(() => count).toBe(3);
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Some tiles could not be loaded' })
  ).toBeVisible();
  failTiles = false;
  await page.getByRole('checkbox', { name: 'service', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'service', exact: true }).check();
  await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.getByLabel('Ready count')).toHaveText('1');
});
