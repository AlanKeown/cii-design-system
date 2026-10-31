import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: 'list',
  use: { headless: true, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'portal',
      testDir: './apps/community-portal/tests',
      testIgnore: '**/unit/**',
      use: { baseURL: 'http://127.0.0.1:4187' }
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
      command: 'npm run preview -w @cii/community-portal',
      env: { BASE_PATH: '' },
      wait: { stdout: /Local:/ }
    },
    { command: 'npm run preview -w @cii/docs', wait: { stdout: /Local:/ } }
  ]
});
