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
  await expect(map.locator('img.leaflet-tile-loaded').first()).toBeVisible();
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
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mount map', exact: true }).click();
  await expect(map).toHaveAttribute('data-map-ready', 'true');
  await page.screenshot({
    path: 'test-results/map-desktop.png',
    fullPage: true
  });
  expect(errors).toEqual([]);
});
