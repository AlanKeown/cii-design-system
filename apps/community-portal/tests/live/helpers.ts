import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
export async function emailMessage(request: APIRequestContext, email: string) {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const result = await (
          await request.get('http://127.0.0.1:54324/api/v1/messages')
        ).json();
        id = result.messages?.find((m: { To: { Address: string }[] }) =>
          m.To.some((to) => to.Address === email)
        )?.ID;
        return !!id;
      },
      { timeout: 15_000 }
    )
    .toBe(true);
  const message = await (
    await request.get(`http://127.0.0.1:54324/api/v1/message/${id}`)
  ).json();
  const html: string = message.HTML;
  const code = html.match(/<strong>(\d{6})<\/strong>/)?.[1];
  const link = html.match(/href="([^"]+)"/)?.[1].replaceAll('&amp;', '&');
  expect(code).toBeTruthy();
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:4189\/auth\/confirm\?/);
  return { code: code!, link: link! };
}
export async function sendEmail(
  page: Page,
  request: APIRequestContext,
  targetEmail?: string
) {
  const email = targetEmail ?? `portal-${randomUUID()}@example.test`;
  await page
    .getByRole('textbox', { name: 'Email address', exact: true })
    .fill(email);
  await page.getByRole('button', { name: 'Send sign-in email' }).click();
  await expect(
    page.getByText('Check your email for a six-digit code or a sign-in link.')
  ).toBeVisible();
  return { email, ...(await emailMessage(request, email)) };
}
export async function signIn(
  page: Page,
  request: APIRequestContext,
  email?: string,
  next = '/?module=Members'
) {
  await page.goto('/auth?next=' + encodeURIComponent(next));
  const message = await sendEmail(page, request, email);
  await page.getByLabel('Email address for code').fill(message.email);
  await page.getByLabel('Six-digit code').fill(message.code);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByText('Signed in as ' + message.email)).toBeVisible();
  return message;
}
