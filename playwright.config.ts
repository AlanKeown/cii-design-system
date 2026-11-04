import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: 'list',
  outputDir:
    process.env.PORTAL_LIVE === '1'
      ? 'test-results/live'
      : 'test-results/local',
  use: { headless: true, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'maps',
      testDir: './packages/maps/tests/browser',
      use: { baseURL: 'http://127.0.0.1:4185' }
    },
    {
      name: 'portal-live',
      testDir: './apps/community-portal/tests/live',
      workers: 1,
      use: { baseURL: 'http://127.0.0.1:4189' }
    },
    {
      name: 'portal',
      testDir: './apps/community-portal/tests',
      testIgnore: [
        '**/unit/**',
        '**/components/**',
        '**/fixtures/**',
        '**/live/**'
      ],
      use: { baseURL: 'http://127.0.0.1:4187' }
    },
    {
      name: 'portal-components',
      testDir: './apps/community-portal/tests/components',
      use: { baseURL: 'http://127.0.0.1:4186' }
    },
    {
      name: 'docs',
      testDir: './apps/docs/tests',
      // Trailing slash so relative page.goto() paths resolve under BASE_PATH.
      use: { baseURL: `http://127.0.0.1:4188${process.env.BASE_PATH ?? ''}/` }
    }
  ],
  webServer:
    process.env.PORTAL_LIVE === '1'
      ? [
          {
            command:
              'node --experimental-strip-types scripts/serve-portal-live.ts',
            env: {
              PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL ?? '',
              PUBLIC_SUPABASE_PUBLISHABLE_KEY:
                process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
              PUBLIC_AUTH_GITHUB_ENABLED: 'false',
              PUBLIC_TURNSTILE_SITE_KEY: '',
              CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
              WRANGLER_SEND_METRICS: 'false'
            },
            wait: { stdout: /Ready on/ }
          }
        ]
      : [
          {
            command: 'npm run test:browser:serve -w @cii/maps',
            wait: { stdout: /Local:/ }
          },
          {
            command: 'npm run test:components:serve -w @cii/community-portal',
            wait: { stdout: /Local:/ }
          },
          {
            command: 'npm run preview -w @cii/community-portal',
            env: {
              BASE_PATH: '',
              CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
              WRANGLER_SEND_METRICS: 'false'
            },
            wait: { stdout: /Ready on/ }
          },
          {
            command: 'npm run preview -w @cii/docs',
            wait: { stdout: /Local:/ }
          }
        ]
});
