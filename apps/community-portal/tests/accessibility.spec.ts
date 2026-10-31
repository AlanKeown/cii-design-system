import { test, expect, type Page, type Locator } from '@playwright/test';

async function ready(page: Page, module = 'Members') {
  await page.goto('/?module=' + module);
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
}

// Reach controls through the tab order; never use a mouse to activate them.
async function tabTo(page: Page, target: Locator, backwards = false) {
  for (let step = 0; step < 100; step++) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
  }
  throw new Error('Control was not reachable through the keyboard tab order.');
}
async function openForm(page: Page, module = 'Members', noun = 'member') {
  await ready(page, module);
  const trigger = page.getByRole('button', {
    name: new RegExp('Add ' + noun + '$')
  });
  await tabTo(page, trigger);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Add ' + noun, exact: true });
  await expect(dialog).toBeVisible();
  return { trigger, dialog };
}
async function expectBackgroundInert(page: Page) {
  expect(
    await page.evaluate(() => {
      document.getElementById('main')?.focus();
      return !!document.activeElement?.closest('dialog[open]');
    })
  ).toBe(true);
}

test('named form contains focus, blocks background focus, and restores its trigger on Escape', async ({
  page
}) => {
  const { trigger, dialog } = await openForm(page);
  const close = dialog.getByRole('button', { name: 'Close form' });
  await expect(close).toBeFocused();
  await expectBackgroundInert(page);
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'Save member', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('failed submission focuses the summary and its keyboard links focus invalid fields', async ({
  page
}) => {
  const { dialog } = await openForm(page);
  const save = dialog.getByRole('button', { name: 'Save member', exact: true });
  await tabTo(page, save);
  await page.keyboard.press('Enter');
  const summary = dialog.getByRole('region', {
    name: 'Record validation errors'
  });
  await expect(summary).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    summary.getByRole('link', { name: 'Enter a name or title.' })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  const name = dialog.getByLabel('Name or title');
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-describedby', 'field-name-error');
  await page.keyboard.type('Keyboard member');
  await tabTo(page, save);
  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
});

test('date and amount errors have descriptions and focusable summary targets', async ({
  page
}) => {
  const { dialog } = await openForm(page, 'Donations', 'donation');
  await dialog.getByLabel('Date').fill('');
  const save = dialog.getByRole('button', {
    name: 'Save donation',
    exact: true
  });
  await tabTo(page, save);
  await page.keyboard.press('Enter');
  const summary = dialog.getByRole('region', {
    name: 'Record validation errors'
  });
  await expect(summary).toBeFocused();
  const date = dialog.locator('#field-date');
  const amount = dialog.locator('#field-amount');
  await expect(date).toHaveAttribute('aria-describedby', 'field-date-error');
  await expect(amount).toHaveAttribute(
    'aria-describedby',
    'field-amount-error'
  );
  await expect(dialog.locator('#field-date-error')).toHaveText(
    'Choose a valid date.'
  );
  await tabTo(
    page,
    summary.getByRole('link', { name: 'Enter an amount greater than zero.' })
  );
  await page.keyboard.press('Enter');
  await expect(amount).toBeFocused();
});

for (const example of [
  { module: 'Programs', noun: 'program', field: 'capacity' },
  { module: 'Programs', noun: 'program', field: 'participants' },
  { module: 'Events', noun: 'event', field: 'attendees' }
]) {
  test(`${example.field} count errors are associated with their inputs`, async ({
    page
  }) => {
    const { dialog } = await openForm(page, example.module, example.noun);
    const input = dialog.locator('#field-' + example.field);
    await input.fill('-1');
    await tabTo(
      page,
      dialog.getByRole('button', { name: 'Save ' + example.noun, exact: true })
    );
    await page.keyboard.press('Enter');
    await expect(
      dialog.getByRole('region', { name: 'Record validation errors' })
    ).toBeFocused();
    await expect(input).toHaveAttribute(
      'aria-describedby',
      'field-' + example.field + '-error'
    );
    await expect(
      dialog.locator('#field-' + example.field + '-error')
    ).toHaveText('Enter a whole number of zero or more.');
  });
}

test('drawer is modal and its tabs support arrows, Home, End and a single tab stop', async ({
  page
}) => {
  await ready(page);
  const trigger = page.getByRole('button', { name: /Amelia Thompson/ });
  await tabTo(page, trigger);
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', {
    name: 'Amelia Thompson',
    exact: true
  });
  await expect(
    drawer.getByRole('button', { name: 'Close record' })
  ).toBeFocused();
  await expectBackgroundInert(page);
  await page.keyboard.press('Shift+Tab');
  await expect(
    drawer.getByRole('tabpanel', { name: 'Overview' })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    drawer.getByRole('button', { name: 'Close record' })
  ).toBeFocused();
  await tabTo(page, drawer.getByRole('tab', { name: 'Overview', exact: true }));
  await page.keyboard.press('ArrowRight');
  await expect(
    drawer.getByRole('tab', { name: 'Activity', exact: true })
  ).toBeFocused();
  await expect(
    drawer.getByRole('tabpanel', { name: 'Activity' })
  ).toBeVisible();
  await expect(
    drawer.getByRole('tab', { name: 'Overview', exact: true })
  ).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('End');
  await expect(
    drawer.getByRole('tab', { name: 'Related records' })
  ).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(
    drawer.getByRole('tab', { name: 'Overview', exact: true })
  ).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(
    drawer.getByRole('tab', { name: 'Related records' })
  ).toBeFocused();
  await page.keyboard.press('Home');
  await expect(
    drawer.getByRole('tab', { name: 'Overview', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('drawer-to-edit transition restores the original record trigger when the form closes', async ({
  page
}) => {
  await ready(page);
  const trigger = page.getByRole('button', { name: /Amelia Thompson/ });
  await tabTo(page, trigger);
  await page.keyboard.press('Enter');
  await tabTo(
    page,
    page.getByRole('dialog').getByRole('button', { name: 'Edit member' })
  );
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'Edit member', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close form' })).toBeFocused();
  await expectBackgroundInert(page);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('command search opens from the keyboard and preserves focus through a record transition', async ({
  page
}) => {
  await ready(page);
  const trigger = page.getByRole('textbox', { name: 'Search members' });
  await tabTo(page, trigger);
  await page.keyboard.press('Control+k');
  const command = page.getByRole('dialog', { name: 'Find your next step' });
  const search = command.getByRole('textbox', {
    name: 'Search all accessible records'
  });
  await expect(search).toBeFocused();
  await expectBackgroundInert(page);
  await page.keyboard.press('Shift+Tab');
  await expect(
    command.getByRole('button', { name: 'Close search' })
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(
    await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'))
  ).toBe(true);
  await tabTo(page, search);
  await page.keyboard.type('Amelia');
  await page.keyboard.press('Tab');
  await expect(
    command.getByRole('button', { name: /Amelia Thompson/ })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'Amelia Thompson', exact: true })
  ).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('keyboard sorting, mixed selection, filtering and pagination update table announcements', async ({
  page
}) => {
  await ready(page);
  const table = page.getByRole('table', { name: 'Members records' });
  const results = page.getByTestId('record-results');
  await expect(results).toHaveAttribute('aria-live', 'polite');
  await expect(results).toContainText('6 members found. Showing 1–5.');
  const nameSort = table.getByRole('button', {
    name: 'Sort by name, descending'
  });
  await expect(table.locator('th[aria-sort]')).toHaveAttribute(
    'aria-sort',
    'ascending'
  );
  await tabTo(page, nameSort);
  await page.keyboard.press('Space');
  await expect(table.locator('th[aria-sort]')).toHaveAttribute(
    'aria-sort',
    'descending'
  );
  await expect(results).toContainText('Sorted by name, descending.');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(table.locator('th[aria-sort]')).toHaveCount(1);
  await expect(table.locator('th[aria-sort]')).toContainText('Status');
  const member = table.getByRole('checkbox', {
    name: 'Select Amelia Thompson',
    exact: true
  });
  await tabTo(page, member);
  await page.keyboard.press('Space');
  const all = table.getByRole('checkbox', {
    name: 'Select all visible records'
  });
  await expect(all).toHaveJSProperty('indeterminate', true);
  await expect(results).toContainText('1 selected.');
  await tabTo(page, all, true);
  await page.keyboard.press('Space');
  await expect(all).toHaveJSProperty('indeterminate', false);
  await expect(all).toBeChecked();
  await expect(results).toContainText('5 selected.');
  await page.keyboard.press('Space');
  await expect(all).not.toBeChecked();
  await expect(results).toContainText('0 selected.');
  const search = page.getByRole('textbox', { name: 'Search members' });
  await tabTo(page, search, true);
  await page.keyboard.type('Amelia');
  await expect(results).toContainText('1 members found. Showing 1–1.');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  const filter = page.getByRole('combobox', { name: 'Filter by status' });
  await tabTo(page, filter);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(results).toContainText('4 members found. Showing 1–4.');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(results).toContainText('6 members found. Showing 1–5.');
  await tabTo(page, page.getByRole('button', { name: 'Next →' }));
  await page.keyboard.press('Enter');
  await expect(results).toContainText('6 members found. Showing 6–6.');
});

test('report result changes are announced and invalid dates are described', async ({
  page
}) => {
  await ready(page, 'Reports');
  const results = page.getByTestId('report-results');
  await expect(results).toHaveAttribute('aria-live', 'polite');
  await page.getByLabel('From', { exact: true }).fill('2026-10-20');
  await page.getByLabel('To', { exact: true }).fill('2026-10-22');
  await expect(results).toHaveText('3 members records in this period.');
  await expect(
    page.getByRole('table', { name: 'Members report' })
  ).toBeVisible();
  await page.getByLabel('To', { exact: true }).fill('2026-10-19');
  await expect(page.getByLabel('To', { exact: true })).toHaveAttribute(
    'aria-describedby',
    'report-range-error'
  );
  await expect(page.getByRole('button', { name: /Export CSV/ })).toBeDisabled();
});

test('drawer backdrop dismissal restores the record trigger', async ({
  page
}) => {
  await ready(page);
  const trigger = page.getByRole('button', { name: /Amelia Thompson/ });
  await tabTo(page, trigger);
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'Amelia Thompson', exact: true })
  ).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
