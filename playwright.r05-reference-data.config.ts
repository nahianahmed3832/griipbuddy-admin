import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'r05-reference-data.spec.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    actionTimeout: 15_000,
    launchOptions: { executablePath: process.env.GRIIP_ADMIN_TEST_CHROME },
  },
});
