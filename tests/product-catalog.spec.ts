import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const catalog = '/desk/catalog/products';

test.use({ actionTimeout: 10000, navigationTimeout: 20000 });

async function signIn(page: Page, account = '1') {
  await page.goto('/sign-in');
  await page.getByLabel('Staff email or phone number').fill('0100000000' + account);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/desk\//);
}

test('product prices, publication, and exact stock links remain readable on phones', async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto(catalog);
  const product = page.getByRole('row').filter({ hasText: 'Fixture domestic case' });
  await expect(product).toContainText('৳800');
  await expect(product).toContainText('৳900');
  await expect(product).toContainText('12 available');
  await expect(product).toContainText('Published');
  await expect(product).toContainText('Website · POS');
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(product.getByRole('link', { name: 'Open listing for Fixture domestic case' })).toBeVisible();
    const noOverlap = await product.evaluate(row => {
      const name = row.querySelector('.catalog-product-text')!.getBoundingClientRect();
      const action = row.querySelector('.catalog-row-action a')!.getBoundingClientRect();
      return name.right <= action.left;
    });
    expect(noOverlap, 'Product text clears the Open button at ' + width + ' px').toBe(true);
    await page.screenshot({ path: testInfo.outputPath('product-catalog-' + width + '.png'), fullPage: true });
  }
  const { violations } = await new AxeBuilder({ page }).include('.catalog-list').analyze();
  expect(violations.filter(rule => rule.impact === 'serious' || rule.impact === 'critical')).toEqual([]);

  await page.getByLabel('Search by', { exact: true }).selectOption('sku');
  await page.getByLabel('Search records').fill('FIXTURE-BD');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('heading', { name: '1 product', exact: true })).toBeVisible();
  await product.getByRole('link', { name: 'Open listing for Fixture domestic case' }).click();
  await page.getByRole('link', { name: 'Back to all products' }).click();
  await expect(page.getByLabel('Search records')).toHaveValue('FIXTURE-BD');
  await expect(page.getByLabel('Search by', { exact: true })).toHaveValue('sku');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export page' }).click();
  const file = await (await download).path();
  expect(await readFile(file!, 'utf8')).toContain('"Fixture domestic case","FIXTURE-BD"');

  await page.getByText('Inventory filters', { exact: true }).click();
  await page.getByLabel('Stock across all locations', { exact: true }).selectOption('out');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('heading', { name: 'No matching products' })).toBeVisible();
  await page.getByLabel('Stock across all locations', { exact: true }).selectOption('in');
  await page.getByLabel('Stock recorded at', { exact: true }).selectOption({ label: 'Fixture warehouse' });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await product.getByRole('link', { name: /View stock for Fixture domestic case/ }).click();
  await expect(page).toHaveURL(/\/desk\/inventory\/stock\?.*product=000000000000000000000003/);
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('table').getByText('FIXTURE-BD-BLUE', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/product=000000000000000000000003/);
});

