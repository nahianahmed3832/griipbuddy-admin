import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = new URL(process.env.GRIIP_R07_REVIEW_ORIGIN ?? '');
assert(origin.protocol === 'http:' && origin.hostname === '127.0.0.1' && origin.port
  && origin.pathname === '/' && !origin.search && !origin.hash && !origin.username && !origin.password);
const secret = process.env.GRIIPBUDDY_TEST_FIXTURE_PASSWORD;
const directory = process.env.GRIIP_R07_REVIEW_EVIDENCE_DIR;
assert(secret && directory);
const browser = await chromium.launch({ executablePath: process.env.GRIIP_R07_CHROMIUM });
const title = 'R07 synthetic review [scope]';
const list = '/admin/dashboard/product-reviews';
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, baseURL: origin.origin });
    try {
      const page = await context.newPage();
      const login = await page.request.post('/admin/api/session', {
        form: { phone: '01000000001', password: secret }, headers: { Origin: origin.origin }, maxRedirects: 0,
      });
      assert.equal(login.status(), 303);
      assert.match(login.headers().location, /\/admin\/dashboard\/overview$/);
      await page.goto(list);
      await expect(page.getByRole('heading', { name: 'Product Reviews', exact: true })).toBeVisible();
      await page.getByRole('searchbox', { name: 'Search reviews', exact: true }).fill('[scope]');
      await page.getByRole('combobox', { name: 'Rating', exact: true }).selectOption('4');
      await page.getByRole('button', { name: 'Apply review filters', exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('[scope]');
      const row = page.getByRole('row').filter({ hasText: title });
      await expect(row).toHaveCount(1);
      await expect(page.getByRole('navigation', { name: 'Pages', exact: true })).toContainText('1 - 1 of 1');
      await expect(page.getByText('R07 synthetic review foreign', { exact: true })).toHaveCount(0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      const selected = row.getByRole('combobox', { name: 'Status for ' + title, exact: true });
      await expect(selected).toBeEnabled();
      await expect(selected).toHaveValue('pending');
      await selected.selectOption('approved');
      await expect(selected).toHaveValue('approved');
      await row.getByRole('link', { name: 'View ' + title, exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.getByText('APPROVED', { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText('APPROVED', { exact: true })).toBeVisible();
      await page.screenshot({ path: join(directory, 'review-detail-' + width + '.png') });

      await page.goto(list + '?region=BD&q=' + encodeURIComponent('[scope]'));
      await expect(selected).toBeEnabled();
      await selected.selectOption('pending');
      await expect(selected).toHaveValue('pending');
      await page.goto(list + '?region=INTERNATIONAL&q=' + encodeURIComponent('R07 synthetic'));
      await expect(page.getByText('R07 synthetic review foreign', { exact: true })).toBeVisible();
      await expect(page.getByText(title, { exact: true })).toHaveCount(0);
      results.push({ width, serverSearchAndCount: true, scopedInternationalRead: true, persistedModeration: true });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const report = { status: 'PASS', synthetic: true, results };
await writeFile(join(directory, 'R07_REVIEW_BROWSER.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
