import { expect, test } from '@playwright/test';

test('map documentation prerenders a stable placeholder and hydrates a working feature map', async ({
  page,
  request
}) => {
  const response = await request.get('components/map/');
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain('Loading map');
  expect(html).toContain('Harbour community hub');
  expect(html).not.toContain('class="leaflet-pane');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('components/map/');
  const map = page.getByRole('region', {
    name: 'Community demonstration',
    exact: true
  });
  await expect(map).toHaveAttribute('data-map-ready', 'true');
  await expect(map.locator('canvas')).toHaveCount(1);
  await expect(
    map.getByRole('region', { name: 'Map scale', exact: true })
  ).toBeVisible();
  const coordinates = map.getByRole('region', {
    name: 'Coordinate readout',
    exact: true
  });
  await expect(coordinates).toContainText('OGC:CRS84');
  await page
    .getByRole('combobox', { name: 'Readout CRS', exact: true })
    .selectOption('EPSG:7856');
  await expect(coordinates).toContainText('EPSG:7856');
  await expect(coordinates).toContainText('Datums differ');
  await page
    .getByRole('combobox', { name: 'Readout CRS', exact: true })
    .selectOption('OGC:CRS84');
  await expect(map.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  const service = page.getByRole('combobox', { name: 'Basemap service' });
  for (const provider of ['wms', 'wmts', 'xyz']) {
    await service.selectOption(provider);
    await expect(
      map
        .locator(
          `img.leaflet-tile-loaded[src*="${provider === 'xyz' ? 'demo-tile.svg' : provider === 'wms' ? 'REQUEST=GetMap' : 'REQUEST=GetTile'}"]`
        )
        .first()
    ).toBeVisible();
    await expect(map.getByRole('alert')).toHaveCount(0);
  }

  const basemap = map.getByRole('checkbox', {
    name: 'demonstration-basemap',
    exact: true
  });
  await expect(basemap).toBeChecked();
  await basemap.uncheck();
  await expect(map.locator('img.leaflet-tile')).toHaveCount(0);
  await basemap.check();
  await expect(map.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  await expect(
    map.getByText('Display accuracy', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Hide sites', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Show sites', exact: true })
  ).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Show sites', exact: true }).click();
  await page.getByRole('button', { name: 'Unmount map', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Community map', exact: true })
      .locator('.leaflet-container')
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Mount map', exact: true }).click();
  await expect(map).toHaveAttribute('data-map-ready', 'true');
  await page.screenshot({
    path: 'test-results/map-desktop.png',
    fullPage: true
  });
  expect(errors).toEqual([]);
});

test('CRS confirmation docs require acceptance and share scoped acknowledgement with the map', async ({
  page,
  request
}) => {
  const response = await request.get('components/map/');
  const html = await response.text();
  expect(html).toContain('Reading source coordinate metadata');
  expect(html).not.toContain('class="leaflet-pane');
  await page.goto('components/map/');
  const example = page.getByRole('region', {
    name: 'Source CRS confirmation',
    exact: true
  });
  await expect(
    example.getByRole('textbox', { name: 'Source CRS code', exact: true })
  ).toHaveValue('OGC:CRS84');
  await expect(
    page.getByRole('region', {
      name: 'Confirmed demonstration locations',
      exact: true
    })
  ).toHaveCount(0);
  await example
    .getByRole('textbox', { name: 'Declared by', exact: true })
    .fill('Docs reviewer');
  await example
    .getByRole('textbox', { name: 'Source CRS code', exact: true })
    .fill('EPSG:4326');
  const button = example.getByRole('button', {
    name: 'Confirm source CRS',
    exact: true
  });
  await expect(button).toBeDisabled();
  await example.getByRole('checkbox').check();
  await expect(button).toBeEnabled();
  await button.click();
  const map = page.getByRole('region', {
    name: 'Confirmed demonstration locations',
    exact: true
  });
  await expect(map).toHaveAttribute('data-map-ready', 'true');
  await expect(map.locator('canvas')).toHaveCount(1);
  await expect(map.getByRole('alert')).toHaveCount(0);
});

test('runtime display CRS docs preserve local layer settings through a round trip', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('components/map/');
  const example = page.getByRole('region', {
    name: 'Runtime display CRS',
    exact: true
  });
  const map = example.getByRole('region', {
    name: 'Switchable demonstration',
    exact: true
  });
  await expect(map).toHaveAttribute('data-map-ready', 'true');
  const site = map.getByRole('checkbox', {
    name: 'switching-site',
    exact: true
  });
  await site.uncheck();
  for (const crs of ['EPSG:4326', 'OGC:CRS84', 'EPSG:3857']) {
    await example
      .getByRole('combobox', { name: 'Display CRS', exact: true })
      .selectOption(crs);
    await expect(map).toHaveAttribute('data-display-crs', crs);
    await expect(
      example.getByRole('status').filter({ hasText: 'Active display:' })
    ).toHaveText(`Active display: ${crs}`);
    await expect(site).not.toBeChecked();
    await expect(map.locator('.leaflet-container')).toHaveCount(1);
    await expect(map.getByRole('alert')).toHaveCount(0);
  }
  await site.check();
  expect(errors).toEqual([]);
});
