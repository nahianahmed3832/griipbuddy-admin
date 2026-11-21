import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const admin = process.env.GRIIP_CONNECTED_TEST_ADMIN_ORIGIN!;
const storefront = process.env.GRIIP_CONNECTED_TEST_STOREFRONT_ORIGIN!;
const categoryPage = '/admin/dashboard/categories?catalog=connected';
const endpoint = '/admin/api/connected-catalog';

async function signIn(page: Page, phone: string) {
  await page.goto('/admin/sign-in');
  await page.getByLabel('Phone Number', { exact: true }).fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\//);
}

function catalog(page: Page, request: object, region = 'BD') {
  return page.request.post(endpoint, { data: { request, region }, headers: { Origin: admin } });
}

async function readProduct(page: Page, id: string, region = 'BD') {
  const response = await catalog(page, { read: 'product', id }, region);
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).data;
}

async function createCategory(page: Page, slug: string, title: string, kind: string, parent?: string) {
  await page.goto(categoryPage);
  await page.getByRole('link', { name: 'New category', exact: true }).click();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create category', exact: true }) });
  await form.getByLabel('Name', { exact: true }).fill(title);
  await form.getByLabel('Short name', { exact: true }).fill(title);
  await form.getByLabel('Slug', { exact: true }).fill(slug);
  await form.getByRole('combobox', { name: 'Level', exact: true }).selectOption(kind);
  if (parent) await form.getByRole('combobox', { name: 'Parent category', exact: true }).selectOption(parent);
  await form.getByRole('combobox', { name: 'State', exact: true }).selectOption('ACTIVE');
  await form.getByLabel('Category image path').fill('/catalog/phone-stand.webp');
  await form.getByLabel('Category image alternative text').fill(title + ' preview');
  await form.getByRole('button', { name: 'Create category', exact: true }).click();
  await expect(page).toHaveURL(/record=cat-/);
  const id = new URL(page.url()).searchParams.get('record')!;
  const response = await catalog(page, { read: 'categories', id });
  expect(response.ok(), await response.text()).toBe(true);
  const { data } = await response.json();
  expect(data.categories.find((row: { id: string }) => row.id === id)).toMatchObject({ slug, kind, state: 'ACTIVE', parentId: parent ?? null });
  return id;
}

