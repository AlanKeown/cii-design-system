import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
  await expect(
    page.getByRole('heading', { name: /Good morning/ })
  ).toBeVisible();
});
test('member validation, persistence, assignment and theme', async ({
  page
}) => {
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Members' })
    .click();
  await page.getByRole('button', { name: /Add member$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Save member', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('Enter a name');
  await dialog.getByLabel('Name or title').fill('Test Community Member');
  await dialog.getByLabel('Email', { exact: true }).fill('test@example.org');
  await dialog
    .getByRole('button', { name: 'Save member', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search members' })
    .fill('Test Community');
  await page.getByRole('button', { name: /Test Community Member/ }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('tab', { name: 'Related records' }).click();
  await drawer.getByLabel('Assign to a program').selectOption('P-101');
  await drawer
    .getByRole('button', { name: 'Assign program', exact: true })
    .click();
  await expect(
    drawer.locator('p').filter({ hasText: /^Community pantry$/ })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Use light theme' })
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search members' })
    .fill('Test Community');
  await expect(
    page.getByRole('button', { name: /Test Community Member/ })
  ).toBeVisible();
});
test('case closure, filters and exports', async ({ page }) => {
  await page
    .getByRole('navigation')
    .getByRole('link', { name: /Cases/ })
    .click();
  await page
    .getByRole('button', { name: /Housing referral follow-up/ })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close case', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByText('Closed', { exact: true }).first()
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Filter by status').selectOption('Closed');
  await expect(
    page.getByRole('button', { name: /Housing referral/ })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Emergency food/ })
  ).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export CSV$/ }).click();
  expect((await download).suggestedFilename()).toBe('cases.csv');
});
test('role visibility and command search', async ({ page }) => {
  await page.getByLabel('Preview role').selectOption('Board Member');
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Members' })
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Quick add/ })).toHaveCount(0);
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Reports' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Reports', exact: true })
  ).toBeVisible();
  await page.getByLabel('Preview role').selectOption('Staff');
  await page.keyboard.press('Control+k');
  await page
    .getByRole('textbox', { name: 'Search all accessible records' })
    .fill('Amelia');
  await page.getByRole('button', { name: /Amelia Thompson/ }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Amelia Thompson' })
  ).toBeVisible();
});
test('mobile navigation fits viewport and captures light and dark views', async ({
  page
}) => {
  await page.screenshot({
    path: 'test-results/dashboard-desktop.png',
    fullPage: true,
    animations: 'disabled'
  });
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await page.screenshot({
    path: 'test-results/dashboard-dark.png',
    fullPage: true,
    animations: 'disabled'
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('button', { name: 'Toggle navigation' })
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Members' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Members', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Add member$/ })).toBeVisible();
  await page.screenshot({
    path: 'test-results/members-mobile.png',
    fullPage: true,
    animations: 'disabled'
  });
});

test('module URLs survive reloads and browser history', async ({ page }) => {
  const navigation = page.getByRole('navigation');
  await navigation.getByRole('link', { name: 'Members', exact: true }).click();
  await expect(page).toHaveURL(/\?module=Members$/);
  await navigation.getByRole('link', { name: /^Cases/ }).click();
  await expect(page).toHaveURL(/\?module=Cases$/);
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Members', exact: true })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Members', exact: true })
  ).toBeVisible();
  await page.goto('/#Members');
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
  await expect(
    page.getByRole('heading', { name: 'Members', exact: true })
  ).toBeVisible();
});
