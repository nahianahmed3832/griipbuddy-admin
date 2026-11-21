import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = new URL(process.env.GRIIP_ADMIN_R06_PICKUP_ORIGIN ?? '');
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port ||
    origin.pathname !== '/admin' || origin.search || origin.hash || origin.username || origin.password) {
  throw new Error('Use the isolated loopback Admin /admin URL.');
}
const password = process.env.GRIIPBUDDY_TEST_FIXTURE_PASSWORD;
const output = process.argv[2];
assert(password && output);
const browser = await chromium.launch({ executablePath: process.env.GRIIP_R06_CHROMIUM });
const widths = [1440, 390];
const outcomes = [];
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 850 }, hasTouch: width === 390,
      baseURL: origin.origin });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(45_000);
      const name = 'Synthetic pickup ' + randomUUID().slice(0, 8);
      const phone = '+880 1234 000001';
      await page.goto('/admin/sign-in');
      await page.getByLabel('Phone Number', { exact: true }).fill('01000000001');
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/, { timeout: 25_000 });

      await page.goto('/admin/dashboard/business-location/all');
      const add = page.locator('#main').getByRole('link', { name: 'Add Business Location', exact: true });
      await expect(add).toHaveAttribute('href', '/admin/dashboard/business-location/create');
      await page.goto('/admin/dashboard/business-location/create');
      await page.getByLabel('Location Name', { exact: true }).fill(name);
      await page.locator('select[name=type]').selectOption('OUTLET');
      await page.getByLabel('Local Address', { exact: true }).fill('Synthetic fixture address');
      await page.getByLabel('Show in pickup directory', { exact: true }).check();
      await page.getByLabel('Public pickup phone', { exact: true }).fill(phone);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: join(output, 'pickup-editor-' + width + '.png') });
      await page.getByRole('button', { name: 'Create Business Location', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Location added.' })).toBeVisible();
      await expect(page.getByText('BD · ' + phone, { exact: true })).toBeVisible();
      const detail = new URL(page.url()).pathname;
      const locationId = detail.split('/').at(-1);
      assert.match(locationId, /^[0-9a-f]{24}$/);

      await page.goto('/admin/dashboard/outlets-and-warehouse');
      const card = page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
      await expect(card.getByRole('link', { name: 'View Inventory', exact: true }))
        .toHaveAttribute('href', '/admin/dashboard/inventory/view/outlet?outlet_id=' + locationId);
      await expect(card.getByRole('link', { name: 'Transfer Stock', exact: true }))
        .toHaveAttribute('href', '/admin/dashboard/inventory/outlet-update?outlet_id=' + locationId);

      await page.goto('/admin/dashboard/business-location/edit/' + locationId);
      const phoneField = page.getByLabel('Public pickup phone', { exact: true });
      await expect(phoneField).toHaveValue(phone);
      await phoneField.fill('+880 1234 000002');
      await page.getByRole('button', { name: 'Update Business Location', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Location changes saved.' })).toBeVisible();
      await expect(page.getByText('BD · +880 1234 000002', { exact: true })).toBeVisible();
      await page.goto('/admin/dashboard/business-location/edit/' + locationId);
      await page.getByLabel('Show in pickup directory', { exact: true }).uncheck();
      await page.getByRole('button', { name: 'Update Business Location', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Location changes saved.' })).toBeVisible();
      await page.reload();
      await expect(page.getByText('Unlisted', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      outcomes.push({ width, create: true, edit: true, retiredSameLocation: true, scopedInventoryLinks: true });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(join(output, 'r06-pickup-browser.json'), JSON.stringify({ status: 'PASS', synthetic: true, outcomes }, null, 2) + '\n');