test('nested filters and sort work across the catalog, and resetting a parent drops its descendants', async ({ page }) => {
  const backend = process.env.GRIIP_ADMIN_TEST_BACKEND_DIR;
  if (!backend) throw new Error('Set GRIIP_ADMIN_TEST_BACKEND_DIR to the disposable fixture backend.');
  const requireFixture = createRequire(resolve(backend, 'package.json'));
  const { MongoClient, ObjectId } = requireFixture('mongoose').mongo;
  const Redis = requireFixture('ioredis');
  const cache = new Redis(38179, '127.0.0.1', { lazyConnect: true, retryStrategy: () => null });
  async function clearCategoryCache() {
    let cursor = '0';
    do {
      const [next, keys]: [string, string[]] = await cache.scan(cursor, 'MATCH', 'categories:list:*');
      if (keys.length) await cache.del(...keys);
      cursor = next;
    } while (cursor !== '0');
  }
  const client = new MongoClient('mongodb://127.0.0.1:38117/griipbuddy_fixture?replicaSet=griip-recovery&directConnection=true',
    { serverSelectionTimeoutMS: 2000 });
  const db = client.db('griipbuddy_fixture');
  const [root, sub, middle, leaf, second] = Array.from({ length: 5 }, () => new ObjectId());
  const prefix = 'Catalog filter fixture ' + root.toString().slice(-6);
  const collections = ['categories', 'subcategories', 'sub_subcategories', 'third_subcategories', 'products'];
  const ids = [[root, second], [sub], [middle], [leaf], Array.from({ length: 22 }, () => new ObjectId())];
  const category = (_id: unknown, name_en: string, fields: object = {}) => ({ _id, name_en, slug: new ObjectId().toString(), ...fields });
  let seeded = false;
  try {
    const hello = await db.admin().command({ hello: 1 });
    const marker = await db.collection('products').findOne({ _id: new ObjectId('000000000000000000000003'), sku: 'FIXTURE-BD' });
    if (hello.setName !== 'griip-recovery' || hello.me !== '127.0.0.1:38117' || !marker) throw new Error('Unexpected fixture database.');
    seeded = true;
    await Promise.all([
      db.collection(collections[0]).insertMany([category(root, prefix, { subcategories: [sub] }), category(second, prefix + ' other')]),
      db.collection(collections[1]).insertOne(category(sub, 'Phones', { category: root, sub_subcategories: [middle] })),
      db.collection(collections[2]).insertOne(category(middle, 'Accessories', { category: root, subcategory: sub, third_subcategories: [leaf] })),
      db.collection(collections[3]).insertOne(category(leaf, 'Protectors', { category: root, subcategory: sub, sub_subcategory: middle })),
      db.collection(collections[4]).insertMany(ids[4].map((_id, index) => ({
        _id, slug: _id.toString(), name: prefix + ' ' + String(index + 1).padStart(2, '0'), sku: 'CF-' + _id.toString(),
        region: 'BD', is_published: false, category: root, subcategory: sub, sub_subcategory: middle, third_subcategory: index < 21 ? leaf : null,
      }))),
    ]);
    await clearCategoryCache();
    await signIn(page);
    await page.goto(catalog);
    const unpublished = page.getByRole('navigation', { name: 'Publication status' }).getByRole('link', { name: 'Unpublished', exact: true });
    await unpublished.click();
    await expect(unpublished).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: '22 products', exact: true })).toBeVisible();
    await page.getByLabel('Category', { exact: true }).selectOption(root.toString());
    await page.getByLabel('Subcategory', { exact: true }).selectOption(sub.toString());
    await page.getByLabel('Category level 3', { exact: true }).selectOption(middle.toString());
    await page.getByLabel('Category level 4', { exact: true }).selectOption(leaf.toString());
    await page.getByLabel('Sort by', { exact: true }).selectOption('name');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('heading', { name: '21 products', exact: true })).toBeVisible();
    const rows = page.getByRole('table').locator('tbody tr');
    await expect(rows).toHaveCount(20);
    await expect(rows.first()).toContainText(prefix + ' 01');
    await expect(rows.first()).toContainText(prefix + ' / Phones / Accessories / Protectors');
    await page.getByRole('link', { name: 'Next', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(prefix + ' 21');
    await expect(page.getByLabel('Category level 4')).toHaveValue(leaf.toString());
    await page.getByLabel('Category', { exact: true }).selectOption(second.toString());
    await expect(page.getByLabel('Subcategory', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('heading', { name: 'No matching products' })).toBeVisible();
    expect(new URL(page.url()).searchParams.has('thirdSubcategory')).toBe(false);
    expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  } finally {
    try {
      if (seeded) {
        await Promise.all(collections.map((name, index) => db.collection(name).deleteMany({ _id: { $in: ids[index] } })));
        await clearCategoryCache();
      }
    } finally {
      cache.disconnect();
      await client.close();
    }
  }
});

test('product viewers without stock permission cannot see stock filters or links', async ({ page }) => {
  await signIn(page, '6');
  await page.goto(catalog + '?stock=out');
  await expect(page.getByRole('heading', { name: 'All Products', exact: true })).toBeVisible();
  await expect(page.getByText('Fixture domestic case', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /View stock for|Stock report/ })).toHaveCount(0);
  await expect(page.getByText('Inventory filters', { exact: true })).toHaveCount(0);
  await expect(page.getByText('12 available', { exact: true })).toHaveCount(0);
});
