import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'r05-catalog-exchange.spec.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.GRIIP_ADMIN_TEST_CHROME },
  },
});
