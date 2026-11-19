import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const origin = process.env.GRIIP_CONNECTED_TEST_ADMIN_ORIGIN!;
const catalog = '/admin/dashboard/categories';
const image = { src: '/catalog/phone-stand.webp', alt: 'Fixture category image' };

async function command<T = unknown>(page: Page, request: object) {
  const response = await page.request.post('/admin/api/connected-catalog', {
    headers: { Origin: origin }, data: { region: 'BD', request },
  });
  const payload = await response.json();
  expect(response.status(), JSON.stringify(payload)).toBe(200);
  return payload.data as T;
}

type AssignmentRead = {
  categories: { id: string; parentId: string | null; revision: number; state: string; position: number }[];
  assignments: { products: { id: string; revision: number; primaryCategoryId: string; secondaryCategoryIds: string[] }[] };
};

test('category search, revisioned assignments and move review preserve placements', async ({ page }) => {
  const storefrontOrigin = process.env.GRIIP_CONNECTED_TEST_STOREFRONT_ORIGIN;
  await page.route('**/*', route => {
    const requestOrigin = new URL(route.request().url()).origin;
    return requestOrigin === origin || requestOrigin === storefrontOrigin ? route.continue() : route.abort();
  });
  await page.goto('/admin/sign-in');
  await page.getByLabel('Phone Number').fill('01000000001');
  await page.getByLabel('Password').fill(fixturePassword());
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);

  const key = 'category-parity-' + randomUUID().slice(0, 8);
  const root = key + '-root';
  const sourceBranch = key + '-source';
  const targetBranch = key + '-target';
  const existing = key + '-existing';
  const destination = key + '-placement';
  const archive = key + '-archive';
  const names = {
    [root]: key + ' Department',
    [sourceBranch]: key + ' Source branch',
    [targetBranch]: key + ' Target branch',
    [existing]: key + ' Existing leaf',
    [destination]: key + ' Destination leaf',
    [archive]: key + ' Archive leaf',
  };
  for (const [id, kind, parentId] of [[root, 'DEPARTMENT', null], [sourceBranch, 'CATEGORY', root],
    [targetBranch, 'CATEGORY', root], [existing, 'SUBCATEGORY', sourceBranch], [destination, 'SUBCATEGORY', targetBranch],
    [archive, 'SUBCATEGORY', targetBranch]] as const) {
    await command(page, { action: 'category.save', input: {
      id, kind, parentId, state: 'ACTIVE', revision: null, position: 0,
      name: names[id], shortName: id.slice(-26), slug: id, description: '', image,
    } });
  }
  const products = ['alpha', 'beta'].map(suffix => ({ id: key + '-' + suffix, name: key + ' ' + suffix, sku: (key + '-' + suffix).toUpperCase() }));
  for (const product of products) {
    await command(page, { action: 'product.save', input: {
      id: product.id, slug: product.id, name: product.name, expectedRevision: null, primaryCategoryId: existing,
      publication: 'DRAFT', description: 'Local category parity test product', options: [],
      variants: [{ id: 'v-' + product.id, sku: product.sku, selections: {} }],
    } });
  }

  await page.goto(catalog);
  await page.getByRole('searchbox', { name: 'Search category tree' }).fill('unmatched-' + key);
  await expect(page.getByText('No categories match.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search category tree' }).fill(names[destination]);
  await expect(page.getByRole('link', { name: names[targetBranch], exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: names[sourceBranch], exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: names[destination], exact: true }).click();

  await page.getByText('Reorder sibling categories', { exact: true }).click();
  await page.getByRole('button', { name: 'Move ' + names[destination] + ' up' }).click();
  await page.getByRole('button', { name: 'Save order', exact: true }).click();
  await expect.poll(async () => {
    const { categories } = await command<AssignmentRead>(page, { read: 'categories', id: destination });
    return [destination, archive].map(id => categories.find(row => row.id === id)?.position);
  }).toEqual([0, 1]);
  await page.reload();

  const assignments = page.getByRole('region', { name: 'Product assignments' });
  await assignments.getByRole('combobox', { name: 'Placement' }).selectOption('search');
  await assignments.getByRole('searchbox', { name: 'Product or SKU' }).fill(key);
  await assignments.getByRole('button', { name: 'Search', exact: true }).click();
  const first = products[0];
  const second = products[1];
  await assignments.getByRole('button', { name: 'Edit assignments for ' + first.name }).click();
  const form = assignments.getByRole('form', { name: 'Edit assignments for ' + first.name });
  await form.getByRole('combobox', { name: 'Primary category' }).selectOption(destination);
  await form.getByRole('checkbox', { name: new RegExp(names[existing] + '$') }).check();
  await form.getByRole('button', { name: 'Save assignments' }).click();
  await expect(assignments.getByRole('row', { name: new RegExp(first.name) })).toContainText('Primary');

  await assignments.getByRole('checkbox', { name: 'Select ' + second.name }).check();
  await assignments.getByRole('button', { name: 'Add selected as additional' }).click();
  await expect(assignments.getByRole('row', { name: new RegExp(second.name) })).toContainText('Additional');

  await assignments.getByRole('button', { name: 'Edit assignments for ' + first.name }).click();
  const read = () => command<AssignmentRead>(page, { read: 'categories', id: destination, q: key, scope: 'search' });
  const changed = (await read()).assignments.products.find(row => row.id === first.id)!;
  await command(page, { action: 'product.assignments', input: {
    productId: first.id, revision: changed.revision, primaryCategoryId: destination, secondaryCategoryIds: [],
  } });
  await form.getByRole('combobox', { name: 'Primary category' }).selectOption(existing);
  await form.getByRole('button', { name: 'Save assignments' }).click();
  await expect(form.getByRole('alert')).toContainText('Reload its category assignments');
  await expect(form.getByRole('combobox', { name: 'Primary category' })).toHaveValue(existing);
  page.once('dialog', dialog => dialog.accept());
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();

  const lifecycle = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Category impact', exact: true }) });
  await lifecycle.getByRole('button', { name: 'Check category impact' }).click();
  await expect(lifecycle).toContainText('1 primary assignments');
  await expect(lifecycle).toContainText('1 additional assignments');
  await lifecycle.getByRole('combobox', { name: 'Move to parent' }).selectOption(sourceBranch);
  page.once('dialog', dialog => dialog.accept());
  await lifecycle.getByRole('button', { name: 'Move category', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Category breadcrumb' })).toContainText(names[sourceBranch]);
  await page.reload();
  const saved = await read();
  expect(saved.categories.find(row => row.id === destination)).toMatchObject({ id: destination, parentId: sourceBranch });
  const history = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Category change history' }) });
  const moveHistory = history.getByRole('row').filter({ hasText: 'Parent category changed' }).first();
  await expect(moveHistory.getByRole('cell').nth(1)).toHaveText(/\w/);
  expect(saved.assignments.products).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: first.id, primaryCategoryId: destination, secondaryCategoryIds: [] }),
    expect.objectContaining({ id: second.id, primaryCategoryId: existing, secondaryCategoryIds: [destination] }),
  ]));

  await page.goto(catalog + '?record=' + archive);
  await lifecycle.getByRole('button', { name: 'Check category impact' }).click();
  page.once('dialog', dialog => dialog.accept());
  await lifecycle.getByRole('button', { name: 'Archive category' }).click();
  await expect(page.getByRole('row', { name: new RegExp(names[archive]) })).toContainText('ARCHIVED');

  await page.goto('/admin/dashboard/product-details/' + first.id);
  const newArrivals = page.getByRole('checkbox', { name: 'Include in New arrivals collections' });
  const featured = page.getByRole('checkbox', { name: 'Include in Featured products collections' });
  await newArrivals.check();
  await featured.check();
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(page.getByText('Product saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(newArrivals).toBeChecked();
  await expect(featured).toBeChecked();

  const collectionId = key + '-manual';
  await command(page, { action: 'collection.save', input: { id: collectionId, slug: collectionId,
    expectedRevision: null, name: key + ' collection', description: '', selection: 'CURATED', position: 0, image: null } });
  await page.goto(`/admin/dashboard/catalog-collections?collection=${collectionId}`);
  const curated = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Curated products' }) });
  let releaseSearch = () => {};
  let releaseSave = () => {};
  const delayedSearch = new Promise<void>(resolve => { releaseSearch = resolve; });
  const delayedSave = new Promise<void>(resolve => { releaseSave = resolve; });
  await page.route('**/admin/api/connected-catalog', async route => {
    const operation = route.request().postDataJSON()?.request;
    if (operation?.read === 'collection-products') await delayedSearch;
    else if (operation?.action === 'collection.products') await delayedSave;
    else return route.fallback();
    await route.continue();
  });
  const query = curated.getByRole('searchbox', { name: 'Product name or SKU' });
  await query.fill(key);
  await curated.getByRole('button', { name: 'Search products' }).click();
  try {
    await expect(curated.getByRole('status').filter({ hasText: 'Searching products' })).toBeVisible();
    await expect(query).toBeDisabled();
  } finally { releaseSearch(); }
  const add = curated.getByRole('button', { name: 'Add', exact: true });
  await expect(add).toHaveCount(2);
  await add.first().click();
  await add.last().click();
  await curated.getByRole('button', { name: 'Move ' + second.name + ' up' }).click();
  await curated.getByRole('button', { name: 'Save product order' }).click();
  try {
    await expect(curated.getByRole('button', { name: 'Move ' + first.name + ' up' })).toBeDisabled();
    await expect(curated.getByRole('button', { name: 'Remove', exact: true }).first()).toBeDisabled();
  } finally { releaseSave(); }
  await expect(query).toHaveValue('');
  await page.reload();
  const ordered = curated.getByRole('button', { name: /^Move .* up$/ });
  await expect(ordered).toHaveCount(2);
  await expect(ordered.first()).toHaveAccessibleName('Move ' + second.name + ' up');
  await expect(ordered.last()).toHaveAccessibleName('Move ' + first.name + ' up');
});
