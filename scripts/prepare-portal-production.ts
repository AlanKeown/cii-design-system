import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  productionBindings,
  validateAuthReadiness,
  fetchJson
} from './lib/portal-production.ts';

// The production environment supplies public values. Local/preview stay unconfigured.
// This runs in the checked-out, verified CI workspace, never in the browser.
const bindings = productionBindings(process.env);
for (const name of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD'])
  if (!process.env[name]) throw new Error(`Missing production secret ${name}.`);
const ref = process.env.SUPABASE_PROJECT_REF!;
const management = {
  Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN!}`
};
const project = (await fetchJson(
  `https://api.supabase.com/v1/projects/${ref}`,
  management
)) as Record<string, unknown>;
if (
  ref !== 'kykbgwewulzceunbbsfa' ||
  project.name !== 'cii-design-system' ||
  project.region !== 'ap-southeast-2' ||
  project.status !== 'ACTIVE_HEALTHY'
)
  throw new Error(
    `Production project must be the healthy cii-design-system project in Sydney. Expected reference "kykbgwewulzceunbbsfa", name "cii-design-system", region "ap-southeast-2", status "ACTIVE_HEALTHY"; received reference ${JSON.stringify(ref)}, name ${JSON.stringify(project.name)}, region ${JSON.stringify(project.region)}, status ${JSON.stringify(project.status)}.`
  );
const auth = (await fetchJson(
  `https://api.supabase.com/v1/projects/${ref}/config/auth`,
  management
)) as Record<string, unknown>;
validateAuthReadiness(auth, bindings.PUBLIC_AUTH_GITHUB_ENABLED === 'true');
await fetchJson(bindings.PUBLIC_SUPABASE_URL + '/auth/v1/settings', {
  apikey: bindings.PUBLIC_SUPABASE_PUBLISHABLE_KEY
});
const jwks = (await fetchJson(
  bindings.PUBLIC_SUPABASE_URL + '/auth/v1/.well-known/jwks.json',
  { apikey: bindings.PUBLIC_SUPABASE_PUBLISHABLE_KEY }
)) as { keys?: { alg?: string; kty?: string; use?: string }[] };
if (
  !jwks.keys?.some(
    (key) =>
      ['ES256', 'RS256'].includes(key.alg ?? '') &&
      (!key.use || key.use === 'sig')
  )
)
  throw new Error(
    'Production Auth must publish an asymmetric signing key before release.'
  );
const path = new URL(
  '../apps/community-portal/wrangler.jsonc',
  import.meta.url
);
const config = JSON.parse(await readFile(path, 'utf8'));
if (
  config.vars &&
  Object.keys(config.vars).some((key) => key.startsWith('PUBLIC_SUPABASE_'))
)
  throw new Error(
    'Keep Supabase settings out of top-level local Wrangler vars.'
  );
config.env = {
  ...config.env,
  production: { ...config.env?.production, vars: bindings },
  preview: { ...config.env?.preview, vars: {} }
};
const output = new URL(
  '../apps/community-portal/.wrangler/production/',
  import.meta.url
);
await mkdir(output, { recursive: true });
config.pages_build_output_dir = resolve(
  fileURLToPath(new URL('../apps/community-portal/', import.meta.url)),
  config.pages_build_output_dir
);
await writeFile(
  new URL('wrangler.jsonc', output),
  JSON.stringify(config, null, 2) + '\n'
);
console.log(
  'Production Auth, SMTP, redirects, templates, signing keys and public bindings passed preflight.'
);
