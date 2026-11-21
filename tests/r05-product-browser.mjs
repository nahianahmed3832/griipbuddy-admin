import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const admin = new URL(process.env.GRIIP_R05_PRODUCT_ADMIN_FIXTURE ?? 'http://127.0.0.1:4388/admin');
assert.equal(admin.href, 'http://127.0.0.1:' + admin.port + '/admin');
const password = process.env.GRIIPBUDDY_TEST_FIXTURE_PASSWORD;
assert(password, 'Set the disposable fixture password.');
const output = process.env.GRIIP_R05_PRODUCT_BROWSER_OUTPUT;
const widths = [];
const browser = await chromium.launch({
  executablePath: process.env.GRIIP_R05_CHROMIUM,
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/*', route => new URL(route.request().url()).origin === admin.origin ? route.continue() : route.abort());
  if (output) await mkdir(output, { recursive: true });
  await page.goto(admin.href + '/sign-in');
  await page.getByLabel('Phone Number', { exact: true }).fill('01000000001');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\//);
  const list = admin.href + '/dashboard/products';
  await page.goto(list + '?q=FIXTURE-BD&filter=true&sort=name');
  const product = page.getByRole('row').filter({ hasText: 'Fixture domestic case' });
  await expect(product).toBeVisible();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  // An existing query opens the panel, so reopen after exercising its toggle.
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByLabel('Publication', { exact: true })).toHaveValue('true');
  await expect(page.getByLabel('Sort products', { exact: true })).toHaveValue('name');
  await expect(product.getByRole('link', { name: 'Fixture domestic case', exact: true }))
    .toHaveAttribute('href', /q=FIXTURE-BD.*filter=true.*sort=name/);
  if (output) await page.screenshot({ path: join(output, 'recovered-catalog-desktop.png') });
  await product.getByRole('button', { name: 'Product actions: Fixture domestic case' }).click();
  await page.getByRole('button', { name: 'Duplicate as draft' }).click();
  const sku = 'R05-BROWSER-' + randomUUID().slice(0, 8).toUpperCase();
  await page.getByLabel('New product SKU').fill(sku);
  await page.getByRole('button', { name: 'Create draft copy' }).click();
  await expect(page).toHaveURL(/\/dashboard\/update-product\/[a-f0-9]{24}\?/);
  const editor = page.url();
  const name = 'R05 synthetic clone ' + sku;
  await expect(page.getByLabel('Product Name', { exact: true })).toHaveValue('Fixture domestic case (copy)');
  await page.getByLabel('Product Name', { exact: true }).fill(name);
  await expect(page.getByRole('textbox', { name: 'SKU for variant 1' })).toHaveValue(sku + '-01');
  await expect(page.getByRole('textbox', { name: 'SKU for variant 1' })).toHaveAttribute('readonly', '');
  await page.getByRole('spinbutton', { name: 'Regular price for variant 1' }).fill('777.25');
  await page.getByRole('spinbutton', { name: 'Sale price for variant 1' }).fill('701.50');
  await page.getByRole('button', { name: 'Update Product', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/products\?/);
  await page.goto(editor);
  await expect(page.getByLabel('Product Name', { exact: true })).toHaveValue(name);
  await expect(page.getByRole('spinbutton', { name: 'Regular price for variant 1' })).toHaveValue('777.25');
  await expect(page.getByRole('spinbutton', { name: 'Sale price for variant 1' })).toHaveValue('701.5');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth) <= width);
    await expect(page.getByRole('heading', { name: 'Variant Matrix', exact: true })).toBeVisible();
    widths.push(width);
  }
  if (output) await page.screenshot({ path: join(output, 'recovered-catalog-editor-390.png'), fullPage: true });
  await page.goto(list + '?q=' + sku);
  const copy = page.getByRole('row').filter({ hasText: name });
  await expect(copy.getByText('Unpublished', { exact: true })).toBeVisible();
  await copy.getByRole('checkbox', { name: 'Select ' + name }).check();
  await page.getByRole('button', { name: 'Archive selected (1)', exact: true }).click();
  await page.getByRole('dialog', { name: 'Archive product' }).getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByText('No products found', { exact: true })).toBeVisible();
  const result = { status: 'passed', synthetic: true, widths, checks: ['scoped filters', 'query-preserving detail links',
    'draft duplication', 'issued SKU displayed read-only', 'atomic content and price persistence', 'no page overflow', 'confirmed archive'] };
  if (output) await writeFile(join(output, 'recovered-catalog-browser.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
