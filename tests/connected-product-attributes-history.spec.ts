import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { ProductWorkspace } from '../src/components/connected-catalog-product/contracts';
import { fixturePassword } from './fixture-password';

const adminOrigin = process.env.GRIIP_CONNECTED_TEST_ADMIN_ORIGIN!;
const storefrontOrigin = process.env.GRIIP_CONNECTED_TEST_STOREFRONT_ORIGIN!;
const image = { src: '/catalog/phone-stand.webp', alt: 'Synthetic catalog fixture image' };

async function command<T = unknown>(page: Page, request: object, status = 200): Promise<T> {
  const response = await page.request.post('/admin/api/connected-catalog', {
    headers: { Origin: adminOrigin },
    data: { region: 'BD', request },
  });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(status);
  return response.ok() ? body.data : body.error;
}

test('product attributes, stale placement changes and attributed history survive reload', async ({ page }) => {
  test.setTimeout(150_000);
  await page.context().route(url => url.origin !== adminOrigin && url.origin !== storefrontOrigin, route => route.abort());
  await page.goto('/admin/sign-in');
  await page.getByLabel('Phone Number').fill('01000000001');
  await page.getByLabel('Password').fill(fixturePassword());
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);

  const tag = 'typed-' + randomUUID().slice(0, 8);
  const root = tag + '-root';
  const branch = tag + '-branch';
  const spare = tag + '-spare';
  const category = tag + '-typed-leaf';
  const openCategory = tag + '-open-leaf';
  const weight = tag + '-weight';
  const washable = tag + '-washable';
  const finish = tag + '-finish';
  const optionId = 'finish';
  const variant = [0, 1].map(index => ({
    id: `v-${tag}-${index}`, sku: `${tag.toUpperCase()}-${index}`, selections: { [optionId]: ['matte', 'gloss'][index] },
  }));
  for (const [id, kind, parentId] of [
    [root, 'DEPARTMENT', null], [branch, 'CATEGORY', root], [spare, 'CATEGORY', root],
    [category, 'SUBCATEGORY', branch], [openCategory, 'SUBCATEGORY', spare],
  ]) {
    await command(page, { action: 'category.save', input: {
      id, kind, parentId, slug: id, name: id, shortName: id, description: '', position: 0, revision: null, state: 'ACTIVE', image,
    } });
  }
  const definitions = [
    { id: weight, name: 'Fixture weight', scope: 'PRODUCT', dataType: 'NUMBER' },
    { id: washable, name: 'Fixture washable', scope: 'VARIANT', dataType: 'BOOLEAN' },
    { id: finish, name: 'Fixture finish', scope: 'VARIANT', dataType: 'ENUM', variantOptionKey: finish, allowedValues: ['Matte', 'Gloss'] },
  ];
  for (const [expectedRevision, definition] of definitions.entries()) {
    await command(page, { action: 'attribute.save', input: definition });
    await command(page, { action: 'category.attribute', input: {
      departmentId: branch, attributeId: definition.id, expectedRevision,
      template: { required: true, filterable: true, position: expectedRevision, inheritable: true },
    } });
  }
  const draft = {
    id: tag, slug: tag, name: 'Typed attribute fixture ' + tag, description: 'Fixture product for scoped attribute and history verification.',
    primaryCategoryId: category, expectedRevision: null, publication: 'DRAFT',
    options: [{ id: optionId, key: finish, label: 'Finish', values: [
      { id: 'matte', value: 'Matte', label: 'Matte display' }, { id: 'gloss', value: 'Gloss', label: 'Gloss display' },
    ] }],
    variants: variant, defaultVariantId: variant[0].id,
  };
  await command(page, { action: 'product.save', input: draft });
  const readProduct = () => command<ProductWorkspace>(page, { read: 'product', id: tag });
  await page.goto(`/admin/dashboard/product-details/${tag}?region=BD`);

  const shared = page.locator('#categories');
  const variations = page.locator('#variants');
  const sharedWeight = shared.getByRole('spinbutton', { name: 'Fixture weight' });
  const variantPicker = variations.getByRole('combobox', { name: 'Variant for attributes' });
  const variantWashable = variations.getByRole('combobox', { name: 'Fixture washable' });
  const save = page.getByRole('button', { name: 'Save product', exact: true });
  await expect(sharedWeight).toHaveAccessibleDescription(new RegExp(`Required for publication.*Inherited from ${branch}`));
  await expect(shared.getByLabel('Fixture washable')).toHaveCount(0);
  await expect(variations.getByLabel('Fixture weight')).toHaveCount(0);
  await expect(variations.getByLabel('Fixture finish')).toHaveCount(0);
  await expect(variations.getByText(`Matte · Uses the ${finish} option`, { exact: true })).toBeVisible();
  await sharedWeight.fill('12.5');
  await variantWashable.selectOption('true');
  await variantPicker.selectOption(variant[1].id);
  await expect(variations.getByText(`Gloss · Uses the ${finish} option`, { exact: true })).toBeVisible();
  await variantWashable.selectOption('false');
  await save.click();
  await expect(page.getByText('Product saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(sharedWeight).toHaveValue('12.5');
  await expect(variantWashable).toHaveValue('true');
  await variantPicker.selectOption(variant[1].id);
  await expect(variantWashable).toHaveValue('false');

  const saved = (await readProduct()).shared!;
  const values = [{ [washable]: true }, { [washable]: false }];
  const typedVariants = variant.map((row, index) => ({ ...row, attributeValues: values[index] }));
  expect(saved.attributeValues).toEqual({ [weight]: 12.5 });
  expect(saved.variants.map(row => row.attributeValues)).toEqual(values);
  const typed = { ...draft, expectedRevision: saved.revision, attributeValues: { [weight]: 12.5 }, variants: typedVariants };
  for (const [change, message] of [
    [{ attributeValues: { [weight]: '12.5' } }, /invalid value/],
    [{ variants: [{ ...typedVariants[0], attributeValues: { [washable]: true, [finish]: 'Gloss' } }, typedVariants[1]] }, /use variant option/],
    [{ options: [{ ...draft.options[0], values: [{ id: 'matte', value: 'Unknown', label: 'Matte display' }, draft.options[0].values[1]] }] }, /outside the category template/],
  ] as const) {
    const error = await command<string>(page, { action: 'product.save', input: { ...typed, ...change } }, 422);
    expect(error).toMatch(message);
  }

  await sharedWeight.fill('14.5');
  await command(page, { action: 'product.save', input: { ...typed, attributeValues: { [weight]: 16 } } });
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'This product changed. Reload before saving.' })).toBeVisible();
  await expect(sharedWeight).toHaveValue('14.5');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.reload();
  await expect(sharedWeight).toHaveValue('16');

  const warehouse = randomUUID();
  const warehouseName = 'History fixture warehouse ' + tag;
  await command(page, { action: 'inventory.warehouse.create', input: {
    id: warehouse, name: warehouseName, marketId: 'bd', shopId: null, priority: 80,
  } });
  const setup = await readProduct();
  if (!setup.commerce?.warehouses.find(row => row.id === warehouse)?.route) {
    await command(page, { action: 'inventory.route', input: {
      productId: tag, marketId: 'bd', locationId: warehouse, expected: null, active: true, priority: 80, districts: [], methods: [],
    } });
  }
  await command(page, { action: 'product.gallery', input: { productId: tag, revision: setup.shared!.revision, images: [image] } });
  for (const row of variant) {
    await command(page, { action: 'inventory.initialize', input: { productId: tag, marketId: 'bd', variantId: row.id, locationId: warehouse } });
  }
  await page.reload();
  const offers = page.locator('#markets');
  for (const row of variant) {
    await offers.getByRole('button', { name: `Add offer for ${row.sku}`, exact: true }).click();
    const offer = offers.getByRole('form', { name: `Offer for ${row.sku}` });
    await offer.getByRole('combobox', { name: 'Offer status' }).selectOption('ACTIVE');
    await offer.getByRole('textbox', { name: 'Regular price (BDT)', exact: true }).fill('899');
    await offer.getByRole('checkbox', { name: 'Enable purchase in Bangladesh' }).check();
    await offer.getByRole('button', { name: 'Save offer', exact: true }).click();
    await expect(offers.getByText(`Offer saved for ${row.sku} in Bangladesh.`, { exact: true })).toBeVisible();
  }
  await page.reload();
  const inventory = page.locator('#inventory');
  const reference = tag + '-private-inbound';
  await inventory.getByRole('button', { name: 'Record stock', exact: true }).first().click();
  await inventory.getByRole('spinbutton', { name: 'Stock units', exact: true }).fill('4');
  await inventory.getByRole('textbox', { name: 'Movement reason', exact: true }).fill('Synthetic receipt');
  await inventory.getByRole('textbox', { name: 'Movement reference', exact: true }).fill(reference);
  await inventory.getByRole('button', { name: 'Record movement', exact: true }).click();
  await expect(inventory.getByText('Stock movement recorded.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Publish product', exact: true }).click();
  await expect(page.getByText('Product published.', { exact: true })).toBeVisible();
  await page.reload();

  const history = page.getByRole('region', { name: 'Change history', exact: true });
  const productEdit = history.getByRole('row').filter({ hasText: 'Variant attributes' }).first();
  const actor = (await productEdit.getByRole('cell').last().innerText()).trim();
  expect(actor).toBeTruthy();
  await expect(history.getByRole('row').filter({ hasText: 'Product publication changed · ACTIVE' }).last()).toContainText(actor);
  await expect(history.getByRole('row').filter({ hasText: 'Market offer updated · BD' }).first()).toContainText(actor);
  const stock = history.getByRole('row').filter({ hasText: 'Stock receipt (+4)' });
  await expect(stock).toContainText(warehouseName);
  await expect(stock.getByRole('cell').last()).toHaveText(actor);
  expect(JSON.stringify((await readProduct()).history)).not.toContain(reference);
  await expect(history).not.toContainText(reference);

  const product = await page.request.get(`${storefrontOrigin}/api/catalog/products/${tag}?market=bd`);
  expect(product.ok(), await product.text()).toBe(true);
  const publicProduct = await product.json();
  expect(publicProduct.product.attributes).toMatchObject({ [weight]: 16 });
  expect(publicProduct.variants).toMatchObject([
    { attributes: { [washable]: true }, options: [{ key: finish, value: 'Matte' }] },
    { attributes: { [washable]: false }, options: [{ key: finish, value: 'Gloss' }] },
  ]);
  expect(publicProduct.variants[0].attributes).not.toHaveProperty(finish);

  await shared.getByRole('combobox', { name: 'Primary category', exact: true }).selectOption(openCategory);
  await shared.getByRole('button', { name: `Remove ${weight}`, exact: true }).click();
  await expect(variantPicker).toHaveValue(variant[0].id);
  await variations.getByRole('button', { name: `Remove ${washable}`, exact: true }).click();
  await expect(variantPicker).toHaveValue(variant[1].id);
  await variations.getByRole('button', { name: `Remove ${washable}`, exact: true }).click();
  await expect(variantPicker).toHaveCount(0);
  await save.click();
  await expect(page.getByText('Product saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(shared.getByRole('combobox', { name: 'Primary category', exact: true })).toHaveValue(openCategory);
  const moved = (await readProduct()).shared!;
  expect(moved.attributeValues).toEqual({});
  expect(moved.variants.map(row => [row.id, row.attributeValues])).toEqual(variant.map(row => [row.id, {}]));
});
