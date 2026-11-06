import { expect, test } from '@playwright/test';
import { wmsCapabilities } from '../support/ogc.ts';
const data = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [151, -34],
          [152, -33]
        ]
      }
    }
  ]
};

test('a hint stays unconfirmed until keyboard confirmation, with source extent and typed provenance', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let reads = 0;
  await page.route('**/confirmation.geojson', (route) => {
    reads++;
    return route.fulfill({ json: data });
  });
  await page.goto('/crs-confirm.html');
  const form = page.getByRole('region', {
    name: 'Confirm source coordinate system',
    exact: true
  });
  await expect(
    page.getByRole('textbox', { name: 'Source CRS code', exact: true })
  ).toHaveValue('OGC:CRS84');
  await expect(page.getByLabel('Confirmation count')).toHaveText('0');
  await expect(
    page.getByRole('button', { name: 'Confirm source CRS', exact: true })
  ).toBeDisabled();
  await expect(
    form.getByRole('region', { name: 'Unconfirmed source extent', exact: true })
  ).toHaveAttribute('data-map-ready', 'true');
  await expect(form).toContainText(
    'longitude 151.0000000, latitude -34.0000000'
  );
  await page.getByRole('textbox', { name: 'Declared by', exact: true }).focus();
  await page.keyboard.insertText('Reviewer');
  const button = page.getByRole('button', {
    name: 'Confirm source CRS',
    exact: true
  });
  await expect(button).toBeEnabled();
  expect(reads).toBe(1);
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Confirmation count')).toHaveText('1');
  await expect(
    page.getByRole('region', { name: 'Accepted source', exact: true })
  ).toHaveAttribute('data-map-ready', 'true');
  await expect(page.getByLabel('Confirmed provenance')).toContainText(
    '"by":"Reviewer"'
  );
  await expect(page.getByLabel('Confirmed provenance')).toContainText(
    'rfc7946_default'
  );
  expect(errors).toEqual([]);
});

test('a mismatch blocks acceptance, acknowledges only the chosen source, and resets after edits', async ({
  page
}) => {
  await page.route('**/*.geojson', (route) => route.fulfill({ json: data }));
  await page.goto('/crs-confirm.html');
  await page
    .getByRole('textbox', { name: 'Declared by', exact: true })
    .fill('Reviewer');
  await page
    .getByRole('textbox', { name: 'Source CRS code', exact: true })
    .fill('EPSG:4326');
  const button = page.getByRole('button', {
    name: 'Confirm source CRS',
    exact: true
  });
  const checkbox = page.getByRole('checkbox', {
    name: 'I checked the source and acknowledge this CRS hint mismatch.'
  });
  await expect(page.getByRole('alert')).toContainText(
    'CRS declaration differs'
  );
  await expect(button).toBeDisabled();
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(button).toBeEnabled();
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Confirmed provenance')).toContainText(
    '"hintMismatchAcknowledged":true'
  );
  const map = page.getByRole('region', {
    name: 'Accepted source',
    exact: true
  });
  await expect(map).toHaveAttribute('data-map-ready', 'true');
  await expect(map.getByRole('alert')).toHaveCount(0);
  await page
    .getByLabel('Source axis order', { exact: true })
    .selectOption('yx');
  await expect(checkbox).not.toBeChecked();
  await expect(button).toBeDisabled();
  await page
    .getByRole('button', { name: 'Use another source', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Source CRS code', exact: true })
  ).toHaveValue('OGC:CRS84');
  await expect(
    page.getByRole('textbox', { name: 'Declared by', exact: true })
  ).toHaveValue('');
  await expect(checkbox).toHaveCount(0);
});

test('unknown CRS codes have linked validation, and WKT-only hints stay blocked and render as text', async ({
  page
}) => {
  await page.route('**/confirmation.geojson', (route) =>
    route.fulfill({ json: data })
  );
  await page.goto('/crs-confirm.html');
  await page
    .getByRole('textbox', { name: 'Declared by', exact: true })
    .fill('Reviewer');
  await page
    .getByRole('textbox', { name: 'Source CRS code', exact: true })
    .fill('EPSG:unknown');
  // A differing hint blocks first; no unchecked bypass is introduced for unknown codes.
  await page.getByRole('checkbox').check();
  await expect(
    page.getByRole('textbox', { name: 'Source CRS code', exact: true })
  ).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByRole('button', { name: 'Confirm source CRS', exact: true })
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Inspect WKT', exact: true }).click();
  await expect(page.getByLabel('Detected CRS hint')).toContainText(
    '<img src=x onerror=alert(1)>'
  );
  await expect(page.getByLabel('Detected CRS hint').locator('img')).toHaveCount(
    0
  );
  await page
    .getByRole('textbox', { name: 'Declared by', exact: true })
    .fill('Reviewer');
  await page
    .getByRole('textbox', { name: 'Source CRS code', exact: true })
    .fill('EPSG:4326');
  await expect(
    page.getByRole('button', { name: 'Confirm source CRS', exact: true })
  ).toBeDisabled();
});

test('service metadata exposes the selected policy, CRS and provenance without manual declaration fields', async ({
  page
}) => {
  await page.route('**/confirmation.geojson', (route) =>
    route.fulfill({ json: data })
  );
  await page.route('**/wms-capabilities*', (route) =>
    route.fulfill({ contentType: 'text/xml', body: wmsCapabilities() })
  );
  await page.goto('/crs-confirm.html');
  await page
    .getByRole('button', { name: 'Inspect service', exact: true })
    .click();
  const form = page.getByRole('region', {
    name: 'Confirm source coordinate system',
    exact: true
  });
  await expect(form.getByLabel('Resolved source CRS')).toContainText(
    'EPSG:4326'
  );
  await expect(form).toContainText('axis order: yx');
  await expect(
    page.getByRole('textbox', { name: 'Source CRS code', exact: true })
  ).toHaveCount(0);
  await page
    .getByLabel('CRS selection policy', { exact: true })
    .selectOption('prefer-display');
  await expect(form.getByLabel('Resolved source CRS')).toContainText(
    'EPSG:3857'
  );
  await expect(form).toContainText('Metadata document:');
  await expect(form).toContainText('Metadata element:');
  await expect(page.getByLabel('Confirmation count')).toHaveText('0');
});

test('metadata retry and source replacement cannot accept stale results after unmount', async ({
  page
}) => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/confirmation.geojson', async (route) => {
    if (++calls === 1)
      return route.fulfill({ status: 503, body: 'Unavailable' });
    await gate;
    await route.fulfill({ json: data }).catch(() => {});
  });
  await page.goto('/crs-confirm.html');
  await expect(page.getByRole('alert')).toContainText(
    'Source metadata could not be read'
  );
  await page
    .getByRole('button', { name: 'Retry metadata', exact: true })
    .click();
  await expect.poll(() => calls).toBe(2);
  await page
    .getByRole('button', { name: 'Toggle confirmation', exact: true })
    .click();
  release();
  await expect(
    page.getByRole('region', {
      name: 'Confirm source coordinate system',
      exact: true
    })
  ).toHaveCount(0);
  await expect(page.getByLabel('Confirmation count')).toHaveText('0');
});
