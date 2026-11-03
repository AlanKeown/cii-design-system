import { recordHeartbeat } from './lib/supabase-heartbeat.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  productionBindings,
  productionSupabase,
  validateAuthReadiness,
  portalOrigin,
  productionSiteKey
} from './lib/portal-production.ts';
import { readFileSync } from 'node:fs';

const env = {
  SUPABASE_PROJECT_REF: 'kykbgwewulzceunbbsfa',
  PUBLIC_SUPABASE_URL: 'https://kykbgwewulzceunbbsfa.supabase.co',
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fictional1234567890',
  PUBLIC_TURNSTILE_SITE_KEY: productionSiteKey,
  SUPABASE_ACCESS_TOKEN: 'must-not-be-exported',
  SUPABASE_DB_PASSWORD: 'must-not-be-exported'
};
function authConfig(): Record<string, unknown> {
  return {
    ...JSON.parse(
      readFileSync(
        new URL('../supabase/production-auth.json', import.meta.url),
        'utf8'
      )
    ),
    mailer_templates_confirmation_content: readFileSync(
      new URL('../supabase/templates/confirmation.html', import.meta.url),
      'utf8'
    ),
    mailer_templates_magic_link_content: readFileSync(
      new URL('../supabase/templates/magic-link.html', import.meta.url),
      'utf8'
    )
  };
}
test('only validated public values enter the production Worker', () => {
  const bindings = productionBindings(env);
  assert.deepEqual(Object.keys(bindings).sort(), [
    'PUBLIC_AUTH_GITHUB_ENABLED',
    'PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'PUBLIC_SUPABASE_URL',
    'PUBLIC_TURNSTILE_SITE_KEY'
  ]);
  assert.equal(bindings.PUBLIC_AUTH_GITHUB_ENABLED, 'false');
  assert.ok(!JSON.stringify(bindings).includes('must-not-be-exported'));
  assert.equal(
    productionSupabase(env).PUBLIC_SUPABASE_URL,
    env.PUBLIC_SUPABASE_URL
  );
});
test('partial configuration, wrong projects, secret keys and captcha test keys cannot deploy', () => {
  for (const change of [
    { SUPABASE_PROJECT_REF: '' },
    { PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' },
    { PUBLIC_SUPABASE_URL: 'https://different.supabase.co' },
    { PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' },
    { PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do-not-copy-me' },
    { PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJ.service-role.jwt' },
    { PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' },
    { PUBLIC_AUTH_GITHUB_ENABLED: 'yes' }
  ])
    assert.throws(() => productionBindings({ ...env, ...change }));
});
test('release requires production captcha, redirects, OTP, SMTP and versioned templates', () => {
  assert.doesNotThrow(() => validateAuthReadiness(authConfig(), false));
  for (const change of [
    { security_captcha_enabled: false },
    { site_url: 'http://localhost:5187' },
    { mailer_autoconfirm: true },
    { mailer_otp_exp: 3600 },
    { mailer_otp_length: 8 },
    { uri_allow_list: portalOrigin + '/auth/callback' },
    { smtp_host: 'localhost' },
    { smtp_max_frequency: 1 },
    { smtp_max_frequency: undefined },
    { rate_limit_email_sent: undefined },
    { rate_limit_email_sent: 1000 },
    { mailer_templates_magic_link_content: '{{ .ConfirmationURL }}' },
    { mailer_templates_confirmation_content: '' }
  ])
    assert.throws(() =>
      validateAuthReadiness({ ...authConfig(), ...change }, false)
    );
});
test('GitHub capability must match the provider and callback allowlist', () => {
  assert.throws(() => validateAuthReadiness(authConfig(), true));
  assert.doesNotThrow(() =>
    validateAuthReadiness(
      { ...authConfig(), external_github_enabled: true },
      true
    )
  );
  assert.throws(() =>
    validateAuthReadiness(
      {
        ...authConfig(),
        external_github_enabled: true,
        uri_allow_list: portalOrigin + '/auth/confirm'
      },
      true
    )
  );
});

test('heartbeat retries temporary failures and returns the RPC write timestamp', async () => {
  let calls = 0;
  const waits: number[] = [];
  const timestamp = await recordHeartbeat(
    env.PUBLIC_SUPABASE_URL,
    env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    async (_url, init) => {
      calls++;
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, '{}');
      return calls === 1
        ? new Response('', { status: 503 })
        : Response.json('2026-11-03T07:00:00Z');
    },
    async (milliseconds) => {
      waits.push(milliseconds);
    }
  );
  assert.equal(timestamp, '2026-11-03T07:00:00Z');
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2000]);
});
test('heartbeat refuses permanent errors and malformed results without leaking credentials', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      recordHeartbeat(
        env.PUBLIC_SUPABASE_URL,
        env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        async () => {
          calls++;
          return new Response('Private error detail', { status: 403 });
        }
      ),
    /HTTP 403/
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      recordHeartbeat(
        env.PUBLIC_SUPABASE_URL,
        env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        async () => Response.json({ secret: 'Never log this' })
      ),
    /valid heartbeat timestamp/
  );
});
