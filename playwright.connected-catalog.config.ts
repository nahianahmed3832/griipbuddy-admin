import { defineConfig } from '@playwright/test';

function fixtureOrigin(name: string) {
  const value = process.env[name];
  if (!value || !/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(value)) {
    throw new Error(`Set ${name} to the origin of its isolated loopback fixture.`);
  }
  return value;
}

export const adminOrigin = fixtureOrigin('GRIIP_CONNECTED_TEST_ADMIN_ORIGIN');
export const storefrontOrigin = fixtureOrigin('GRIIP_CONNECTED_TEST_STOREFRONT_ORIGIN');

export default defineConfig({
  testDir: './tests',
  testMatch: [
    'connected-admin-accessibility.spec.ts',
    'connected-catalog.spec.ts', 'connected-category-parity.spec.ts',
    'connected-staff-customer.spec.ts', 'connected-editorial-media.spec.ts', 'connected-variant-gallery.spec.ts',
    'connected-product-attributes-history.spec.ts',
    ...(process.env.GRIIP_HOMEPAGE_TEST_PRODUCT ? ['connected-homepage.spec.ts'] : []),
  ],
  timeout: 75_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: adminOrigin,
    actionTimeout: 12_000,
    launchOptions: process.env.GRIIPBUDDY_BROWSER ? { executablePath: process.env.GRIIPBUDDY_BROWSER } : undefined,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
});
