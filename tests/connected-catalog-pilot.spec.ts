import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { fixturePassword } from './fixture-password';

function fixtureOrigin(name: string) {
  const origin = process.env[name];
  if (!origin || !/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(origin)) throw new Error(`Set ${name} to an isolated fixture origin.`);
  return origin;
}

const admin = fixtureOrigin('GRIIP_CONNECTED_TEST_ADMIN_ORIGIN');
const recovered = fixtureOrigin('GRIIP_SCOPED_CATALOG_TEST_RECOVERED_ORIGIN');
const marketplace = fixtureOrigin('GRIIP_CONNECTED_TEST_STOREFRONT_ORIGIN');
const mismatched = process.env.GRIIP_SCOPED_CATALOG_TEST_MISMATCHED_ORIGIN
  ? fixtureOrigin('GRIIP_SCOPED_CATALOG_TEST_MISMATCHED_ORIGIN') : undefined;
const outsideProduct = '00000000000000000000ab03';
const outsideVariant = '00000000000000000000ab04';
const managedCategory = '000000000000000000000001';
const managedProduct = '000000000000000000000003';
const managedVariant = '000000000000000000000005';
const warehouse = '000000000000000000000007';

test.beforeEach(async ({ page }) => {
  const origins = new Set([admin, recovered, marketplace, mismatched]);
  await page.route('**/*', route => origins.has(new URL(route.request().url()).origin) ? route.continue() : route.abort());
});

async function signIn(page: Page, origin: string) {
  await page.goto(origin + '/admin/sign-in');
  await page.getByLabel('Phone Number').fill('01000000001');
  await page.getByLabel('Password').fill(fixturePassword());
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(origin + '/admin/dashboard/overview');
}

