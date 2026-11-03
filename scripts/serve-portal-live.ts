import { spawnSync } from 'node:child_process';
const bindings = {
  PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL ?? '',
  PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  PUBLIC_AUTH_GITHUB_ENABLED: 'false',
  PUBLIC_TURNSTILE_SITE_KEY: ''
};
if (!bindings.PUBLIC_SUPABASE_URL || !bindings.PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  throw new Error(
    'Run npm run test:portal-live to supply local Supabase public configuration.'
  );
const result = spawnSync(
  'npx',
  [
    '-w',
    '@cii/community-portal',
    'wrangler',
    'pages',
    'dev',
    '.svelte-kit/cloudflare',
    '--port',
    '4189',
    '--ip',
    '127.0.0.1',
    ...Object.entries(bindings).flatMap(([name, value]) => [
      '--binding',
      `${name}=${value}`
    ])
  ],
  { stdio: 'inherit' }
);
process.exitCode = result.status ?? 1;
