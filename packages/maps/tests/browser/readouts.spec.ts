import { expect, test, type Page } from '@playwright/test';
import type {} from './fixtures/main.ts';

async function targetCrs(page: Page, code: string) {
  await page.evaluate((code) => {
    const config = window.mapHarness!.config();
    config.controls!.find((control) => control.id === 'coords')!.readoutCrs =
      code;
    window.mapHarness!.setConfig(config);
  }, code);
}

test('scale and pointer/keyboard coordinates update without live-region flooding or map changes', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?readouts');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  const scale = page.getByRole('region', { name: 'Map scale', exact: true });
  const readout = page.getByRole('region', {
    name: 'Coordinate readout',
    exact: true
  });
  await expect(scale).toContainText('Approximate ground distance at centre');
  await expect(readout).toContainText('Map centre');
  await expect(readout.locator('[data-coordinate="readout"]')).toContainText(
    'OGC:CRS84'
  );
  const initialWidth = await scale
    .locator('.bar')
    .evaluate((node) => node.getBoundingClientRect().width);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect
    .poll(() =>
      scale
        .locator('.bar')
        .evaluate((node) => node.getBoundingClientRect().width)
    )
    .not.toBe(initialWidth);
  const canvas = page.getByRole('application');
  const box = (await canvas.boundingBox())!;
  await canvas.hover({
    position: { x: box.width * 0.4, y: box.height * 0.35 }
  });
  await expect(readout.locator('.mode')).toHaveText('Pointer');
  await expect(readout.getByRole('status')).toBeEmpty();
  expect(
    await readout
      .locator('[data-coordinate="readout"]')
      .evaluate((node) =>
        node.closest('[aria-live]')?.getAttribute('aria-live')
      )
  ).toBe('off');
  await readout
    .getByRole('button', { name: 'Announce coordinates', exact: true })
    .click();
  await expect(readout.getByRole('status')).toContainText(
    'Pointer. EPSG:3857:'
  );
  const before = await page.evaluate(() => window.mapHarness!.view());
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect(readout.locator('.mode')).toHaveText('Map centre');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.mapHarness!.view())).center[0]
    )
    .toBeGreaterThan(before.center[0]);
  await readout
    .getByRole('button', { name: 'Announce coordinates', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(readout.getByRole('status')).toContainText(
    'Map centre. EPSG:3857:'
  );
  await expect(readout.getByRole('status')).toContainText(
    'survey accuracy is not established'
  );
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await page
    .getByRole('region', { name: 'Fixture', exact: true })
    .screenshot({ path: 'test-results/maps/readouts-wide.png' });
  expect(errors).toEqual([]);
});

test('readout CRS changes use the transform service, retain accuracy warnings, and refuse unknown CRSs', async ({
  page
}) => {
  await page.goto('/?readouts');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  const canvas = await page
    .locator('.leaflet-container canvas')
    .elementHandle();
  const readout = page.getByRole('region', {
    name: 'Coordinate readout',
    exact: true
  });
  await targetCrs(page, 'EPSG:7856');
  await expect(readout.locator('[data-coordinate="readout"]')).toContainText(
    'EPSG:7856'
  );
  await expect(readout).toContainText('Datums differ');
  await expect(readout).toContainText('realisation unspecified');
  expect(await canvas!.evaluate((node) => node.isConnected)).toBe(true);
  await targetCrs(page, 'EPSG:unknown');
  await expect(page.getByRole('alert')).toContainText(
    'Check the registered readout CRS'
  );
  await expect(readout.locator('[data-coordinate="readout"]')).toContainText(
    'EPSG:7856'
  );
  await targetCrs(page, 'OGC:CRS84');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(readout.locator('[data-coordinate="readout"]')).toContainText(
    'OGC:CRS84'
  );
  await expect(page.getByLabel('Ready count')).toHaveText('1');
});

test('invalid pointer positions clear stale coordinates and recover on centre selection', async ({
  page
}) => {
  await page.goto('/?readouts&display=EPSG%3A4326');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  const readout = page.getByRole('region', {
    name: 'Coordinate readout',
    exact: true
  });
  await page.evaluate(() =>
    window.mapHarness!.setView({ center: [0, 89.99], resolution: 0.001 })
  );
  await expect(readout).toContainText('89.990');
  const canvas = page.getByRole('application');
  const box = (await canvas.boundingBox())!;
  await canvas.hover({ position: { x: box.width * 0.5, y: 4 } });
  await expect(readout).toContainText('Coordinates unavailable');
  await expect(readout.locator('[data-coordinate]')).toHaveCount(0);
  await readout
    .getByRole('button', { name: 'Use map centre', exact: true })
    .click();
  await expect(readout.locator('.mode')).toHaveText('Map centre');
  await expect(readout).not.toContainText('Coordinates unavailable');
});

test('controls fit narrow views, follow themes, and release pending updates on disable and unmount', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/?readouts&readout=EPSG%3A7856');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  const readout = page.getByRole('region', {
    name: 'Coordinate readout',
    exact: true
  });
  await expect(readout).toContainText('EPSG:7856');
  expect(
    await page
      .locator('.readouts')
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
  ).toBe(true);
  const background = await readout.evaluate(
    (node) => getComputedStyle(node).backgroundColor
  );
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect
    .poll(() =>
      readout.evaluate((node) => getComputedStyle(node).backgroundColor)
    )
    .not.toBe(background);
  await page
    .getByRole('region', { name: 'Fixture', exact: true })
    .screenshot({ path: 'test-results/maps/readouts-narrow.png' });
  await page.evaluate(() => {
    const config = window.mapHarness!.config();
    config.controls = [{ id: 'zoom' }];
    window.mapHarness!.setConfig(config);
  });
  await expect(readout).toHaveCount(0);
  await page.getByRole('application').focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Toggle mount', exact: true }).click();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle mount', exact: true }).click();
  await expect(page.getByLabel('Ready count')).toHaveText('2');
  expect(errors).toEqual([]);
});
