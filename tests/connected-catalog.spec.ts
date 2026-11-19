import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const adminOrigin = process.env.GRIIP_CONNECTED_TEST_ADMIN_ORIGIN!;
const storefrontOrigin = process.env.GRIIP_CONNECTED_TEST_STOREFRONT_ORIGIN!;
const admin = '/admin';
const image = { src: '/catalog/phone-stand.webp', alt: 'Phone stand fixture image' };

async function signIn(page: Page, phone: string) {
  await page.goto(`${admin}/sign-in`);
  await page.getByLabel('Phone Number').fill(phone);
  await page.getByLabel('Password').fill(fixturePassword());
  await page.getByRole('button', { name: 'Login' }).click();
}

async function command(page: Page, request: object, region = 'BD') {
  const response = await page.request.post(`${admin}/api/connected-catalog`, {
    headers: { Origin: adminOrigin }, data: { region, request },
  });
  const payload = await response.json();
  expect(response.status(), JSON.stringify(payload)).toBe(200);
  return payload.data;
}

test('the existing admin session edits the same catalog on desktop and mobile', async ({ page }) => {
  await page.route('**/*', route => {
    const origin = new URL(route.request().url()).origin;
    return origin === adminOrigin || origin === storefrontOrigin ? route.continue() : route.abort();
  });
  const tag = randomUUID().slice(0, 8);
  const name = `Admin fixture ${tag}`;
  const slug = `admin-fixture-${tag}`;
  const sku = `ADMIN-FIXTURE-${tag.toUpperCase()}`;
  const categories = `${admin}/dashboard/categories`;

  const anonymous = await page.request.post(`${admin}/api/connected-catalog`, {
    headers: { Origin: adminOrigin }, data: { region: 'BD', request: { read: 'categories' } },
  });
  expect(anonymous.status()).toBe(401);
  expect((await page.request.get(`${storefrontOrigin}/staff/catalog/taxonomy`, { maxRedirects: 0 })).status()).toBe(401);
  await signIn(page, '01000000001');
  await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);
  await page.goto(categories);
  await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cart', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'New category', exact: true }).click();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create category' }) });
  await form.getByLabel('Name', { exact: true }).fill(name);
  await form.getByLabel('Short name', { exact: true }).fill(`Fixture ${tag}`);
  await form.getByLabel('Slug', { exact: true }).fill(slug);
  await form.getByRole('combobox', { name: 'Level', exact: true }).selectOption('DEPARTMENT');
  await form.getByRole('combobox', { name: 'State', exact: true }).selectOption('ACTIVE');
  await form.getByLabel('Category image path').fill(image.src);
  await form.getByLabel('Category image alternative text').fill(image.alt);
  await form.getByRole('button', { name: 'Create category' }).click();
  await expect(page).toHaveURL(/record=cat-/);
  const rootId = new URL(page.url()).searchParams.get('record')!;
  await page.reload();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

  for (const [kind, parentId, suffix] of [['CATEGORY', rootId, 'middle'], ['SUBCATEGORY', `${slug}-middle`, 'leaf']]) {
    const id = `${slug}-${suffix}`;
    await command(page, { action: 'category.save', input: {
      id, revision: null, kind, parentId, state: 'ACTIVE', name: `${name} ${suffix}`,
      shortName: `Fixture ${suffix}`, slug: id, description: '', position: 0, image,
    } });
  }

  const warehouseName = `Dispatch fixture ${tag}`;
  await page.goto(`${admin}/dashboard/check-outlet-stocks?region=BD`);
  const warehouseSection = page.getByRole('region', { name: 'Dispatch warehouses' });
  await warehouseSection.getByText('Add a dispatch warehouse', { exact: true }).click();
  const warehouseForm = warehouseSection.getByRole('form', { name: 'Create dispatch warehouse' });
  await warehouseForm.getByRole('textbox', { name: 'Warehouse name' }).fill(warehouseName);
  await warehouseForm.getByRole('spinbutton', { name: 'Dispatch priority' }).fill('40');
  await warehouseForm.getByRole('button', { name: 'Create warehouse', exact: true }).click();
  await expect(warehouseSection.getByRole('row', { name: new RegExp(warehouseName) })).toBeVisible();
  const savedWarehouses = await command(page, { read: 'warehouses' });
  const warehouseId: string = savedWarehouses.locations.find((row: { name: string }) => row.name === warehouseName).id;
  const replay = await command(page, { action: 'inventory.warehouse.create', input: {
    id: warehouseId, marketId: 'bd', name: warehouseName, priority: 40, shopId: null,
  } });
  expect(replay).toEqual({ id: warehouseId });
  await page.reload();
  await expect(warehouseSection.getByRole('row', { name: new RegExp(warehouseName) })).toHaveCount(1);

  await page.goto(`${admin}/dashboard/create-product?region=BD`);
  await expect(page.getByRole('heading', { name: 'Create Product', exact: true, level: 1 })).toBeVisible();
  await page.getByLabel('Product name', { exact: true }).fill(name);
  await page.getByLabel('Product slug', { exact: true }).fill(slug);
  await page.getByLabel('Description', { exact: true }).fill('A shared catalog fixture for the admin acceptance test.');
  await page.getByRole('combobox', { name: 'Primary category', exact: true }).selectOption(`${slug}-leaf`);
  await page.getByLabel('Variant SKU', { exact: true }).fill(sku);
  await page.getByRole('button', { name: 'Add default variant' }).click();
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\/product-details\//);
  const productId = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)!);
  await page.reload();
  const editor = page.getByRole('navigation', { name: 'Product editor sections' });
  for (const section of ['Options and variants', 'Compatibility', 'Media', 'Offers and prices', 'Inventory', 'Change history']) {
    await expect(editor.getByRole('link', { name: section, exact: true })).toBeVisible();
  }
  await expect(page.getByText(sku, { exact: true }).first()).toBeVisible();
  const product = await command(page, { read: 'product', id: productId });
  expect(product.shared.variants).toMatchObject([{ sku, isDefault: true }]);
  expect(product.commerce.market.currency).toBe('BDT');
  const international = await command(page, { read: 'product', id: productId }, 'INTERNATIONAL');
  expect(international.shared.variants[0].id).toBe(product.shared.variants[0].id);
  expect(international.commerce.market.currency).toBe('USD');
  const media = page.locator('#media');
  await media.getByRole('combobox', { name: 'Gallery', exact: true }).selectOption(product.shared.variants[0].id);
  await media.getByRole('button', { name: 'Add image', exact: true }).click();
  await media.getByRole('textbox', { name: 'Image path 1' }).fill(image.src);
  await media.getByRole('textbox', { name: 'Alternative text 1' }).fill(`${sku} variant image`);
  await media.getByRole('button', { name: 'Save gallery', exact: true }).click();
  await expect.poll(async () => (await command(page, { read: 'product', id: productId })).shared.variants[0].images[0]?.alt)
    .toBe(`${sku} variant image`);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Product editor sections' })).toBeVisible();
  const variantId: string = product.shared.variants[0].id;
  const key = `fixture mount ${tag}`;
  for (const model of ['One', 'Two']) {
    await command(page, { action: 'device.save', input: {
      id: `${slug}-${model.toLowerCase()}`, brand: 'Browser Fixture', name: `${tag} ${model}`, revision: null,
      aliases: [`${key} ${model}`],
    } });
  }
  const fitment = page.locator('#compatibility');
  await fitment.getByRole('searchbox', { name: 'Search devices' }).fill(key);
  await fitment.getByRole('button', { name: 'Find devices' }).click();
  for (const model of ['One', 'Two']) await fitment.getByRole('button', { name: `Link ${tag} ${model}` }).click();
  await fitment.getByRole('button', { name: 'Save compatibility' }).click();
  await expect.poll(async () => (await command(page, { read: 'product', id: productId })).shared.variants[0].compatibility.length).toBe(2);

  let workspace = await command(page, { read: 'product', id: productId });
  await command(page, { action: 'product.gallery', input: { productId, revision: workspace.shared.revision, images: [image] } });
  for (const [region, marketId] of [['BD', 'bd'], ['INTERNATIONAL', 'us']]) {
    workspace = await command(page, { read: 'product', id: productId }, region);
    if (!workspace.commerce.warehouses.find((row: { id: string }) => row.id === warehouseId)?.route) {
      await command(page, { action: 'inventory.route', input: {
        productId, marketId, locationId: warehouseId, expected: null, active: true, priority: 40, districts: [], methods: [],
      } }, region);
    }
  }
  await page.reload();
  const inventory = page.locator('#inventory');
  await inventory.getByRole('combobox', { name: 'Stock variant', exact: true }).selectOption(variantId);
  await inventory.getByRole('combobox', { name: 'Stock warehouse', exact: true }).selectOption(warehouseId);
  await inventory.getByRole('button', { name: 'Open stock pool', exact: true }).click();
  await inventory.getByRole('button', { name: 'Record stock', exact: true }).click();
  await inventory.getByRole('spinbutton', { name: 'Stock units', exact: true }).fill('3');
  await inventory.getByRole('textbox', { name: 'Movement reason', exact: true }).fill('Synthetic receipt');
  await inventory.getByRole('textbox', { name: 'Movement reference', exact: true }).fill(sku);
  await inventory.getByRole('button', { name: 'Record movement', exact: true }).click();
  await expect(inventory.getByText('Stock movement recorded.', { exact: true })).toBeVisible();
  await inventory.getByText('Recent stock movements and allocations', { exact: true }).click();
  await expect(inventory.getByRole('table', { name: 'Recent stock movements' })).toContainText('+3');
  const [bdStock, usStock] = await Promise.all(['BD', 'INTERNATIONAL'].map(region => command(page, { read: 'inventory', q: sku }, region)));
  expect(bdStock.rows).toMatchObject([{ sku, onHand: 3, available: 3, warehouseId }]);
  expect(usStock.rows).toMatchObject([{ id: bdStock.rows[0].id, sku, onHand: 3, available: 3, warehouseId }]);
  expect((await command(page, { read: 'warehouses' }, 'INTERNATIONAL')).locations)
    .toEqual(expect.arrayContaining([expect.objectContaining({ id: warehouseId, name: warehouseName, marketId: 'bd' })]));

  const offers = page.locator('#markets');
  await offers.getByRole('button', { name: `Add offer for ${sku}`, exact: true }).click();
  const offerForm = offers.getByRole('form', { name: `Offer for ${sku}` });
  await offerForm.getByRole('combobox', { name: 'Offer status' }).selectOption('ACTIVE');
  await offerForm.getByRole('textbox', { name: 'Regular price (BDT)', exact: true }).fill('950');
  await offerForm.getByRole('checkbox', { name: 'Enable purchase in Bangladesh' }).check();
  await offerForm.getByRole('button', { name: 'Save offer', exact: true }).click();
  await expect(offers.getByText(`Offer saved for ${sku} in Bangladesh.`, { exact: true })).toBeVisible();
  workspace = await command(page, { read: 'product', id: productId });
  expect(workspace.commerce.variants[0].offer).toMatchObject({ amountMinor: 95000, currency: 'BDT', eligible: true });
  expect((await command(page, { read: 'product', id: productId }, 'INTERNATIONAL')).commerce.variants[0].offer).toBeNull();
  await page.getByRole('button', { name: 'Publish product', exact: true }).click();
  await expect.poll(async () => (await command(page, { read: 'product', id: productId })).shared.publication).toBe('ACTIVE');
  const crossOrigin = await page.request.post(`${admin}/api/connected-catalog`, {
    headers: { Origin: storefrontOrigin }, data: { region: 'BD', request: { read: 'product', id: productId } },
  });
  expect(crossOrigin.status()).toBe(403);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const view of ['attributes', 'menus', 'collections']) {
    await page.goto(`${categories}?view=${view}`);
    await expect(page.getByRole('navigation', { name: 'Catalog organization' })).toBeVisible();
  }
  await page.goBack();
  await expect(page).toHaveURL(/view=menus/);
  await page.goto(`${storefrontOrigin}/products/${slug}?market=bd&variant=${variantId}`);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: `${sku} variant image`, exact: true }).first()).toBeVisible();
  await page.getByRole('combobox', { name: 'Delivery district' }).selectOption('dhaka');
  await page.getByRole('combobox', { name: 'Delivery service' }).selectOption('COD:standard');
  await page.getByRole('button', { name: 'Check delivery', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add to cart', exact: true })).toBeEnabled();
  const aliasSearch = await page.request.get(`${storefrontOrigin}/api/catalog/search?${new URLSearchParams({ market: 'bd', q: `${key} One` })}`);
  expect(aliasSearch.status()).toBe(200);
  expect((await aliasSearch.json()).items).toEqual(expect.arrayContaining([expect.objectContaining({ id: productId, matchedVariantId: variantId })]));

  if (process.env.GRIIP_CONNECTED_TEST_SCOPED_ROLES === '1') {
    await page.goto(`${admin}/dashboard/product-details/${productId}`);
    await page.getByRole('button', { name: 'Logout' }).click();
    await signIn(page, '01000000006');
    await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);
    const readOnlyProduct = await command(page, { read: 'product', id: productId });
    expect(readOnlyProduct.shared).toBeNull();
    expect(readOnlyProduct.commerce.variants[0].offer.amountMinor).toBe(95000);
    expect(readOnlyProduct.commerce.pools).toEqual([]);
    expect(readOnlyProduct.commerce.movements).toEqual([]);
    expect(readOnlyProduct.commerce.allocations).toEqual([]);
    await page.goto(`${admin}/dashboard/product-details/${productId}`);
    await expect(page.getByRole('heading', { name: 'Offers and prices' })).toBeVisible();
    await expect(page.getByRole('button', { name: `Edit offer for ${sku}` })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toHaveCount(0);
    for (const request of [{ read: 'inventory' }, { action: 'offer.configure', input: {} }]) {
      const result = await page.request.post(`${admin}/api/connected-catalog`, {
        headers: { Origin: adminOrigin }, data: { region: 'BD', request },
      });
      expect(result.status()).toBe(403);
    }
    const otherMarket = await page.request.post(`${admin}/api/connected-catalog`, {
      headers: { Origin: adminOrigin }, data: { region: 'INTERNATIONAL', request: { read: 'product', id: productId } },
    });
    expect(otherMarket.status()).toBe(403);
  }
});

