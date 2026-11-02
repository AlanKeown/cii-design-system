import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: 'list',
  use: { headless: true, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'portal',
      testDir: './apps/community-portal/tests',
      testIgnore: ['**/unit/**', '**/components/**', '**/fixtures/**'],
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
  webServer: [
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
    { command: 'npm run preview -w @cii/docs', wait: { stdout: /Local:/ } }
  ]
});
