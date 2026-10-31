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
      use: { baseURL: 'http://127.0.0.1:4188' }
    }
  ],
  webServer: [
    {
      command: 'npm run preview -w @cii/community-portal',
      wait: { stdout: /Local:/ }
    },
    { command: 'npm run preview -w @cii/docs', wait: { stdout: /Local:/ } }
  ]
});
