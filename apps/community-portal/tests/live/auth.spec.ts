import {
  test,
  expect,
  type Page,
  type APIRequestContext
} from '@playwright/test';
import { sendEmail, signIn } from './helpers.ts';

test('guard preserves query, APIs return JSON, unknown assets stay 404', async ({
  request
}) => {
  const response = await request.get('/?module=Members', { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe('/auth?next=%2F%3Fmodule%3DMembers');
  expect(response.headers()['cache-control']).toContain('no-store');
  const api = await request.get('/api/future');
  expect(api.status()).toBe(401);
  expect(await api.json()).toEqual({ error: 'Sign in required.' });
  expect((await request.get('/unknown-asset.png')).status()).toBe(404);
});

test('local preference works, native forms work without JS and navigation stays local', async ({
  browser
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4189/auth');
  await page.getByRole('button', { name: 'Try without an account' }).click();
  await expect(
    page.getByText('Browser-only demo · changes stay on this device.')
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Good morning/ })
  ).toBeVisible();
  const preference = (await context.cookies()).find(
    (c) => c.name === 'portal-mode'
  );
  expect(preference).toMatchObject({
    httpOnly: true,
    sameSite: 'Lax',
    secure: false
  });
  await context.close();
});

test('rejected next, invalid code, callback and provider gating recover accessibly', async ({
  page,
  request,
  context
}) => {
  await page.goto('/auth?next=%2F%2Fevil.test');
  expect(
    (await context.cookies()).find((c) => c.name === 'portal-auth-next')?.value
  ).toBe('/');
  await expect(
    page.getByRole('button', { name: 'Continue with GitHub' })
  ).toHaveCount(0);
  await page.getByLabel('Email address for code').fill('nobody@example.test');
  await page.getByLabel('Six-digit code').fill('000000');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to sign in');
  await expect(page.locator('#auth-error')).toBeFocused();
  const github = await request.post('/auth?/github', {
    form: {},
    headers: { origin: 'http://127.0.0.1:4189' }
  });
  expect(github.status()).toBe(400);
  const callback = await request.get(
    '/auth/callback?code=invalid&next=//evil.test',
    { maxRedirects: 0 }
  );
  expect(callback.headers().location).toBe('/auth?error=callback');
  const invalid = await request.post('/auth?/send', {
    form: { email: 'x'.repeat(255) },
    headers: { origin: 'http://127.0.0.1:4189' }
  });
  expect(invalid.status()).toBe(400);
});

test('email code, safe return, cookie isolation, session refresh and POST sign-out', async ({
  page,
  request,
  context
}) => {
  await context.addCookies([
    {
      name: 'portal-mode',
      value: 'local',
      url: 'http://127.0.0.1:4189',
      httpOnly: true
    }
  ]);
  const { email } = await signIn(page, request);
  await expect(page).toHaveURL(/\?module=Members$/);
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(page.getByText('Sarah Mitchell')).toHaveCount(0);
  const cookies = await context.cookies();
  const auth = cookies.filter((c) => /-auth-token(?:\.\d+)?$/.test(c.name));
  expect(auth.length).toBeGreaterThan(0);
  for (const cookie of auth)
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
      path: '/'
    });
  expect(
    cookies.some(
      (c) => c.name === 'portal-auth-next' || c.name === 'portal-mode'
    )
  ).toBe(false);
  const readable = await page.evaluate(() => ({
    cookies: document.cookie,
    local: { ...localStorage },
    session: { ...sessionStorage }
  }));
  expect(JSON.stringify(readable)).not.toMatch(
    /sb-|access_token|refresh_token/
  );
  const response = await page.goto('/');
  expect(response?.headers()['cache-control']).toContain('no-store');
  const html = await response!.text();
  expect(html).not.toMatch(/access_token|refresh_token/);
  const data = await context.request.get('/__data.json');
  expect(data.headers()['cache-control']).toContain('no-store');
  expect(await data.text()).not.toMatch(/access_token|refresh_token/);
  // Force the stored expiry into the past; the valid refresh token must rotate it.
  const combined = auth
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value)
    .join('');
  const session = JSON.parse(
    Buffer.from(combined.slice('base64-'.length), 'base64url').toString()
  );
  session.expires_at = 1;
  const baseName = auth[0].name.replace(/\.\d+$/, '');
  await context.clearCookies({ name: /^sb-/ });
  await context.addCookies([
    {
      name: baseName,
      value:
        'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
      url: 'http://127.0.0.1:4189',
      httpOnly: true,
      sameSite: 'Lax'
    }
  ]);
  const refreshed = await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Good morning/ })
  ).toBeVisible();
  expect(refreshed?.headers()['cache-control']).toContain('no-store');
  expect((await refreshed!.allHeaders())['set-cookie']).toContain('HttpOnly');
  const getSignout = await request.get('/auth/signout');
  expect(getSignout.status()).toBe(405);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: /Good morning/ })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/auth$/);
  expect(
    (await context.cookies()).filter((c) => c.name.startsWith('sb-'))
  ).toHaveLength(0);
});

test('email link GET is inert, cross-browser POST signs in, reuse fails, no JS required', async ({
  page,
  request,
  browser
}) => {
  await page.goto('/auth?next=' + encodeURIComponent('/?module=Members'));
  const { link, email } = await sendEmail(page, request);
  const preview = await request.get(link);
  expect(preview.status()).toBe(200);
  expect(preview.headers()['cache-control']).toContain('no-store');
  const context = await browser.newContext({ javaScriptEnabled: false });
  const other = await context.newPage();
  await other.goto(link);
  await expect(
    other.getByRole('heading', { name: 'Confirm your sign-in' })
  ).toBeVisible();
  await other.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(other).toHaveURL('http://127.0.0.1:4189/');
  await expect(other.getByText(`Signed in as ${email}`)).toBeVisible();
  await context.close();
  await page.goto(link);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('invalid or expired');
});

test('malformed and expired session cookies recover to sign-in', async ({
  context,
  page
}) => {
  for (const value of [
    'garbage',
    'base64-' +
      Buffer.from(
        JSON.stringify({
          access_token: 'invalid.jwt.token',
          refresh_token: 'invalid',
          expires_at: 1
        })
      ).toString('base64url')
  ]) {
    await context.addCookies([
      {
        name: 'sb-127-auth-token',
        value,
        url: 'http://127.0.0.1:4189',
        httpOnly: true
      }
    ]);
    const response = await page.goto('/');
    await expect(page).toHaveURL(/\/auth\?next=/);
    expect(response?.headers()['cache-control']).toContain('no-store');
    await context.clearCookies();
  }
});

test('client navigation remains guarded, missing links recover and cross-site POSTs fail', async ({
  page,
  request
}) => {
  await page.goto('/auth?error=callback');
  await expect(page.locator('#auth-error')).toBeFocused();
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('__data.json')),
    page.getByRole('link', { name: 'Back to workspace' }).click()
  ]);
  await expect(page).toHaveURL(/\/auth\?next=%2F$/);
  await page.goto('/auth/confirm');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('invalid or expired');
  const crossSite = await request.post('/auth?/local', {
    form: {},
    headers: { origin: 'https://untrusted.example.test' }
  });
  expect(crossSite.status()).toBe(403);
});