test('category settings, attribute rules, collections and menus persist in the connected catalog', async ({ page }) => {
  await page.route('**/*', route => {
    const origin = new URL(route.request().url()).origin;
    return origin === adminOrigin || origin === storefrontOrigin ? route.continue() : route.abort();
  });
  await signIn(page, '01000000001');
  await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);
  const tag = randomUUID().slice(0, 8);
  const categoryId = `taxonomy-fixture-${tag}`;
  const slug = `taxonomy-slug-${tag}`;
  const name = `Taxonomy fixture ${tag}`;
  const catalog = `${admin}/dashboard`;
  await page.goto(`${catalog}/update-category/fixture-category`);
  await expect(page.getByRole('heading', { name: 'Recovered category records', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixture category', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save category', exact: true })).toHaveCount(0);
  await command(page, { action: 'category.save', input: { id: categoryId, slug, name, revision: null, kind: 'DEPARTMENT',
    description: '', shortName: `Taxonomy ${tag}`, parentId: null, state: 'ACTIVE', position: 20, image } });
  await page.goto(`${catalog}/update-category/${slug}`);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const category = async (region = 'BD') => {
    const result = await command(page, { read: 'categories', id: categoryId }, region);
    return result.categories.find((row: { id: string }) => row.id === categoryId);
  };
  const translations = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Translations', exact: true }) });
  await translations.getByLabel('Language tag').fill('bn-BD');
  await translations.getByLabel('Localized name', { exact: true }).fill('বাংলা বিভাগ');
  await translations.getByLabel('Localized short name').fill('বিভাগ');
  await translations.getByLabel('Localized slug').fill(`bn-${slug}`);
  await translations.getByRole('button', { name: 'Save translation' }).click();
  await expect.poll(async () => (await category()).translations).toMatchObject([{ locale: 'bn-BD', name: 'বাংলা বিভাগ' }]);
  await page.reload();
  await expect(translations.getByLabel('Localized name', { exact: true })).toHaveValue('বাংলা বিভাগ');

  await page.getByRole('combobox', { name: 'Navigation visibility', exact: true }).selectOption('hide');
  await page.getByLabel('Market display order').fill('3');
  await page.getByRole('button', { name: 'Save market presentation' }).click();
  await expect.poll(async () => (await category()).marketPresentations).toMatchObject([{ visibleInNavigation: false, position: 3 }]);
  expect((await category('INTERNATIONAL')).marketPresentations).toEqual([]);

  await page.goto(`${catalog}/category-attributes?category=${categoryId}`);
  const attributeId = `test-attribute-${tag}`;
  const attributeName = `Finish ${tag}`;
  await page.getByLabel('Stable attribute ID').fill(attributeId);
  await page.getByLabel('Display name').fill(attributeName);
  await page.getByRole('button', { name: 'Save definition' }).click();
  const select = page.getByRole('combobox', { name: 'Attribute', exact: true });
  await expect(select).toContainText(attributeName);
  await select.selectOption(attributeId);
  await page.getByRole('checkbox', { name: 'Filterable', exact: true }).check();
  await page.getByRole('button', { name: 'Preview rule change' }).click();
  await expect(page.getByText('0 affected products · 0 published')).toBeVisible();
  await page.getByRole('button', { name: 'Save reviewed change' }).click();
  await expect(page.getByRole('row').filter({ hasText: attributeName })).toContainText('Optional · Filterable');
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: attributeName })).toContainText('This category');

  const collectionSlug = `new-fixture-${tag}`;
  await page.goto(`${catalog}/catalog-collections?collection=new`);
  await page.getByLabel('Collection name').fill(`Collection ${tag}`);
  await page.getByLabel('Slug', { exact: true }).fill(collectionSlug);
  await page.getByRole('combobox', { name: 'Product selection', exact: true }).selectOption('NEW');
  await page.getByRole('button', { name: 'Save collection' }).click();
  await expect(page).toHaveURL(/collection=collection-/);
  const collectionId = new URL(page.url()).searchParams.get('collection')!;
  await page.getByRole('button', { name: 'Publish in this market' }).click();
  await expect(page.getByRole('button', { name: 'Hide from this market' })).toBeVisible();
  const publicCollection = await page.request.get(`${storefrontOrigin}/api/catalog/collections/${collectionSlug}?market=bd`);
  expect(publicCollection.status()).toBe(200);
  expect((await publicCollection.json()).collection).toMatchObject({ id: collectionId, selection: 'NEW' });
  expect((await page.request.get(`${storefrontOrigin}/api/catalog/collections/${collectionSlug}?market=us`)).status()).toBe(404);

  const menuKey = `menu-${tag}`;
  await page.goto(`${catalog}/catalog-menus?menuKey=${menuKey}`);
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('combobox', { name: 'Target type', exact: true }).selectOption('category');
  await page.getByRole('combobox', { name: 'Destination', exact: true }).selectOption(categoryId);
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('combobox', { name: 'Target type', exact: true }).last().selectOption('collection');
  await page.getByRole('combobox', { name: 'Destination', exact: true }).last().selectOption(collectionId);
  await expect(page.getByRole('navigation', { name: 'Menu preview' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save menu' }).click();
  const menuHref = `${storefrontOrigin}/api/catalog/navigation?market=bd&key=${menuKey}`;
  await expect.poll(async () => (await page.request.get(menuHref)).status()).toBe(200);
  const menu = await (await page.request.get(menuHref)).json();
  expect(menu.items).toMatchObject([{ target: { type: 'collection', id: collectionId } }]);
  expect(menu.items).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Destination', exact: true }).last()).toHaveValue(collectionId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('legacy customer and limited staff cannot use the bridged editor', async ({ page }) => {
  await signIn(page, '01000000002');
  await expect(page).toHaveURL(/\/admin\/sign-in/);
  const read = { region: 'BD', request: { read: 'categories' } };
  let result = await page.request.post(`${admin}/api/connected-catalog`, { headers: { Origin: adminOrigin }, data: read });
  expect(result.status()).toBe(401);
  await signIn(page, '01000000003');
  await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);
  result = await page.request.post(`${admin}/api/connected-catalog`, { headers: { Origin: adminOrigin }, data: read });
  expect(result.status()).toBe(403);
});

