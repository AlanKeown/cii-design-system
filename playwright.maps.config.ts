import { defineConfig } from '@playwright/test';

/** Isolated mapping suite: version probes do not start unrelated application servers. */
export default defineConfig({
  reporter: 'list',
  outputDir: 'test-results/maps',
  testDir: './packages/maps/tests/browser',
  use: {
    headless: true,
    trace: 'retain-on-failure',
    baseURL: 'http://127.0.0.1:4185'
  },
  webServer: {
    command: 'npm run test:browser:serve -w @cii/maps',
    wait: { stdout: /Local:/ }
  }
});
