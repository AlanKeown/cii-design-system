import { test, expect } from '@playwright/test';

test('design documents connect current plans and archived specifications under the deployment base', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('./');
  await page
    .getByRole('link', { name: 'Design documents', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/design\/$/);
  await expect(
    page.getByRole('heading', { name: 'Current documents', exact: true })
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Mapping development plan', exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/design\/mapping\/$/);
  await expect(
    page.getByRole('heading', {
      name: 'Svelte Unified Mapping Components — Development Plan',
      exact: true
    })
  ).toBeVisible();
  await expect(
    page.locator('pre').filter({ hasText: '<script lang="ts">' }).first()
  ).toBeAttached();
  await page
    .getByRole('link', { name: 'mapping-components-spec.md', exact: true })
    .click();
  await expect(page).toHaveURL(/\/design\/archive\/mapping-spec\/$/);
  await expect(page.getByText('Superseded.', { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole('link', {
      name: 'svelte-mapping-components-development-plan.md',
      exact: true
    })
    .click();
  await expect(page).toHaveURL(/\/design\/mapping\/$/);
  const section = page.getByRole('heading', {
    name: 'Decisions already taken for this plan',
    exact: true
  });
  const hash = await section.getByRole('link').getAttribute('href');
  expect(hash).toMatch(/^#.+/);
  await page.goto(`design/mapping/${hash}`);
  await expect(section).toBeInViewport();
  expect(errors).toEqual([]);
});

test('design documents load directly on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [slug, heading] of [
    [
      'product',
      'Community Organisation Portal — Product Design Specification (v1.0)'
    ],
    ['portal-backend', 'Community Portal Backend — Development Plan'],
    ['mapping-phase-1-review', 'Mapping Phase 1 acceptance review']
  ]) {
    const response = await page.goto(`design/${slug}/`);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: heading, exact: true })
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
  }
});

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

test('documentation links to the live portal', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('examples/community-portal/');
  const guideLink = page.getByRole('link', {
    name: 'Open the Common Ground community portal'
  });
  await expect(guideLink).toHaveAttribute(
    'href',
    'https://cii-community-portal.pages.dev'
  );
  await expect(
    page.getByRole('link', { name: 'Live portal', exact: true }).first()
  ).toHaveAttribute('href', 'https://cii-community-portal.pages.dev');
});