test('approved device aliases and isolated search maintenance persist in the main admin', async ({ page }) => {
  await page.route('**/*', route => {
    const origin = new URL(route.request().url()).origin;
    return origin === adminOrigin || origin === storefrontOrigin ? route.continue() : route.abort();
  });
  await signIn(page, '01000000001');
  await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);
  const discovery = `${admin}/dashboard/catalog-devices`;
  const tag = randomUUID().slice(0, 8);
  await page.goto(discovery);
  await expect(page.getByRole('heading', { name: 'Approved device models' })).toBeVisible();
  await page.getByRole('link', { name: 'Add a device model' }).click();
  await page.getByLabel('Brand', { exact: true }).fill('Synthetic');
  await page.getByLabel('Model name', { exact: true }).fill(`Travel ${tag}`);
  const aliases = page.getByRole('textbox', { name: 'Approved aliases', exact: true });
  await aliases.fill(`Pouch ${tag}`);
  await page.getByRole('button', { name: 'Save device model' }).click();
  await expect(page).toHaveURL(/model=device-/);
  const modelId = new URL(page.url()).searchParams.get('model');
  await aliases.fill(`Carry ${tag}\nLift ${tag}`);
  await page.getByRole('button', { name: 'Save device model' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'updated the model' })).toHaveCount(2);
  await page.reload();
  await expect(aliases).toHaveValue(`Carry ${tag}\nLift ${tag}`);
  await page.getByRole('searchbox', { name: 'Device model search' }).fill(`Lift ${tag}`);
  await page.getByRole('button', { name: 'Search models' }).click();
  await expect(page.getByRole('row', { name: new RegExp(`Synthetic Travel ${tag}`) })).toBeVisible();
  await page.getByRole('link', { name: `Edit Travel ${tag}` }).click();
  await expect(page).toHaveURL(/model=device-/);
  expect(new URL(page.url()).searchParams.get('model')).toBe(modelId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto(`${admin}/dashboard/catalog-search`);
  await expect(page.getByRole('heading', { name: 'Catalog search maintenance' })).toBeVisible();
  await expect(page.getByRole('row', { name: /DeviceModelAlias.*Ready/ })).toBeVisible();
  await page.getByRole('button', { name: 'Run search reconciliation' }).click();
  await expect(page.getByText('Search reconciliation completed.')).toBeVisible();
  await expect(page.getByRole('row', { name: /Search reconciliation.*Exact SKU: Matched/ }).first()).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Rebuild search indexes' }).click();
  await expect(page.getByText('Shared catalog indexes rebuilt.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('row', { name: /Shared index rebuild.*15 relations rebuilt/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
