import { defineConfig } from '@playwright/test';

const remoteFixture = process.env.GRIIP_ADMIN_STAFF_TEST_ORIGIN;
const localOrigin = 'http://127.0.0.1:4327';
const localPrefix = process.env.NEXT_PUBLIC_GRIIP_ADMIN_PREFIX === '/admin' ? '/admin' : '';
if (!remoteFixture) process.env.GRIIP_ADMIN_STAFF_TEST_ORIGIN = localOrigin + localPrefix;

export default defineConfig({
  testDir: './tests',
  testMatch: 'staff-access.spec.ts',
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
  ...(remoteFixture ? {} : {
    webServer: {
      // Run a production build so the real CSP also applies to hydrated client forms.
      command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4327',
      url: localOrigin + localPrefix + '/sign-in',
      timeout: 90_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_GRIIP_ADMIN_PREFIX: localPrefix,
        NEXT_TELEMETRY_DISABLED: '1',
        GRIIP_ADMIN_TARGET: 'fixture',
        GRIIP_ADMIN_FIXTURE_WRITES: '1',
        GRIIP_ADMIN_FIXTURE_PORT: process.env.GRIIP_ADMIN_FIXTURE_PORT ?? '38180',
        GRIIP_ADMIN_PUBLIC_ORIGIN: '',
      },
    },
  }),
});
