import { expect, test } from '@playwright/test';

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test('form waits, blocks duplicate submissions and retains entries on backend field errors', async ({
  page
}) => {
  const gate = deferred();
  let requests = 0;
  await page.route('**/operation/save', async (route) => {
    requests++;
    if (requests === 1) {
      await gate.promise;
      await route.fulfill({ status: 422 });
    } else await route.fulfill({ status: 200 });
  });
  await page.goto('/');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name or title').fill('Keep this member');
  await dialog.getByLabel('Email', { exact: true }).fill('member@example.org');
  await dialog
    .getByRole('button', { name: 'Save member', exact: true })
    .click();
  const pending = dialog.getByRole('button', { name: 'Saving…', exact: true });
  await expect(pending).toBeDisabled();
  await expect(pending).toHaveAttribute('aria-busy', 'true');
  await dialog.locator('form').evaluate((form) => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
  });
  expect(requests).toBe(1);
  gate.release();
  await expect(
    dialog.getByRole('region', { name: 'Record validation errors' })
  ).toBeFocused();
  await expect(dialog.getByLabel('Email', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true'
  );
  await expect(dialog.getByLabel('Name or title')).toHaveValue(
    'Keep this member'
  );
  await expect(dialog.getByLabel('Email', { exact: true })).toHaveValue(
    'member@example.org'
  );
  await dialog
    .getByRole('button', { name: 'Save member', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(requests).toBe(2);
});

test('drawer retains a failed note and clears it only after a successful retry', async ({
  page
}) => {
  const gate = deferred();
  let requests = 0;
  await page.route('**/operation/update', async (route) => {
    requests++;
    if (requests === 1) {
      await gate.promise;
      await route.fulfill({ status: 503 });
    } else await route.fulfill({ status: 200 });
  });
  await page.goto('/?view=drawer');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Notes', exact: true }).click();
  const note = dialog.getByLabel('Add note');
  await note.fill('Keep this note');
  const save = dialog.getByRole('button', { name: 'Save note', exact: true });
  await save.click();
  await expect(save).toBeDisabled();
  gate.release();
  await expect(dialog.getByRole('alert')).toContainText(
    'Please try saving the note again.'
  );
  await expect(note).toHaveValue('Keep this note');
  await save.click();
  await expect(note).toHaveValue('');
  await expect(dialog.locator('.note-text')).toContainText('Keep this note');
  expect(requests).toBe(2);
});

test('reports discard stale responses and show failures without enabling stale exports', async ({
  page
}) => {
  const first = deferred();
  let requests = 0;
  await page.route('**/operation/report?**', async (route) => {
    requests++;
    const request = requests;
    if (request === 1) await first.promise;
    if (request > 2) {
      await route.fulfill({ status: 503 });
      return;
    }
    await route.fulfill({
      json: [
        {
          kind: request === 1 ? 'Members' : 'Events',
          id: 'test',
          name: request === 1 ? 'Stale member' : 'Current event',
          status: 'Upcoming',
          date: '2026-11-03'
        }
      ]
    });
  });
  await page.goto('/?view=reports');
  await expect.poll(() => requests).toBe(1);
  await page
    .getByRole('combobox', { name: 'Report', exact: true })
    .selectOption('Events');
  await expect(page.getByRole('cell', { name: 'Current event' })).toBeVisible();
  const staleResponse = page.waitForResponse((response) =>
    response.url().includes('/operation/report?module=Members')
  );
  first.release();
  await (await staleResponse).finished();
  await expect(page.getByRole('cell', { name: 'Stale member' })).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'Report', exact: true })
    .selectOption('Donations');
  await expect(page.getByRole('alert')).toContainText('Report unavailable.');
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  await expect(page.getByRole('cell', { name: 'Current event' })).toHaveCount(
    0
  );
});
