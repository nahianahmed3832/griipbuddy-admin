import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const fixture = process.env.GRIIP_ADMIN_R05_REFERENCE_ORIGIN;
const origin = fixture ? new URL(fixture) : undefined;
if (origin && (origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:' ||
    !origin.port || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password)) {
  throw new Error('Use an isolated loopback Admin origin for catalog authoring checks.');
}
test.skip(!origin, 'Set the isolated reference-data Admin origin.');

for (const width of [1440, 390]) {
  test(`localized brand authoring and retirement at ${width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width, height: 850 }, hasTouch: width === 390,
      baseURL: origin?.origin });
    const page = await context.newPage();
    const run = randomUUID().slice(0, 10);
    const name = 'Synthetic brand ' + run;
    const translated = 'পরীক্ষার ব্র্যান্ড ' + run;
    const list = '/admin/dashboard/all-brands';
    try {
      await page.goto('/admin/sign-in');
      await page.getByLabel('Phone Number', { exact: true }).fill('01000000001');
      await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);
      await page.goto('/admin/dashboard/create-brand');
      await page.getByLabel('Brand Name', { exact: true }).fill(name);
      await page.getByLabel('Bangla name', { exact: true }).fill(translated);
      await page.getByRole('button', { name: 'Create Brand', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(list + '$'));
      const row = page.getByRole('row').filter({ hasText: name });
      await expect(row.getByText(translated, { exact: true })).toBeVisible();
      await page.getByRole('searchbox', { name: 'Search brands' }).fill(translated);
      await page.getByRole('button', { name: 'Apply' }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(translated);
      await expect(row).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath('brand-search.png') });

      await page.goto('/admin/dashboard/create-product');
      const selector = page.getByRole('combobox', { name: 'Brand (optional)' });
      await expect(selector.locator('option').filter({ hasText: name + ' · ' + translated })).toHaveCount(1);
      await page.goto(list + '?q=' + encodeURIComponent(translated), { waitUntil: 'networkidle' });
      await row.getByRole('button', { name: 'Open menu' }).click();
      await row.getByRole('button', { name: 'Archive brand' }).click();
      const confirmation = page.getByRole('dialog', { name: 'Archive brand' });
      await confirmation.getByRole('button', { name: 'Archive', exact: true }).click();
      await expect(row.getByText('Archived', { exact: true })).toBeVisible();

      await page.getByRole('combobox', { name: 'Brand status', exact: true }).selectOption('false');
      await page.getByRole('button', { name: 'Apply' }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get('filter')).toBe('false');
      await page.waitForLoadState('networkidle');
      await expect(row.getByText('Archived', { exact: true })).toBeVisible();
      await row.getByRole('button', { name: 'Open menu' }).click();
      await row.getByRole('link', { name: 'Edit', exact: true }).click();
      await expect(page.getByLabel('Bangla name', { exact: true })).toHaveValue(translated);
      await expect(page.getByRole('checkbox', { name: 'Reactivate archived brand' })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath('brand-editor.png') });
      await page.getByRole('checkbox', { name: 'Reactivate archived brand' }).check();
      await page.getByRole('button', { name: 'Update Brand', exact: true }).click();
      await expect(row.getByText('Active', { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });
}
