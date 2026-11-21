import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'production-overview-responsive.spec.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  workers: 2,
  use: {
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.GRIIP_ADMIN_TEST_CHROME },
  },
});
