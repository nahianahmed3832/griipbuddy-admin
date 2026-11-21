import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'production-overview-responsive.spec.ts',
  timeout: 45_000,
  reporter: 'list',
  workers: 2,
  use: {
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.GRIIP_ADMIN_TEST_CHROME },
  },
});
