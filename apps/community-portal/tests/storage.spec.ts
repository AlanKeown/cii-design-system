import { test, expect, type Page } from '@playwright/test';
import { initialRecords } from '../src/lib/data.ts';

async function seed(page: Page, key: string, raw: string) {
  await page.addInitScript(
    ({ key, raw }) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, raw);
        sessionStorage.setItem('seeded', 'true');
      }
    },
    { key, raw }
  );
}
async function ready(page: Page, url = '/') {
  await page.goto(url);
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
}
async function openMemberForm(page: Page) {
  await ready(page, '/?module=Members');
  await page.getByRole('button', { name: /Add member$/ }).click();
  return page.getByRole('dialog');
}

for (const raw of [
  '{invalid-json',
  JSON.stringify({
    records: { ...initialRecords, Members: [{ name: 42 }] },
    dark: false
  })
]) {
  test(`corrupt workspace is preserved until replacement is confirmed: ${raw.startsWith('{invalid') ? 'JSON' : 'record fields'}`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await seed(page, 'community-portal-v1', raw);
    await ready(page);
    await expect(page.getByRole('alert')).toContainText(
      'Automatic saving is paused'
    );
    await page.getByRole('button', { name: 'Use dark theme' }).click();
    expect(
      await page.evaluate(() => localStorage.getItem('community-portal-v1'))
    ).toBe(raw);
    await page.reload();
    await expect(page.getByRole('alert')).toContainText(
      'preserve the original data'
    );
    page.once('dialog', (dialog) => dialog.dismiss());
    await page
      .getByRole('button', { name: 'Save current workspace instead' })
      .click();
    expect(
      await page.evaluate(() => localStorage.getItem('community-portal-v1'))
    ).toBe(raw);
    page.once('dialog', (dialog) => dialog.accept());
    await page
      .getByRole('button', { name: 'Save current workspace instead' })
      .click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('community-portal-v1'))
      )
      .not.toBe(raw);
    await page.reload();
    await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('legacy data loads and upgrades while preserving records, activity and theme', async ({
  page
}) => {
  const records = structuredClone(initialRecords);
  records.Members[0]!.name = 'Legacy community member';
  for (const list of Object.values(records))
    for (const record of list) Reflect.deleteProperty(record, 'kind');
  await seed(
    page,
    'community-portal-v1',
    JSON.stringify({
      records,
      dark: true,
      audit: [
        {
          action: 'Imported',
          record: 'Legacy community member',
          by: 'Demo',
          at: '2026-10-31T01:00:00Z'
        }
      ],
      savedViews: []
    })
  );
  await ready(page, '/?module=Members');
  await expect(
    page.getByRole('button', { name: 'Use light theme' })
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search members' })
    .fill('Legacy community member');
  await page.getByRole('button', { name: /Legacy community member/ }).click();
  await expect(
    page.getByRole('dialog').getByText('undefined', { exact: true })
  ).toHaveCount(0);
  await page.getByRole('tab', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Prefers contact by email.'
  );
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Imported');
  const saved: unknown = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('community-portal-v1')!)
  );
  expect(saved).toMatchObject({
    version: 2,
    dark: true,
    records: {
      Members: [
        { kind: 'Members', name: 'Legacy community member' },
        ...records.Members.slice(1).map((record) => ({
          ...record,
          kind: 'Members'
        }))
      ]
    }
  });
});

test('valid draft survives closing the form and reloading before being saved', async ({
  page
}) => {
  const dialog = await openMemberForm(page);
  await dialog.getByLabel('Name or title').fill('Draft member');
  await dialog.getByLabel('Email', { exact: true }).fill('draft@example.org');
  await dialog.getByRole('button', { name: 'Save draft', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close form' }).click();
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: /Add member$/ }).click();
  await dialog.getByRole('button', { name: 'Restore draft' }).click();
  await expect(dialog.getByLabel('Name or title')).toHaveValue('Draft member');
  await expect(dialog.getByLabel('Email', { exact: true })).toHaveValue(
    'draft@example.org'
  );
  await dialog
    .getByRole('button', { name: 'Save member', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search members' })
    .fill('Draft member');
  await expect(
    page.getByRole('button', { name: /Draft member/ })
  ).toBeVisible();
});

test('invalid draft keeps current form entries intact', async ({ page }) => {
  await seed(
    page,
    'community-draft-Members',
    JSON.stringify({ name: { invalid: true } })
  );
  const dialog = await openMemberForm(page);
  await dialog.getByLabel('Name or title').fill('Keep these entries');
  await dialog.getByRole('button', { name: 'Restore draft' }).click();
  await expect(dialog.getByLabel('Name or title')).toHaveValue(
    'Keep these entries'
  );
  await expect(page.getByRole('status')).toContainText(
    'Your current entries were kept'
  );
});

test('donations reject zero and negative amounts, then persist a valid amount', async ({
  page
}) => {
  await ready(page, '/?module=Donations');
  await page.getByRole('button', { name: /Add donation$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name or title').fill('Test donor');
  const amount = dialog.getByLabel('Amount (AUD)');
  for (const value of ['0', '-5']) {
    await amount.fill(value);
    await dialog
      .getByRole('button', { name: 'Save donation', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toContainText(
      'Enter an amount greater than zero.'
    );
  }
  await amount.fill('12.50');
  await dialog
    .getByRole('button', { name: 'Save donation', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page
    .getByRole('textbox', { name: 'Search donations' })
    .fill('Test donor');
  await expect(page.getByRole('button', { name: /Test donor/ })).toBeVisible();
});

test('program capacity validation and event attendance survive a reload', async ({
  page
}) => {
  await ready(page, '/?module=Programs');
  await page.getByRole('button', { name: /Add program$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name or title').fill('New program');
  await dialog.getByLabel('Capacity').fill('10');
  await dialog.getByLabel('Participants').fill('11');
  await dialog
    .getByRole('button', { name: 'Save program', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Participants cannot exceed capacity.'
  );
  await dialog.getByLabel('Participants').fill('9');
  await dialog
    .getByRole('button', { name: 'Save program', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Events', exact: true })
    .click();
  await page.getByRole('button', { name: /Add event$/ }).click();
  await dialog.getByLabel('Name or title').fill('New event');
  await dialog.getByLabel('Attendees').fill('5');
  await dialog.getByRole('button', { name: 'Save event', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search events' }).fill('New event');
  await page.getByRole('button', { name: /New event/ }).click();
  await dialog.getByRole('button', { name: 'Check in attendee' }).click();
  await page.reload();
  await page.getByRole('textbox', { name: 'Search events' }).fill('New event');
  await page.getByRole('button', { name: /New event/ }).click();
  await expect(
    dialog
      .locator('dl div')
      .filter({ has: page.locator('dt', { hasText: /^attendees$/ }) })
      .locator('dd')
  ).toHaveText('6');
});
