import { readFile } from 'node:fs/promises';
import {
  productionBindings,
  fetchJson,
  validateAuthReadiness,
  productionSiteKey
} from './lib/portal-production.ts';

// One-time operator command. Provider secrets go directly to Supabase Auth,
// never to Wrangler bindings, GitHub variables, a generated file or stdout.
const bindings = productionBindings(process.env);
const token = process.env.SUPABASE_ACCESS_TOKEN;
const captchaSecret = process.env.TURNSTILE_SECRET_KEY;
if (!token)
  throw new Error(
    'Set SUPABASE_ACCESS_TOKEN for the production project owner.'
  );
if (
  !captchaSecret ||
  captchaSecret.length < 16 ||
  captchaSecret === productionSiteKey
)
  throw new Error(
    'Supply the widget secret in TURNSTILE_SECRET_KEY, not its public site key.'
  );
const ref = process.env.SUPABASE_PROJECT_REF!;
const headers = {
  Authorization: `Bearer ${token}`,
  'content-type': 'application/json'
};
const project = (await fetchJson(
  `https://api.supabase.com/v1/projects/${ref}`,
  headers
)) as Record<string, unknown>;
if (
  project.name !== 'cii-community-portal' ||
  project.region !== 'ap-southeast-2'
)
  throw new Error('Refusing to configure a different project or region.');
const endpoint = `https://api.supabase.com/v1/projects/${ref}/auth/config`;
const current = (await fetchJson(endpoint, headers)) as Record<string, unknown>;
if (!process.env.RESEND_SMTP_KEY && !current.smtp_pass)
  throw new Error(
    'Configure the Resend SMTP password in Supabase first, or supply RESEND_SMTP_KEY for this operator command.'
  );
const desired = JSON.parse(
  await readFile(
    new URL('../supabase/production-auth.json', import.meta.url),
    'utf8'
  )
);
const patch = {
  ...desired,
  security_captcha_secret: captchaSecret,
  ...(process.env.RESEND_SMTP_KEY
    ? { smtp_pass: process.env.RESEND_SMTP_KEY }
    : {}),
  mailer_subjects_magic_link: 'Your Common Ground sign-in code',
  mailer_subjects_confirmation: 'Confirm your Common Ground sign-in',
  mailer_templates_magic_link_content: await readFile(
    new URL('../supabase/templates/magic-link.html', import.meta.url),
    'utf8'
  ),
  mailer_templates_confirmation_content: await readFile(
    new URL('../supabase/templates/confirmation.html', import.meta.url),
    'utf8'
  )
};
validateAuthReadiness(
  { ...current, ...patch },
  bindings.PUBLIC_AUTH_GITHUB_ENABLED === 'true'
);
const response = await fetch(endpoint, {
  method: 'PATCH',
  headers,
  body: JSON.stringify(patch),
  signal: AbortSignal.timeout(30_000)
});
await response.body?.cancel();
if (!response.ok)
  throw new Error(`Production Auth update failed (HTTP ${response.status}).`);
const saved = (await fetchJson(endpoint, headers)) as Record<string, unknown>;
validateAuthReadiness(saved, bindings.PUBLIC_AUTH_GITHUB_ENABLED === 'true');
console.log(
  'Production Auth settings and versioned email templates updated. Provider secret values were not logged.'
);
