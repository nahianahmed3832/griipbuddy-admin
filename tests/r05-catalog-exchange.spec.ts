import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { serializeCsv } from '../src/lib/csv';
import { fixturePassword } from './fixture-password';

const base = new URL(process.env.GRIIP_ADMIN_R05_EXCHANGE_ORIGIN ?? 'http://127.0.0.1:4375/admin');
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port || base.username || base.password ||
    base.search || base.hash || !['/', '/admin', '/admin/'].includes(base.pathname)) {
  throw new Error('Catalog export tests require a disposable loopback Admin and synthetic staff.');
}
const admin = base.origin + base.pathname.replace(/\/$/, '');
const catalog = admin + '/dashboard/products';

async function signIn(page: Page, phone: string) {
  await page.goto(admin + '/sign-in');
  await page.getByLabel('Phone Number', { exact: true }).fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard\/overview(?:\?|$)/);
}

async function exportListings(page: Page, expectedName: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export listing page', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(expectedName);
  return readFile(await download.path(), 'utf8');
}

test('spreadsheet text is inert and quoted identifiers retain leading zeros', () => {
  expect(serializeCsv([['0000123', '=2+2', '\t-5', ' \u200b+2', 'Label, size "S"']]))
    .toBe('\uFEFF"0000123","\'=2+2","\'\t-5","\' \u200b+2","Label, size ""S"""');
});

for (const width of [1440, 390]) {
  test(`exports the visible recovered product page at ${width} CSS pixels`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 930 });
    await signIn(page, '01000000001');
    await page.goto(catalog + '?q=FIXTURE-BD');
    await expect(page.getByRole('link', { name: 'Fixture domestic case', exact: true })).toBeVisible();
    const authority = page.getByRole('region', { name: 'Catalog authority' });
    await expect(authority).toContainText('The development storefront uses its own catalog.');
    await expect(authority.getByRole('link', { name: 'Storefront products' })).toHaveAttribute(
      'href', 'https://dev.griipbuddy.com/admin/catalog');
    await expect(authority.getByRole('link', { name: 'Storefront taxonomy' })).toHaveAttribute(
      'href', 'https://dev.griipbuddy.com/admin/catalog/taxonomy');
    await expect(authority.getByRole('link', { name: 'Storefront CSV import' })).toHaveAttribute(
      'href', 'https://dev.griipbuddy.com/admin/catalog/import');
    expect(await page.locator('html').evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
    const csv = await exportListings(page, 'recovered-products-bd-page-1.csv');
    expect(csv).toContain('"000000000000000000000003","Fixture domestic case","FIXTURE-BD","Bangladesh"');
    expect(csv).toContain('"Min legacy base price (BDT)","Max legacy base price (BDT)"');
    expect(csv).not.toMatch(/FIXTURE-INT|Stocked outlets|buying price|warehouse/i);
    expect(csv.split('\r\n')).toHaveLength(2);
    await page.screenshot({ path: info.outputPath(`recovered-product-export-${width}.png`) });

    const search = page.getByRole('searchbox', { name: 'SKU' });
    await search.fill('R05-DOES-NOT-EXIST');
    await expect(page.getByText('No products found', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export listing page', exact: true })).toHaveCount(0);
  });
}

test('market selection and product view authorization bound the export', async ({ browser, page }) => {
  await signIn(page, '01000000001');
  await page.goto(catalog + '?region=INTERNATIONAL&q=FIXTURE-INT');
  await expect(page.getByRole('link', { name: 'Fixture international case', exact: true })).toBeVisible();
  const international = await exportListings(page, 'recovered-products-international-page-1.csv');
  expect(international).toContain('"000000000000000000000004","Fixture international case","FIXTURE-INT","International"');
  expect(international).not.toContain('FIXTURE-BD');

  const scoped = await browser.newPage();
  await signIn(scoped, '01000000006');
  await scoped.goto(catalog + '?q=FIXTURE-BD');
  await expect(scoped.getByRole('region', { name: 'Catalog authority' })).toBeVisible();
  await expect(scoped.getByRole('navigation', { name: 'Storefront owner catalog' })).toHaveCount(0);
  const domestic = await exportListings(scoped, 'recovered-products-bd-page-1.csv');
  expect(domestic).toContain('FIXTURE-BD');
  expect(domestic).not.toMatch(/FIXTURE-INT|Stocked outlets|buying price|warehouse/i);
  await scoped.goto(catalog + '?region=INTERNATIONAL&q=FIXTURE-INT');
  await expect(scoped.getByRole('button', { name: 'Export listing page', exact: true })).toHaveCount(0);
  await expect(scoped.getByText('Fixture international case', { exact: true })).toHaveCount(0);
  await scoped.close();

  const restricted = await browser.newPage();
  await signIn(restricted, '01000000004');
  await restricted.goto(catalog);
  await expect(restricted.getByRole('button', { name: 'Export listing page', exact: true })).toHaveCount(0);
  await expect(restricted.getByText('Fixture domestic case', { exact: true })).toHaveCount(0);
  await restricted.close();
});

test('recovered variant barcodes open a printable preview at 390 CSS pixels', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 930 });
  await signIn(page, '01000000001');
  await page.goto(admin + '/dashboard/barcodes/generate');
  await page.getByRole('searchbox').fill('FIXTURE-BD-BLUE');
  await page.getByRole('button', { name: /Fixture domestic case.*FIXTURE-BD-BLUE/i }).click();
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Generated 2 labels for FIXTURE-BD-BLUE');
  await page.getByRole('button', { name: 'Preview labels', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Print 2 labels' });
  await expect(preview.getByText('FIXTURE-BD-BLUE', { exact: true })).toHaveCount(2);
  const codes = await preview.getByText(/^\d{13}$/).allTextContents();
  expect(new Set(codes).size).toBe(2);
  await page.screenshot({ path: info.outputPath('recovered-barcode-print-preview-390.png') });
  await preview.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(preview).toHaveCount(0);
});
