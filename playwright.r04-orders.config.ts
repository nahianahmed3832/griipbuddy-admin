import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'r04-order-usability.spec.ts',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE && {
      launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
    }),
  },
});
