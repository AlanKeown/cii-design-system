import { portalOrigin } from './lib/portal-production.ts';
// Read-only post-deploy checks. Real Turnstile and signed-in flows require the
// separate two-account smoke described in the Phase 5 runbook.
async function verify() {
  const options = {
    redirect: 'manual' as const,
    signal: AbortSignal.timeout(15_000)
  };
  const root = await fetch(portalOrigin + '/', options);
  if (
    root.status !== 303 ||
    !root.headers.get('location')?.startsWith('/auth?next=')
  )
    throw new Error(
      'Production root must redirect signed-out visitors to auth.'
    );
  if (!root.headers.get('cache-control')?.includes('no-store'))
    throw new Error('Production auth redirects must not be cached.');
  const api = await fetch(portalOrigin + '/api/reports/Members', options);
  if (
    api.status !== 401 ||
    !api.headers.get('content-type')?.includes('application/json') ||
    !api.headers.get('cache-control')?.includes('no-store')
  )
    throw new Error(
      'Production API must return a non-cacheable JSON 401 without a session.'
    );
  const auth = await fetch(portalOrigin + '/auth', options);
  const html = await auth.text();
  if (
    auth.status !== 200 ||
    !html.includes('Send sign-in email') ||
    !html.includes('challenges.cloudflare.com/turnstile') ||
    !auth.headers.get('cache-control')?.includes('no-store')
  )
    throw new Error('Production sign-in and Turnstile are not ready.');
  if (/access_token|refresh_token/.test(html))
    throw new Error('Production HTML exposed auth token fields.');
  const privacy = await fetch(portalOrigin + '/privacy', options);
  if (
    privacy.status !== 200 ||
    !(await privacy.text()).includes('Privacy and demo data')
  )
    throw new Error('Production privacy notice is unavailable.');
  const missing = await fetch(
    portalOrigin + '/release-smoke-missing-asset.png',
    options
  );
  if (missing.status !== 404)
    throw new Error('Missing assets must remain 404.');
}
for (let attempt = 0; ; attempt++) {
  try {
    await verify();
    break;
  } catch (error) {
    if (attempt === 3) throw error;
    // Allow the production alias to settle without changing or bypassing guards.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
console.log(
  'Production signed-out auth, API, cache, token isolation, privacy and asset checks passed.'
);
