import { test, expect } from '@playwright/test';

test('documentation navigation and shared button interaction', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(
    page.getByRole('heading', {
      name: 'CII Design System',
      exact: true
    })
  ).toBeVisible();
  await page.getByRole('link', { name: 'Button', exact: true }).first().click();
  const preview = page.getByRole('region', { name: 'Button example' });
  await expect(preview).toHaveAttribute('data-ready', 'true');
  await preview
    .getByRole('button', { name: 'Add member', exact: true })
    .click();
  await expect(preview.getByRole('status')).toHaveText('Members added: 1');
  await expect(
    preview.getByRole('button', { name: 'Unavailable', exact: true })
  ).toBeDisabled();
  await expect(
    preview.getByRole('button', { name: 'Saving', exact: true })
  ).toHaveAttribute('aria-busy', 'true');
  await preview.getByRole('button', { name: 'Dark preview' }).click();
  await expect(preview).toHaveAttribute('data-cii-theme', 'dark');
  await expect(preview).toHaveCSS('background-color', 'rgb(16, 27, 42)');
  await page.screenshot({
    path: 'test-results/docs-button-desktop.png',
    fullPage: true,
    animations: 'disabled'
  });
  expect(errors).toEqual([]);
});

test('text field connects labels, errors and successful form feedback', async ({
  page
}) => {
  await page.goto('components/text-field/');
  const preview = page.getByRole('region', { name: 'Text field example' });
  await expect(preview).toHaveAttribute('data-ready', 'true');
  const input = preview.getByRole('textbox', { name: 'Member name' });
  await preview
    .getByRole('button', { name: 'Save member', exact: true })
    .click();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAttribute(
    'aria-describedby',
    'example-member-name-hint example-member-name-error'
  );
  await expect(
    preview.getByText('Enter a member name.', { exact: true })
  ).toBeVisible();
  await input.fill('Alex Example');
  await preview
    .getByRole('button', { name: 'Save member', exact: true })
    .click();
  await expect(preview.getByRole('status')).toContainText(
    'Saved Alex Example.'
  );
  await expect(input).not.toHaveAttribute('aria-invalid', 'true');
});

test('alerts support dynamic feedback and previews fit a narrow viewport', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('components/alert/');
  const preview = page.getByRole('region', { name: 'Alert example' });
  await expect(preview).toHaveAttribute('data-ready', 'true');
  await preview.getByRole('button', { name: 'Show success message' }).click();
  await expect(preview.getByRole('status')).toContainText('Changes saved');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: 'test-results/docs-alert-mobile.png',
    fullPage: true,
    animations: 'disabled'
  });
});

test('production search returns documented components', async ({ page }) => {
  await page.goto('components/button/');
  await expect(
    page.getByRole('region', { name: 'Button example' })
  ).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search documentation...' });
  const search = dialog.getByRole('textbox');
  await expect(search).toBeVisible();
  await search.fill('Text field');
  const result = dialog
    .getByRole('option')
    .filter({ hasText: '/components/text-field' })
    .first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/components\/text-field/);
  await expect(
    page.getByRole('region', { name: 'Text field example' })
  ).toBeVisible();
});