test('admin creates taxonomy and a multi-variant draft through the signed catalog', async ({ page, browser }, testInfo) => {
  test.setTimeout(150_000);
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/*', route => [admin, storefront].includes(new URL(route.request().url()).origin)
    ? route.continue() : route.abort());
  const suffix = randomUUID().slice(0, 8);
  const slug = 'm04-case-' + suffix;
  const title = 'Synthetic Case ' + suffix;
  expect((await catalog(page, { read: 'categories' })).status()).toBe(401);
  await signIn(page, '01000000001');
  const department = await createCategory(page, slug + '-department', 'Cases ' + suffix, 'DEPARTMENT');
  const category = await createCategory(page, slug + '-category', 'Protective ' + suffix, 'CATEGORY', department);
  const leaf = await createCategory(page, slug + '-leaf', 'Slim ' + suffix, 'SUBCATEGORY', category);
  await page.screenshot({ path: testInfo.outputPath('catalog-taxonomy.png') });

  await page.goto('/admin/dashboard/create-product?catalog=connected');
  await expect(page.getByRole('heading', { name: 'Create Product', exact: true })).toBeVisible();
  await page.getByLabel('Product name', { exact: true }).fill(title);
  await page.getByLabel('Product slug', { exact: true }).fill(slug);
  await page.getByLabel('Description', { exact: true }).fill('Synthetic slim case with two physical colours.');
  await page.getByRole('combobox', { name: 'Primary category', exact: true }).selectOption(leaf);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('product-authoring.png') });
  await page.getByRole('button', { name: 'Add option', exact: true }).click();
  await page.getByLabel('Option label', { exact: true }).fill('Colour');
  await page.getByLabel('Option key', { exact: true }).fill('Colour');
  await page.getByLabel('Canonical value', { exact: true }).fill('Blue');
  await page.getByRole('button', { name: 'Add option value', exact: true }).click();
  await page.getByLabel('Canonical value', { exact: true }).nth(1).fill('blue');
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'needs distinct canonical values and display labels' })).toBeVisible();
  await page.getByLabel('Canonical value', { exact: true }).nth(1).fill('Green');
  await page.getByRole('button', { name: 'Preview combinations', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Include Blue', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Include Green', exact: true }).check();
  const blue = page.getByLabel('SKU for Blue', { exact: true });
  const green = page.getByLabel('SKU for Green', { exact: true });
  await blue.fill('M04-REPEATED');
  await green.fill('m04-repeated');
  await page.getByRole('button', { name: 'Add selected combinations', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'repeats SKU M04-REPEATED' })).toBeVisible();
  await blue.clear();
  await green.clear();
  await page.getByRole('button', { name: 'Suggest selected SKUs', exact: true }).click();
  const blueSku = slug.toUpperCase() + '-BLUE';
  const greenSku = slug.toUpperCase() + '-GREEN';
  await expect(blue).toHaveValue(blueSku);
  await expect(green).toHaveValue(greenSku);
  await page.getByRole('button', { name: 'Add selected combinations', exact: true }).click();
  const matrix = page.getByRole('table', { name: 'Physical variants' });
  await expect(matrix.getByRole('row')).toHaveCount(3);
  const greenRowSku = matrix.getByLabel('Edit SKU for Green', { exact: true });
  await greenRowSku.fill(blueSku.toLowerCase());
  await page.getByRole('searchbox', { name: 'Find variants' }).fill('unmatched-r04-variant');
  await expect(greenRowSku).toHaveCount(0);
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'is used in more than one variant' })).toBeVisible();
  const review = page.getByRole('button', { name: 'Find first SKU to fix' });
  await review.focus();
  await review.press('Enter');
  await expect(greenRowSku).toBeFocused();
  await expect(greenRowSku).toHaveAttribute('aria-invalid', 'true');
  await expect(greenRowSku).toHaveAccessibleDescription(/is used in more than one variant/);
  await greenRowSku.fill(greenSku);
  await expect(greenRowSku).toHaveAttribute('aria-invalid', 'false');
  await page.getByRole('region', { name: 'Variant matrix', exact: true }).evaluate(node => node.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: testInfo.outputPath('variant-matrix-draft.png') });
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/product-details\//);
  const id = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)!);
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const [bd, us] = await Promise.all([readProduct(page, id), readProduct(page, id, 'INTERNATIONAL')]);
  expect(bd.shared).toMatchObject({ id, slug, publication: 'DRAFT', departmentId: leaf });
  expect(bd.shared.variants).toMatchObject([{ sku: blueSku, isDefault: true }, { sku: greenSku, isDefault: false }]);
  expect(us.shared.variants.map((row: { id: string }) => row.id)).toEqual(bd.shared.variants.map((row: { id: string }) => row.id));
  expect(bd.commerce.market.currency).toBe('BDT');
  expect(us.commerce.market.currency).toBe('USD');
  expect(bd.commerce.pools).toEqual([]);
  expect(us.commerce.pools).toEqual([]);
  const existingSku = await catalog(page, { action: 'product.save', input: {
    id: slug + '-conflict', slug: slug + '-conflict', expectedRevision: null, publication: 'DRAFT',
    name: title + ' conflict', description: '', primaryCategoryId: leaf, options: [],
    variants: [{ id: 'v-' + randomUUID(), sku: blueSku, selections: {} }],
  } });
  expect([409, 422], await existingSku.text()).toContain(existingSku.status());
  const repeat = ['A', 'B'].map(label => ({ id: 'v-' + randomUUID(), sku: slug + '-RED-' + label, selections: { colour: 'red' } }));
  const duplicateCombination = await catalog(page, { action: 'product.save', input: {
    id: slug + '-invalid', slug: slug + '-invalid', expectedRevision: null, publication: 'DRAFT',
    name: title + ' invalid combinations', description: '', primaryCategoryId: leaf,
    options: [{ id: 'colour', key: 'Colour', label: 'Colour', values: [{ id: 'red', value: 'Red', label: 'Red' }] }],
    variants: repeat, defaultVariantId: repeat[0].id,
  } });
  expect(duplicateCombination.status()).toBe(400);
  expect(await duplicateCombination.json()).toMatchObject({ error: expect.stringContaining('different option combination') });

  const filter = page.getByRole('searchbox', { name: 'Find variants' });
  await filter.fill(greenSku);
  await page.getByRole('combobox', { name: 'Variant status', exact: true }).selectOption('active');
  await matrix.getByRole('checkbox', { name: 'Select variant ' + greenSku }).check();
  const stageArchive = page.getByRole('button', { name: 'Stage archive for selected', exact: true });
  await stageArchive.focus();
  await stageArchive.press('Enter');
  const staged = page.getByRole('status').filter({ hasText: 'Staged for archive' });
  await expect(staged).toContainText(greenSku);
  await expect(staged).toBeFocused();
  await expect(page.getByText('No variants match this search.')).toBeVisible();
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect.poll(async () => (await readProduct(page, id)).shared.variants[1]?.archivedAt).toBeTruthy();
  const saved = await readProduct(page, id);
  expect(saved.shared.variants[1]).toMatchObject({ id: bd.shared.variants[1].id, sku: greenSku, active: false });
  await page.getByRole('combobox', { name: 'Variant status', exact: true }).selectOption('archived');
  await expect(matrix).toContainText('Archived');
  await expect(staged).toHaveCount(0);
  await filter.clear();
  await page.getByRole('combobox', { name: 'Variant status', exact: true }).selectOption('all');
  await page.getByRole('region', { name: 'Variant matrix', exact: true }).evaluate(node => node.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: testInfo.outputPath('variant-matrix-archived.png') });
  const optionLabel = page.getByLabel('Option label', { exact: true });
  await optionLabel.fill('SyntheticLongTranslatedOptionLabel'.repeat(2));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(matrix.getByText(greenSku, { exact: true })).toBeVisible();
  }
  await optionLabel.fill('Colour');
  await page.setViewportSize(testInfo.project.name === 'desktop' ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
  await page.goto('/admin/dashboard/products?catalog=connected');
  await page.getByRole('searchbox', { name: 'Search products or SKU' }).fill(blueSku);
  await page.getByRole('form', { name: 'Product catalog filters' }).getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Products in the shared catalog' }).getByRole('row', { name: new RegExp(title) })).toContainText('Draft');
  await page.screenshot({ path: testInfo.outputPath('product-list.png') });

  const scoped = await browser.newContext({ baseURL: admin });
  try {
    const staff = await scoped.newPage();
    await signIn(staff, '01000000006');
    expect((await catalog(staff, { read: 'product', id }, 'INTERNATIONAL')).status()).toBe(403);
    expect((await catalog(staff, { action: 'product.publish', input: { productId: id, revision: saved.shared.revision, publication: 'ACTIVE' } })).status()).toBe(403);
  } finally {
    await scoped.close();
  }
});
