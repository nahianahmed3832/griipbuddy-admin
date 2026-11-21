import { defineConfig } from '@playwright/test';

const remoteFixture = process.env.GRIIP_ADMIN_STAFF_TEST_ORIGIN;
const localOrigin = 'http://127.0.0.1:4327';

export default defineConfig({
  testDir: './tests',
  testMatch: 'staff-access.spec.ts',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE && {
      launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
    }),
  },
  ...(remoteFixture ? {} : {
    webServer: {
      command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 4327',
      url: localOrigin + '/sign-in',
      timeout: 90_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_GRIIP_ADMIN_PREFIX: '',
        NEXT_TELEMETRY_DISABLED: '1',
        GRIIP_ADMIN_TARGET: 'fixture',
        GRIIP_ADMIN_FIXTURE_WRITES: '1',
        GRIIP_ADMIN_FIXTURE_PORT: process.env.GRIIP_ADMIN_FIXTURE_PORT ?? '38180',
        GRIIP_ADMIN_PUBLIC_ORIGIN: '',
      },
    },
  }),
});
