export const productionSiteKey = '0x4AAAAAAFxoxhMwZgmLhc4U';
export const portalOrigin = 'https://cii-community-portal.pages.dev';
export type ProductionBindings = {
  PUBLIC_SUPABASE_URL: string;
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  PUBLIC_TURNSTILE_SITE_KEY: string;
  PUBLIC_AUTH_GITHUB_ENABLED: string;
};

/** Select public bindings explicitly: never copy process.env into a Worker config. */
export function productionSupabase(env: Record<string, string | undefined>) {
  const ref = env.SUPABASE_PROJECT_REF ?? '';
  if (!/^[a-z0-9]{20}$/.test(ref))
    throw new Error(
      'Set SUPABASE_PROJECT_REF to the production project reference.'
    );
  const url = env.PUBLIC_SUPABASE_URL ?? '';
  if (url !== `https://${ref}.supabase.co`)
    throw new Error(
      'PUBLIC_SUPABASE_URL must match the production project reference over HTTPS.'
    );
  const key = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key))
    throw new Error(
      'Set PUBLIC_SUPABASE_PUBLISHABLE_KEY to a publishable key, never a secret or service-role key.'
    );
  return { PUBLIC_SUPABASE_URL: url, PUBLIC_SUPABASE_PUBLISHABLE_KEY: key };
}

export function productionBindings(
  env: Record<string, string | undefined>
): ProductionBindings {
  const supabase = productionSupabase(env);
  const siteKey = env.PUBLIC_TURNSTILE_SITE_KEY ?? '';
  if (siteKey !== productionSiteKey)
    throw new Error(
      'PUBLIC_TURNSTILE_SITE_KEY must match the versioned managed production widget; secret and test keys are not allowed.'
    );
  const github = env.PUBLIC_AUTH_GITHUB_ENABLED ?? 'false';
  if (github !== 'false' && github !== 'true')
    throw new Error('PUBLIC_AUTH_GITHUB_ENABLED must be true or false.');
  return {
    ...supabase,
    PUBLIC_TURNSTILE_SITE_KEY: siteKey,
    PUBLIC_AUTH_GITHUB_ENABLED: github
  };
}

/** Throw names/settings only. Auth config can contain SMTP and provider secrets. */
export function validateAuthReadiness(
  config: Record<string, unknown>,
  github: boolean
): void {
  const required: Record<string, unknown> = {
    site_url: portalOrigin,
    external_email_enabled: true,
    mailer_autoconfirm: false,
    mailer_otp_exp: 600,
    mailer_otp_length: 6,
    security_captcha_enabled: true,
    security_captcha_provider: 'turnstile',
    refresh_token_rotation_enabled: true,
    smtp_host: 'smtp.resend.com',
    smtp_user: 'resend',
    smtp_admin_email: 'no-reply@auth.alankeown.id.au'
  };
  for (const [key, expected] of Object.entries(required))
    if (config[key] !== expected)
      throw new Error(`Production Auth setting ${key} is not ready.`);
  if (![465, 587].includes(Number(config.smtp_port)))
    throw new Error('Production SMTP port is not ready.');
  if (
    !Number.isFinite(Number(config.rate_limit_email_sent)) ||
    Number(config.rate_limit_email_sent) < 1 ||
    Number(config.rate_limit_email_sent) > 30
  )
    throw new Error(
      'Production email rate limit must be between 1 and 30 per hour.'
    );
  if (
    !Number.isFinite(Number(config.smtp_max_frequency)) ||
    Number(config.smtp_max_frequency) < 60
  )
    throw new Error('Production email resend gap must be at least 60 seconds.');
  const redirects = String(config.uri_allow_list ?? '')
    .split(',')
    .map((value) => value.trim());
  if (
    !redirects.includes(portalOrigin + '/auth/confirm') ||
    (github && !redirects.includes(portalOrigin + '/auth/callback'))
  )
    throw new Error('Production Auth redirect allowlist is incomplete.');
  for (const name of ['confirmation', 'magic_link']) {
    const content = String(config[`mailer_templates_${name}_content`] ?? '');
    if (
      !content.includes('{{ .Token }}') ||
      !content.includes('{{ .TokenHash }}') ||
      !content.includes('{{ .RedirectTo }}') ||
      !content.includes('type=email')
    )
      throw new Error(
        `Production ${name} email template must use the versioned OTP and confirmation link.`
      );
  }
  if (github && config.external_github_enabled !== true)
    throw new Error(
      'GitHub is enabled in the portal but not in Supabase Auth.'
    );
}

export async function fetchJson(
  url: string,
  headers: Record<string, string> = {}
): Promise<unknown> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok)
    throw new Error(
      `Release preflight request failed (HTTP ${response.status}). Check project access and configuration.`
    );
  return response.json();
}
