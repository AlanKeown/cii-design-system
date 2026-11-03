import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/backend/database.types.ts';
import {
  authFailure,
  requestSignInEmail
} from '../../src/lib/server/auth-email.ts';
import { sessionCookiePolicy } from '../../src/lib/server/cookie-policy.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from '../../src/lib/server/redirect.ts';
import { resolveAuthConfig } from '../../src/lib/server/auth-config.ts';
import { captchaOptions } from '../../src/lib/server/auth-input.ts';

test('return paths preserve paths and queries and reject ambiguous destinations', () => {
  for (const path of ['/', '/?module=Members', '/path?q=one%20two', '/auth'])
    assert.equal(safeNext(path), path);
  for (const path of [
    null,
    '',
    '//evil.test',
    '/\\evil.test',
    'https://evil.test',
    '/%5cevil',
    '/%2fhost',
    '/%252fhost',
    '/%0afoo',
    '/#hash',
    '/bad%',
    '/\u007f',
    ' /'
  ])
    assert.equal(safeNext(path), '/');
});
test('empty config is local, partial or invalid config fails clearly', () => {
  assert.equal(resolveAuthConfig(), null);
  assert.throws(() => resolveAuthConfig('https://example.test'), /both/);
  assert.throws(() => resolveAuthConfig('', 'key'), /both/);
  assert.throws(() => resolveAuthConfig('file:///tmp/test', 'key'), /Invalid/);
  assert.deepEqual(resolveAuthConfig('http://127.0.0.1:54321', 'public'), {
    url: 'http://127.0.0.1:54321',
    key: 'public'
  });
});
test('Turnstile token handoff is bounded and enabled explicitly', () => {
  const form = new FormData();
  form.set('cf-turnstile-response', 'test-token');
  assert.deepEqual(captchaOptions(form, true), { captchaToken: 'test-token' });
  assert.deepEqual(captchaOptions(form, false), {});
  form.set('cf-turnstile-response', 'x'.repeat(2049));
  assert.deepEqual(captchaOptions(form, true), { captchaToken: '' });
});

test('session cookie policy requires secure transport except on loopback development', () => {
  assert.deepEqual(
    sessionCookiePolicy(new URL('https://portal.example.test')),
    { path: '/', httpOnly: true, sameSite: 'lax', secure: true }
  );
  assert.equal(
    sessionCookiePolicy(new URL('http://127.0.0.1:4189')).secure,
    false
  );
  assert.throws(
    () => sessionCookiePolicy(new URL('http://portal.example.test')),
    /HTTPS/
  );
});

test('email requests hand off captcha and return the same recovery message for provider and rate-limit errors', async () => {
  for (const status of [400, 429]) {
    let requestBody: Record<string, unknown> = {};
    let requestUrl = '';
    const client = createClient<Database>(
      'http://127.0.0.1:54321',
      'public-test-key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        },
        global: {
          fetch: async (_url, init) => {
            requestBody = JSON.parse(String(init?.body));
            requestUrl = String(_url);
            return Response.json(
              {
                msg: 'Private provider detail',
                code:
                  status === 429
                    ? 'over_email_send_rate_limit'
                    : 'validation_failed'
              },
              { status }
            );
          }
        }
      }
    );
    assert.deepEqual(
      await requestSignInEmail(
        client,
        'fictional@example.test',
        'http://127.0.0.1:4189/auth/confirm',
        { captchaToken: 'test-challenge' }
      ),
      { error: authFailure }
    );
    assert.equal(requestBody.email, 'fictional@example.test');
    assert.equal(requestBody.create_user, true);
    assert.deepEqual(requestBody.gotrue_meta_security, {
      captcha_token: 'test-challenge'
    });
    assert.equal(
      new URL(requestUrl).searchParams.get('redirect_to'),
      'http://127.0.0.1:4189/auth/confirm'
    );
  }
});
