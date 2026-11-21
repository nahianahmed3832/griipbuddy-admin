import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'r06-physical-stock.spec.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.GRIIP_ADMIN_TEST_CHROME },
  },
});