async function legacyProduct(page: Page, id: string) {
  const cookie = (await page.context().cookies(admin + '/admin/')).find(item => item.name === 'griip_admin_step8');
  expect(cookie).toBeDefined();
  const response = await page.request.get(recovered + '/api/v1/product/admin/products/' + id, {
    headers: { Authorization: 'Bearer ' + cookie!.value },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data as { is_published: boolean };
}

test('scoped authoring preserves independent legacy workflows and routes reviewed records to the connected editor', async ({ page }) => {
  test.setTimeout(150_000);
  await signIn(page, admin);
  await page.goto('/admin/dashboard/categories');
  await expect(page.getByRole('heading', { name: 'All Main Categories', exact: true })).toBeVisible();
  const name = 'Pilot independent ' + randomUUID().slice(0, 8);
  await page.goto('/admin/dashboard/add-new-category');
  await expect(page.locator('header time')).not.toHaveText('...');
  await page.getByLabel('Name (English)', { exact: true }).fill(name);
  await page.getByLabel('Name (Bangla)', { exact: true }).fill('পরীক্ষামূলক বিভাগ');
  await page.getByRole('button', { name: 'Create Category', exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toBeVisible();

  const image = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#243855' } }).png().toBuffer();
  for (const path of ['/admin/api/categories?upload=1', '/admin/api/catalog-edit?upload=1']) {
    const upload = await page.request.post(path, { headers: { Origin: admin, 'Content-Type': 'image/png' }, data: image });
    expect(upload.ok(), await upload.text()).toBe(true);
    expect((await upload.json()).url).toContain('media.fixture.invalid');
  }
  const deniedCategory = await page.request.patch('/admin/api/categories', { headers: { Origin: admin },
    data: { depth: 0, id: managedCategory, revision: null, name_en: 'Do not save' } });
  expect(deniedCategory.status()).toBe(409);
  await page.goto('/admin/dashboard/update-category/' + managedCategory);
  await expect(page).toHaveURL(/\/admin\/dashboard\/categories\?catalog=connected&record=/);
  await expect(page.getByRole('heading', { name: 'Catalog organization' })).toBeVisible();

  await page.goto('/admin/dashboard/products');
  await expect(page.getByRole('heading', { name: /^All Products/ })).toBeVisible();
  await page.goto('/admin/dashboard/products?catalog=connected');
  await expect(page.getByRole('table', { name: 'Products in the shared catalog' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search products or SKU' }).fill('pilot-fixture');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/catalog=connected/);
  await page.goto('/admin/dashboard/update-product/' + outsideProduct);
  await expect(page.getByRole('heading', { name: 'Update Product', exact: true })).toBeVisible();
  await page.goto('/admin/dashboard/product-details/' + managedProduct);
  await expect(page).toHaveURL(/\/admin\/dashboard\/product-details\/0+3\?.*catalog=connected/);
  await expect(page.getByRole('navigation', { name: 'Product editor sections' })).toBeVisible();
  const deniedProduct = await page.request.post('/admin/api/catalog-edit', { headers: { Origin: admin },
    data: { kind: 'products', action: 'delete', region: 'BD', id: managedProduct, values: {} } });
  expect(deniedProduct.status()).toBe(409);
  const before = (await legacyProduct(page, outsideProduct)).is_published;
  const publish = (enabled: boolean) => page.request.post('/admin/api/operations', { headers: { Origin: admin },
    data: { action: 'product-publication', recordId: outsideProduct, region: 'BD', values: { enabled: String(enabled) } } });
  try {
    const changed = await publish(!before);
    expect(changed.status(), await changed.text()).toBe(200);
    expect((await legacyProduct(page, outsideProduct)).is_published).toBe(!before);
  } finally {
    const restored = await publish(before);
    expect(restored.status(), await restored.text()).toBe(200);
  }

  await page.goto('/admin/dashboard/check-outlet-stocks?catalog=legacy');
  await expect(page.getByRole('heading', { name: 'Stocks Report', exact: true })).toBeVisible();
  await page.getByLabel('SKU', { exact: true }).fill('FIXTURE-BD-BLUE');
  await expect(page).toHaveURL(/catalog=legacy/);
  await expect(page).toHaveURL(/skuQuery=FIXTURE-BD-BLUE/);
  await expect(page.getByRole('heading', { name: 'Stocks Report', exact: true })).toBeVisible();
  await page.goto('/admin/dashboard/check-outlet-stocks?catalog=connected');
  await expect(page.getByRole('table', { name: 'Physical warehouse stock' })).toBeVisible();

  const stock = (product: string, variant: string, key: string) =>
    page.request.post('/admin/api/stock-changes?mode=warehouse-update&region=BD', { headers: { Origin: admin },
      data: { key, from: warehouse, action: 'ADDITION', reason: 'Disposable pilot verification', items: [{ product, variant, qty: 1 }] } });
  const key = randomUUID();
  const recorded = await stock(outsideProduct, outsideVariant, key);
  expect(recorded.status(), await recorded.text()).toBe(201);
  const replay = await stock(outsideProduct, outsideVariant, key);
  expect(replay.status()).toBe(201);
  expect((await replay.json()).id).toBe((await recorded.json()).id);
  const deniedStock = await stock(managedProduct, managedVariant, randomUUID());
  expect(deniedStock.status()).toBe(409);
});

test('an unverified pilot receipt blocks legacy and connected catalog writes', async ({ page }) => {
  test.skip(!mismatched, 'Provide a second isolated admin using a different valid digest.');
  await signIn(page, mismatched!);
  const headers = { Origin: mismatched! };
  for (const [path, data] of [
    ['/admin/api/categories', { depth: 0, name_en: 'Do not save' }],
    ['/admin/api/catalog-edit', { kind: 'products', action: 'save', region: 'BD' }],
    ['/admin/api/stock-changes?mode=warehouse-update&region=BD', {}],
    ['/admin/api/connected-catalog', { region: 'BD', request: { action: 'category.save', input: { revision: null } } }],
  ] as const) {
    const response = await page.request.post(mismatched + path, { headers, data });
    expect(response.status(), await response.text()).toBe(503);
  }
});
