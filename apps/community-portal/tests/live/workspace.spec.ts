import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signIn } from './helpers.ts';
import { emptyForm } from '../../src/lib/records.ts';
import { permissions } from '../../src/lib/data.ts';
import type { PortalRecord } from '../../src/lib/model.ts';

async function api(
  page: Page,
  path: string,
  method = 'POST',
  data: unknown = {}
) {
  return page.context().request.fetch('/api/' + path, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:4189'
    },
    ...(method === 'GET' ? {} : { data })
  });
}
function sessionToken(cookies: { name: string; value: string }[]) {
  const value = cookies
    .filter((c) => /-auth-token(?:\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value)
    .join('');
  return JSON.parse(
    Buffer.from(value.slice('base64-'.length), 'base64url').toString()
  ).access_token as string;
}

test('workspace seeds once, mutations persist, stale updates conflict, views and reset work', async ({
  page,
  request
}) => {
  await signIn(page, request);
  await expect(
    page.getByRole('heading', { name: 'Members', exact: true })
  ).toBeVisible();
  await expect(page.getByText('changes saved to your account')).toBeVisible();
  const form = {
    ...emptyForm('Members', '2026-11-03'),
    name: 'Phase Four Member',
    email: 'fictional@example.test'
  };
  const createdResponse = await api(page, 'records/Members', 'POST', { form });
  expect(createdResponse.status()).toBe(200);
  const created: PortalRecord = await createdResponse.json();
  expect(created.id).toMatch(/^M-\d+$/);
  expect(created.updatedAt).toBeTruthy();
  const edited = await api(page, `records/Members/${created.id}`, 'PATCH', {
    record: { ...created, name: 'Phase Four Edited' },
    expectedUpdatedAt: created.updatedAt
  });
  expect(edited.status()).toBe(200);
  const stale = await api(page, `records/Members/${created.id}`, 'PATCH', {
    record: created,
    expectedUpdatedAt: created.updatedAt
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe('conflict');
  const invalid = await api(page, 'records/Members', 'POST', {
    form: { ...form, name: '' }
  });
  expect(invalid.status()).toBe(400);
  const nonJson = await page.context().request.post('/api/records/Members', {
    data: 'name=bad',
    headers: { 'content-type': 'text/plain', origin: 'http://127.0.0.1:4189' }
  });
  expect(nonJson.status()).toBe(415);
  await page.reload();
  await page
    .getByRole('textbox', { name: 'Search members' })
    .fill('Phase Four Edited');
  await expect(
    page.getByRole('button', { name: /Phase Four Edited/ })
  ).toBeVisible();
  expect(
    (
      await api(page, 'views', 'POST', {
        name: 'Phase Four View',
        module: 'Members',
        query: 'Phase Four',
        status: 'All statuses',
        sort: 'name'
      })
    ).status()
  ).toBe(200);
  const archived = await api(page, 'records/Members/archive', 'POST', {
    ids: [created.id]
  });
  expect((await archived.json())[0].status).toBe('Archived');
  await page.reload();
  await page.getByText('View options', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: /Phase Four View/ })
  ).toBeVisible();
  expect((await api(page, 'workspace/reset')).status()).toBe(200);
  await page.reload();
  await page
    .getByRole('textbox', { name: 'Search members' })
    .fill('Phase Four Edited');
  await expect(
    page.getByRole('button', { name: /Phase Four Edited/ })
  ).toHaveCount(0);
});

test('owner role changes enforce server permissions and Board reports contain no identifying fields', async ({
  page,
  request,
  context
}) => {
  await signIn(page, request);
  // Read the canonical matrix through the authenticated Data API using only this user's token.
  const token = sessionToken(await context.cookies());
  const matrixResponse = await request.get(
    process.env.PUBLIC_SUPABASE_URL + '/rest/v1/role_permissions?select=*',
    {
      headers: {
        apikey: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        authorization: 'Bearer ' + token
      }
    }
  );
  expect(matrixResponse.status()).toBe(200);
  const matrix: { role: keyof typeof permissions; module: string }[] =
    await matrixResponse.json();
  for (const [role, modules] of Object.entries(permissions))
    expect(
      matrix
        .filter((row) => row.role === role)
        .map((row) => row.module)
        .sort()
    ).toEqual([...modules].sort());
  await page.getByLabel('Preview role').selectOption('Board Member');
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Members' })
  ).toHaveCount(0);
  await expect(page.getByLabel('Preview role')).toHaveValue('Board Member');
  const forbidden = await api(page, 'records/Members', 'POST', {
    form: { ...emptyForm('Members', '2026-11-03'), name: 'Not allowed' }
  });
  expect(forbidden.status()).toBe(403);
  const direct = await request.post(
    process.env.PUBLIC_SUPABASE_URL + '/rest/v1/members',
    {
      headers: {
        apikey: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        authorization: 'Bearer ' + token,
        'content-type': 'application/json'
      },
      data: {
        id: 'M-denied',
        org_id: (await context.cookies()).find((c) => c.name === 'portal-org')!
          .value,
        name: 'Not allowed',
        status: 'Active',
        date: '2026-11-03'
      }
    }
  );
  expect(direct.status()).toBe(403);
  const report = await api(
    page,
    'reports/Members?from=2020-01-01&to=2030-01-01',
    'GET'
  );
  expect(report.status()).toBe(200);
  const rows = await report.json();
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows)
    for (const key of [
      'name',
      'email',
      'phone',
      'tags',
      'notes',
      'program_id',
      'member_id',
      'updated_by'
    ])
      expect(row).not.toHaveProperty(key);
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Reports' })
    .click();
  await page.getByLabel('From', { exact: true }).fill('2020-01-01');
  await expect(page.getByText('De-identified record').first()).toBeVisible();
  await page.getByLabel('Preview role').selectOption('Admin');
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Administration' })
  ).toBeVisible();
});

test('invitation is inert on GET, accepts only its recipient, supports team management and organisation switching', async ({
  page,
  request,
  browser
}) => {
  await signIn(page, request);
  const ownerOrg = (await page.context().cookies()).find(
    (c) => c.name === 'portal-org'
  )!.value;
  const email = `invited-${randomUUID()}@example.test`;
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Administration' })
    .click();
  await page
    .getByRole('textbox', { name: 'Invitation email', exact: true })
    .fill(email);
  const invitationResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/invitations')
  );
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  expect((await invitationResponse).status()).toBe(200);
  const linkField = page.getByRole('textbox', {
    name: 'Invitation link',
    exact: true
  });
  await expect(linkField).toBeVisible();
  const link = await linkField.inputValue();
  const wrong = await browser.newContext();
  const wrongPage = await wrong.newPage();
  await signIn(wrongPage, request, undefined, new URL(link).pathname);
  await wrongPage.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(wrongPage.getByRole('alert')).toContainText(
    'intended for a different email'
  );
  await expect(wrongPage.locator('#invite-error')).toBeFocused();
  const wrongToken = sessionToken(await wrong.cookies());
  const isolated = await request.get(
    process.env.PUBLIC_SUPABASE_URL + '/rest/v1/members?org_id=eq.' + ownerOrg,
    {
      headers: {
        apikey: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        authorization: 'Bearer ' + wrongToken
      }
    }
  );
  expect(await isolated.json()).toEqual([]);
  const simultaneous = await Promise.all([
    wrong.request.get('/'),
    wrong.request.get('/')
  ]);
  expect(simultaneous.map((response) => response.status())).toEqual([200, 200]);
  const memberships = await request.get(
    process.env.PUBLIC_SUPABASE_URL + '/rest/v1/memberships?select=org_id',
    {
      headers: {
        apikey: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        authorization: 'Bearer ' + wrongToken
      }
    }
  );
  expect((await memberships.json()).length).toBe(1);
  await wrong.close();
  const invited = await browser.newContext();
  const invitedPage = await invited.newPage();
  await signIn(invitedPage, request, email, '/'); // Creates a separate owned workspace first, so switch can be tested.
  const ownOrg = (await invited.cookies()).find(
    (c) => c.name === 'portal-org'
  )!.value;
  await invitedPage.goto(link);
  expect(
    (await invited.cookies()).find((c) => c.name === 'portal-org')!.value
  ).toBe(ownOrg);
  await invitedPage.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(
    invitedPage.getByRole('heading', { name: /Good morning/ })
  ).toBeVisible();
  expect(
    (await invited.cookies()).find((c) => c.name === 'portal-org')!.value
  ).toBe(ownerOrg);
  await expect(invitedPage.getByLabel('Preview role')).toHaveCount(0);
  await expect(
    invitedPage
      .getByRole('navigation')
      .getByRole('link', { name: 'Administration' })
  ).toHaveCount(0);
  expect((await api(invitedPage, 'workspace/reset')).status()).toBe(403);
  await invitedPage
    .getByRole('combobox', { name: 'Organisation', exact: true })
    .selectOption(ownOrg);
  await expect(invitedPage.getByLabel('Preview role')).toBeVisible();
  await invitedPage
    .getByRole('combobox', { name: 'Organisation', exact: true })
    .selectOption(ownerOrg);
  await expect(invitedPage.getByLabel('Preview role')).toHaveCount(0);
  const token = sessionToken(await invited.cookies());
  const userId = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString()
  ).sub;
  expect(
    (
      await api(page, 'members/' + userId, 'PATCH', { role: 'Board Member' })
    ).status()
  ).toBe(200);
  await invitedPage.reload();
  await expect(
    invitedPage.getByRole('navigation').getByRole('link', { name: 'Members' })
  ).toHaveCount(0);
  expect(
    (
      await api(page, 'members/' + userId, 'PATCH', { deactivate: true })
    ).status()
  ).toBe(200);
  expect((await api(invitedPage, 'reports/Members', 'GET')).status()).toBe(403);
  await invited.close();
});

test('browser CRUD saves to account without drafts or local record storage; deletion clears the account', async ({
  page,
  request,
  context
}) => {
  await signIn(page, request);
  await page.getByRole('button', { name: /Add member$/ }).click();
  await expect(
    page.getByRole('button', { name: 'Save draft', exact: true })
  ).toHaveCount(0);
  await page
    .getByRole('dialog')
    .getByLabel('Name or title')
    .fill('Browser Account Member');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Save member', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page
    .getByRole('textbox', { name: 'Search members' })
    .fill('Browser Account Member');
  await expect(
    page.getByRole('button', { name: /Browser Account Member/ })
  ).toBeVisible();
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage }))
  ).not.toContain('Browser Account Member');
  await expect(
    page.getByRole('button', { name: 'Delete my account' })
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/auth$/);
  expect(
    (await context.cookies()).some(
      (c) => c.name.startsWith('sb-') || c.name === 'portal-org'
    )
  ).toBe(false);
  expect((await api(page, 'reports/Members', 'GET')).status()).toBe(401);
});
