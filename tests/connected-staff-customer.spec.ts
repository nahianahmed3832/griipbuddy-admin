import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { fixturePassword } from './fixture-password';

const adminOrigin = process.env.GRIIP_CONNECTED_TEST_ADMIN_ORIGIN!;
const storefrontOrigin = process.env.GRIIP_CONNECTED_TEST_STOREFRONT_ORIGIN!;
const dashboard = '/admin/dashboard';
const adminApi = '/admin/api/connected-catalog';
const sharedImage = { src: '/catalog/phone-stand.webp', alt: 'Acceptance shared case photo' };
const variantImage = { src: '/catalog/headphones-black.webp', alt: 'Acceptance fitted case photo' };
const store = '00000000-0000-4000-8000-000000000001';
type Region = 'BD' | 'INTERNATIONAL';

async function command(page: Page, request: object, region: Region = 'BD', status = 200) {
  const response = await page.request.post(adminApi, { headers: { Origin: adminOrigin }, data: { region, request } });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(status);
  return body.data;
}

async function publicData(page: Page, path: string) {
  const response = await page.request.get(storefrontOrigin + path);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test('one main-admin catalog reaches the storefront, purchases, packing, cancellation and return', async ({ page, browser }, testInfo) => {
  test.skip(process.env.GRIIP_CONNECTED_TEST_COMMERCE !== '1', 'Use a disposable two-market COD fixture with consented measurement.');
  test.setTimeout(240_000);
  const tag = randomUUID().slice(0, 8);
  const slug = 'acceptance-' + tag;
  const productName = 'Acceptance case ' + tag;
  const modelA = 'Atlas ' + tag;
  const modelB = 'Nova ' + tag;
  const firstSku = 'ACCEPT-' + tag.toUpperCase() + '-A';
  const secondSku = 'ACCEPT-' + tag.toUpperCase() + '-B';
  const doesNotExist = 'ACCEPT-' + tag.toUpperCase() + '-INVALID';
  const warehouseName = 'Acceptance warehouse ' + tag;
  const categoryName = 'Acceptance category ' + tag;
  const attributeId = 'waterproof-' + tag;
  const attributeName = 'Waterproof ' + tag;
  const branchId = slug + '-branch';
  const leafId = slug + '-leaf';
  const collectionSlug = slug + '-collection';
  const categories = dashboard + '/categories';
  let rootId = '';
  let firstVariant = '';
  let secondVariant = '';
  let productId = '';
  let warehouseId = '';
  let poolId = '';
  let firstOrderId = '';
  const buyerContext = await browser.newContext({ baseURL: storefrontOrigin, viewport: page.viewportSize() ?? undefined,
    isMobile: testInfo.project.use.isMobile, hasTouch: testInfo.project.use.hasTouch });
  const buyer = await buyerContext.newPage();
  await Promise.all([page.context(), buyerContext].map(context => context.route('**/*', route => {
    const origin = new URL(route.request().url()).origin;
    return origin === adminOrigin || origin === storefrontOrigin ? route.continue() : route.abort();
  })));

  const skuStock = async (region: Region = 'BD') => (await command(page, { read: 'inventory', q: firstSku }, region)).rows;
  const order = (id: string) => command(page, { read: 'order', id });
  const orderOperation = (id: string, action: string, input: object) => command(page, { action, input: { orderId: id, ...input } });
  const editProduct = () => page.goto(`${dashboard}/product-details/${productId}?region=BD`);
  const amountBD = ['৳1,299', '৳1,499'];
  const amountUSD = ['$24.99', '$28.99'];

  try {
    await test.step('A–B: create a category, inherit a filterable attribute and scope navigation by market', async () => {
      await command(page, { read: 'categories' }, 'BD', 401);
      expect((await buyer.request.get('/staff/catalog/taxonomy', { maxRedirects: 0 })).status()).toBe(401);
      await page.goto('/admin/sign-in');
      await page.getByLabel('Phone Number').fill('01000000001');
      await page.getByLabel('Password').fill(fixturePassword());
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);
      await page.goto(categories);
      await page.getByRole('link', { name: 'New category', exact: true }).click();
      const create = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create category' }) });
      await create.getByLabel('Name', { exact: true }).fill(categoryName);
      await create.getByLabel('Short name', { exact: true }).fill('Acceptance ' + tag);
      await create.getByLabel('Slug', { exact: true }).fill(slug);
      await create.getByRole('combobox', { name: 'Level', exact: true }).selectOption('DEPARTMENT');
      await create.getByRole('combobox', { name: 'State', exact: true }).selectOption('ACTIVE');
      await create.getByLabel('Category image path').fill(sharedImage.src);
      await create.getByLabel('Category image alternative text').fill(sharedImage.alt);
      await create.getByRole('button', { name: 'Create category' }).click();
      await expect(page).toHaveURL(/record=cat-/);
      rootId = new URL(page.url()).searchParams.get('record')!;
      for (const [id, kind, parentId] of [[branchId, 'CATEGORY', rootId], [leafId, 'SUBCATEGORY', branchId]]) {
        await command(page, { action: 'category.save', input: {
          id, slug: id, kind, parentId, state: 'ACTIVE', revision: null, name: id,
          shortName: id, description: '', position: 0, image: sharedImage,
        } });
      }
      await page.goto(`${categories}?record=${rootId}&region=INTERNATIONAL`);
      await page.getByRole('combobox', { name: 'Navigation visibility', exact: true }).selectOption('hide');
      await page.getByRole('button', { name: 'Save market presentation' }).click();
      await expect.poll(async () => (await command(page, { read: 'categories', id: rootId }, 'INTERNATIONAL'))
        .categories.find((entry: { id: string }) => entry.id === rootId).marketPresentations)
        .toMatchObject([{ visibleInNavigation: false }]);
      await page.goto(`${dashboard}/category-attributes?category=${branchId}`);
      await page.getByLabel('Stable attribute ID').fill(attributeId);
      await page.getByLabel('Display name').fill(attributeName);
      await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('BOOLEAN');
      await page.getByRole('button', { name: 'Save definition' }).click();
      const attribute = page.getByRole('combobox', { name: 'Attribute', exact: true });
      await expect(attribute).toContainText(attributeName);
      await attribute.selectOption(attributeId);
      await page.getByRole('checkbox', { name: 'Filterable', exact: true }).check();
      await page.getByRole('button', { name: 'Preview rule change' }).click();
      await page.getByRole('button', { name: 'Save reviewed change' }).click();
      await expect(page.getByRole('row').filter({ hasText: attributeName })).toContainText('Optional · Filterable');
    });

    await test.step('C–E: author two physical variants and save shared and per-variant galleries', async () => {
      await page.goto(`${dashboard}/create-product?region=BD`);
      await page.getByLabel('Product name', { exact: true }).fill(productName);
      await page.getByLabel('Product slug', { exact: true }).fill(slug);
      await page.getByLabel('Description', { exact: true }).fill('Two physical model and design combinations for isolated catalog acceptance.');
      await page.getByRole('combobox', { name: 'Primary category', exact: true }).selectOption(leafId);
      await page.getByRole('combobox', { name: attributeName, exact: true }).selectOption('true');
      const options = page.locator('#variants');
      const dimensions = [['Model', [modelA, modelB]], ['Design', ['Plain', 'Floral']]] as const;
      for (const [index, [label, values]] of dimensions.entries()) {
        await options.getByRole('button', { name: 'Add option', exact: true }).click();
        const dimension = options.getByRole('group').filter({ has: page.getByLabel('Option label') }).nth(index);
        await dimension.getByLabel('Option label').fill(label);
        await dimension.getByLabel('Option key').fill(label.toLowerCase());
        await dimension.getByLabel('Canonical value').fill(values[0]);
        await dimension.getByRole('button', { name: 'Add option value' }).click();
        await dimension.getByLabel('Canonical value').nth(1).fill(values[1]);
      }
      await options.getByRole('button', { name: 'Preview combinations' }).click();
      await expect(options.getByRole('checkbox', { name: `Include ${modelB} / Plain`, exact: true })).not.toBeChecked();
      for (const [tuple, sku] of [[`${modelA} / Plain`, firstSku], [`${modelB} / Floral`, secondSku]]) {
        await options.getByRole('checkbox', { name: 'Include ' + tuple, exact: true }).check();
        await options.getByLabel('SKU for ' + tuple, { exact: true }).fill(sku);
      }
      await options.getByLabel('SKU for ' + modelB + ' / Floral', { exact: true }).fill(firstSku);
      await options.getByRole('button', { name: 'Add selected combinations' }).click();
      await expect(options.getByRole('alert')).toContainText('repeats SKU');
      await options.getByLabel('SKU for ' + modelB + ' / Floral', { exact: true }).fill(secondSku);
      await options.getByRole('button', { name: 'Add selected combinations' }).click();
      await expect(options.getByRole('status').filter({ hasText: '2 variants staged' })).toBeVisible();
      await page.getByRole('button', { name: 'Create draft', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard\/product-details\//);
      productId = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)!);
      await page.reload();
      const workspace = await command(page, { read: 'product', id: productId });
      expect(workspace.shared.departmentId).toBe(leafId);
      expect(workspace.shared.variants.map((variant: { sku: string }) => variant.sku)).toEqual([firstSku, secondSku]);
      [firstVariant, secondVariant] = workspace.shared.variants.map((variant: { id: string }) => variant.id);
      const media = page.locator('#media');
      const save = media.getByRole('button', { name: 'Save gallery', exact: true });
      const add = media.getByRole('button', { name: 'Add image', exact: true });
      await add.click();
      await media.getByLabel('Image path 1').fill(sharedImage.src);
      await media.getByLabel('Alternative text 1').fill(sharedImage.alt);
      await save.click();
      await expect(media.getByText('Shared gallery saved.', { exact: true })).toBeVisible();
      await media.getByRole('combobox', { name: 'Gallery', exact: true }).selectOption(secondVariant);
      const asset = await buyer.request.get(variantImage.src);
      expect(asset.ok()).toBe(true);
      const upload = await sharp(await asset.body()).extend({
        top: 0, bottom: 48, left: 0, right: 0, background: '#' + tag.slice(0, 6),
      }).webp().toBuffer();
      await add.click();
      await media.getByLabel('Alternative text 1').fill(variantImage.alt);
      await media.getByLabel('Upload image 1').setInputFiles({
        name: 'fixture-case.webp', mimeType: 'image/webp', buffer: upload,
      });
      await expect(media.getByText('Image stored. Save the gallery to use it.', { exact: true })).toBeVisible();
      const assetPath = await media.getByLabel('Image path 1').inputValue();
      expect(assetPath).toMatch(/^\/media\//);
      expect((await buyer.request.get(assetPath)).status()).toBe(404);
      await save.click();
      await expect(media.getByText('Variant gallery saved.', { exact: true })).toBeVisible();
      await page.reload();
      await expect(media.getByRole('img', { name: sharedImage.alt }).first()).toBeVisible();
      await media.getByRole('combobox', { name: 'Gallery', exact: true }).selectOption(secondVariant);
      await expect(media.getByRole('img', { name: variantImage.alt }).first()).toBeVisible();
    });

    await test.step('F–H: configure two-market offers, one auditable warehouse pool per SKU and a public collection', async () => {
      await page.goto(`${dashboard}/check-outlet-stocks?region=BD`);
      const warehouses = page.getByRole('region', { name: 'Dispatch warehouses' });
      await warehouses.getByText('Add a dispatch warehouse', { exact: true }).click();
      const create = warehouses.getByRole('form', { name: 'Create dispatch warehouse' });
      await create.getByRole('textbox', { name: 'Warehouse name' }).fill(warehouseName);
      await create.getByRole('spinbutton', { name: 'Dispatch priority' }).fill('40');
      await create.getByRole('button', { name: 'Create warehouse', exact: true }).click();
      await expect(warehouses.getByRole('row', { name: new RegExp(warehouseName) })).toBeVisible();
      warehouseId = (await command(page, { read: 'warehouses' })).locations.find((row: { name: string }) => row.name === warehouseName).id;
      for (const [region, marketId] of [['BD', 'bd'], ['INTERNATIONAL', 'us']] as const) {
        const workspace = await command(page, { read: 'product', id: productId }, region);
        if (!workspace.commerce.warehouses.find((entry: { id: string }) => entry.id === warehouseId)?.route) {
          await command(page, { action: 'inventory.route', input: {
            productId, marketId, locationId: warehouseId, expected: null, active: true, priority: 40, districts: [], methods: [],
          } }, region);
        }
      }
      for (const [index, variantId] of [firstVariant, secondVariant].entries()) {
        const pool = await command(page, { action: 'inventory.initialize', input: { productId, variantId, marketId: 'bd', locationId: warehouseId } });
        if (!index) poolId = pool.id;
        await command(page, { action: 'inventory.movement', input: {
          productId, marketId: 'bd', poolId: pool.id, expectedUpdatedAt: pool.updatedAt, kind: 'RECEIPT', quantity: 3,
          idempotencyKey: 'acceptance-' + variantId, reason: 'Synthetic acceptance receipt', reference: slug,
        } });
      }
      for (const region of ['BD', 'INTERNATIONAL'] as const) {
        expect(await skuStock(region)).toMatchObject([{ id: poolId, warehouseId, sku: firstSku, onHand: 3, available: 3 }]);
      }
      for (const [region, marketId, currency, prices] of [
        ['BD', 'bd', 'BDT', [129900, 149900]], ['INTERNATIONAL', 'us', 'USD', [2499, 2899]],
      ] as const) {
        for (const [index, variantId] of [firstVariant, secondVariant].entries()) {
          await command(page, { action: 'offer.configure', input: {
            variantId, marketId, sellerId: store, currency, expectedRevision: null,
            amountMinor: prices[index], publication: 'ACTIVE', eligible: true,
          } }, region);
        }
      }
      await editProduct();
      await page.locator('#inventory').getByText('Recent stock movements and allocations', { exact: true }).click();
      const receipts = page.getByRole('table', { name: 'Recent stock movements' });
      for (const sku of [firstSku, secondSku]) {
        const row = receipts.getByRole('row').filter({ hasText: sku });
        await expect(row).toContainText('receipt');
        await expect(row).toContainText('+3');
      }
      await page.getByRole('button', { name: 'Publish product', exact: true }).click();
      await expect.poll(async () => (await command(page, { read: 'product', id: productId })).shared.publication).toBe('ACTIVE');
      const group = await command(page, { action: 'collection.save', input: {
        id: collectionSlug, slug: collectionSlug, name: 'Acceptance collection ' + tag, expectedRevision: null,
        selection: 'CURATED', description: '', image: sharedImage, position: 0,
      } });
      const members = await command(page, { action: 'collection.products', input: {
        collectionId: collectionSlug, expectedRevision: group.revision, expectedProductIds: [], productIds: [productId],
      } });
      await command(page, { action: 'collection.publish', input: {
        collectionId: collectionSlug, marketId: 'bd', expectedRevision: members.revision, published: true,
      } });
      await page.goto(`${dashboard}/catalog-collections?collection=${collectionSlug}`);
      await expect(page.getByRole('heading', { name: 'Curated products' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Hide from this market' })).toBeVisible();
    });

    await test.step('I–J: browse, filter, search and verify currencies, images and only physical combinations', async () => {
      await buyer.goto(`/collections/${collectionSlug}?market=bd`);
      await expect(buyer.getByRole('region', { name: 'Products', exact: true }).getByRole('link', { name: new RegExp(productName) })).toHaveCount(1);
      await buyer.goto(`/departments/${leafId}?market=bd`);
      const toggle = buyer.getByRole('button', { name: 'Filters', exact: true });
      const mobile = await toggle.isVisible();
      if (mobile) await toggle.click();
      const filters = buyer.getByRole(mobile ? 'dialog' : 'complementary', { name: 'Filters', exact: true });
      await expect(filters.getByRole('group', { name: attributeName, exact: true })).toBeVisible();
      await filters.getByRole('checkbox', { name: modelB, exact: true }).check();
      await filters.getByRole('button', { name: 'Apply filters' }).click();
      const product = buyer.getByRole('region', { name: 'Products', exact: true }).getByRole('link', { name: new RegExp(productName) });
      await expect(product).toHaveCount(1);
      await expect(product).toHaveAttribute('href', new RegExp(`variant=${secondVariant}`));
      await product.click();
      await expect(buyer.getByRole('radio', { name: modelB, exact: true })).toBeChecked();
      await expect(buyer.getByRole('radio', { name: 'Floral', exact: true })).toBeChecked();
      await expect(buyer.locator('.product-detail__price:visible')).toContainText(amountBD[1]);
      const variantPhoto = buyer.getByRole('img', { name: variantImage.alt, exact: true }).first();
      await expect(variantPhoto).toBeVisible();
      await expect.poll(() => variantPhoto.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const search = buyer.getByRole('searchbox', { name: /Search products|Search for items or shops/ });
      await search.fill(modelB);
      await search.press('Enter');
      await expect(product).toHaveCount(1);
      const skuSearch = await publicData(buyer, `/api/catalog/search?market=bd&q=${encodeURIComponent(secondSku)}`);
      expect(skuSearch.items).toMatchObject([{ id: productId, matchedVariantId: secondVariant }]);
      expect((await publicData(buyer, `/api/catalog/search?market=bd&q=${doesNotExist}`)).items).toEqual([]);
      await buyer.goto(`/products/${slug}?market=us&variant=${secondVariant}`);
      await expect(buyer.locator('.product-detail__price:visible')).toContainText(amountUSD[1]);
      await expect(buyer.getByRole('img', { name: variantImage.alt, exact: true }).first()).toBeVisible();
      await buyer.goto(`/products/${slug}?market=us&variant=${firstVariant}`);
      await expect(buyer.getByRole('radio', { name: modelA, exact: true })).toBeChecked();
      await expect(buyer.getByRole('img', { name: sharedImage.alt, exact: true }).first()).toBeVisible();
      await expect(buyer.locator('.product-detail__price:visible')).toContainText(amountUSD[0]);
      await buyer.getByRole('radio', { name: modelB, exact: true }).focus();
      await buyer.keyboard.press('Space');
      await expect(buyer.getByRole('radio', { name: 'Plain', exact: true })).not.toBeChecked();
      await expect(buyer.getByRole('button', { name: 'Add to cart', exact: true })).toBeDisabled();
      await expect(buyer.locator('.product-detail__price:visible')).toHaveCount(0);
      await expect(buyer.getByRole('button', { name: 'Publish product', exact: true })).toHaveCount(0);
    });

    async function buy(quantity = 1) {
      await buyer.goto(`/products/${slug}?market=bd&variant=${firstVariant}`);
      const delivery = buyer.getByRole('form', { name: 'Check delivery', exact: true });
      await delivery.getByRole('combobox', { name: 'Delivery district' }).selectOption('dhaka');
      await delivery.getByRole('combobox', { name: 'Delivery service' }).selectOption('COD:standard');
      await buyer.getByRole('button', { name: 'Check delivery', exact: true }).click();
      if (quantity > 1) {
        const control = buyer.getByRole('group', { name: 'Quantity', exact: true });
        for (let unit = 1; unit < quantity; unit++) await control.getByRole('button', { name: 'Increase quantity' }).click();
      }
      await buyer.getByRole('button', { name: 'Add to cart', exact: true }).click();
      await buyer.getByRole('link', { name: 'View cart', exact: true }).click();
      await expect(buyer.getByRole('listitem').filter({ hasText: firstSku })).toContainText(amountBD[0]);
      await buyer.getByRole('link', { name: /^(Proceed to checkout|Guest checkout)$/ }).click();
      await buyer.getByLabel('Full name').fill('June Fixture');
      await buyer.getByLabel('Phone number').fill('01700000000');
      await buyer.getByLabel('Street address').fill('100 Fixture Road');
      await buyer.getByRole('combobox', { name: 'District', exact: true }).selectOption('dhaka');
      await buyer.getByRole('textbox', { name: 'Area or upazila', exact: true }).fill('Dhanmondi');
      await buyer.getByRole('radio', { name: /Standard delivery/ }).check();
      await buyer.getByRole('button', { name: 'Review order', exact: true }).click();
      await buyer.getByRole('button', { name: 'Place COD order', exact: true }).click();
      await expect(buyer).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
      return new URL(buyer.url()).pathname.split('/').at(-1)!;
    }

    await test.step('K–L: place a COD fixture order and take its exact purchase through native packing', async () => {
      const email = `acceptance-${tag}@example.test`;
      const password = randomUUID();
      const headers = { Origin: storefrontOrigin };
      const signedUp = await buyer.request.post('/api/shopper-auth/sign-up/email', { headers, data: { name: 'June Fixture', email, password } });
      expect(signedUp.ok(), await signedUp.text()).toBe(true);
      const signedIn = await buyer.request.post('/api/shopper-auth/sign-in/email', { headers, data: { email, password } });
      expect(signedIn.ok(), await signedIn.text()).toBe(true);
      const forbidden = await buyer.request.post(adminOrigin + adminApi, { headers: { Origin: adminOrigin },
        data: { region: 'BD', request: { read: 'categories' } } });
      expect(forbidden.status()).toBe(401);
      firstOrderId = await buy(2);
      expect((await order(firstOrderId)).lines).toMatchObject([{ variantId: firstVariant, sku: firstSku,
        productName, options: `Model ${modelA} · Design Plain`, quantity: 2, unitPriceMinor: 129900 }]);
      expect(await skuStock()).toMatchObject([{ id: poolId, onHand: 3, reserved: 2, available: 1 }]);
      await page.goto(`${dashboard}/order-details/native-${firstOrderId}?region=BD`);
      await expect(page.getByRole('heading', { name: 'Purchased items', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Start packing', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Mark ready to ship', exact: true })).toBeVisible();
      const firstParcel = page.getByRole('region', { name: 'Parcel 1', exact: true });
      await firstParcel.getByText('Create another parcel', { exact: true }).click();
      await firstParcel.getByRole('spinbutton', { name: new RegExp(`^Units to move for ${firstSku}`) }).fill('1');
      await firstParcel.getByLabel('Reason for splitting this parcel').fill('Use two smaller boxes.');
      const attempts: string[] = [];
      await page.route('**/api/connected-catalog', async route => {
        const body = route.request().postDataJSON();
        if (body?.request?.action === 'order.parcel.split') {
          attempts.push(body.request.input.operationId);
          if (attempts.length === 1) { await route.abort('failed'); return; }
        }
        await route.fallback();
      });
      await firstParcel.getByRole('button', { name: 'Create parcel', exact: true }).click();
      await expect(firstParcel.getByRole('alert')).toBeVisible();
      await firstParcel.getByRole('button', { name: 'Create parcel', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Parcel 2', exact: true })).toBeVisible();
      expect(attempts).toEqual([expect.stringMatching(/^[0-9a-f-]{36}$/), attempts[0]]);
      const split = await order(firstOrderId);
      expect(split.parcels).toHaveLength(2);
      expect(split.parcels).toMatchObject([
        { warehouse: warehouseName, lines: [{ sku: firstSku, quantity: 1 }] },
        { warehouse: warehouseName, lines: [{ sku: firstSku, quantity: 1 }] },
      ]);
      expect(await skuStock()).toMatchObject([{ id: poolId, onHand: 3, reserved: 2, available: 1 }]);
      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('[aria-label="Packing slip"]')).toContainText(firstSku);
      await expect(page.locator('[aria-label="Packing slip"]')).toContainText(warehouseName);
      await page.emulateMedia({ media: 'screen' });
      await command(page, { read: 'order', id: firstOrderId }, 'INTERNATIONAL', 404);
    });

    await test.step('M: cancel one order and process an inspected return for a second exact purchase', async () => {
      await page.getByRole('checkbox', { name: 'Cancel the unshipped order and restore its stock.' }).check();
      await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
      await expect.poll(async () => (await order(firstOrderId)).status).toBe('CANCELLED');
      expect(await skuStock()).toMatchObject([{ id: poolId, onHand: 3, available: 3 }]);
      const secondOrder = await buy();
      const paid = await order(secondOrder);
      const parcelId = paid.parcels[0].id;
      await orderOperation(secondOrder, 'order.advance', { next: 'PACKING' });
      await orderOperation(secondOrder, 'order.advance', { next: 'READY_TO_SHIP' });
      await page.goto(`${dashboard}/order-details/native-${secondOrder}?region=BD`);
      const parcel = page.getByRole('region', { name: 'Parcel 1', exact: true });
      await parcel.getByText('Edit carrier and tracking reference', { exact: true }).click();
      const edit = parcel.locator('form').filter({ has: page.getByRole('button', { name: 'Save tracking reference', exact: true }) });
      await edit.getByLabel('Carrier', { exact: true }).fill('Fixture manual courier');
      await edit.getByLabel('Tracking reference', { exact: true }).fill(slug);
      await edit.getByLabel('Reason for this update').fill('Reference copied from the parcel label.');
      await edit.getByRole('button', { name: 'Save tracking reference' }).click();
      await expect(parcel.getByText(`Fixture manual courier · ${slug}`, { exact: true })).toBeVisible();
      expect((await order(secondOrder)).parcels[0].trackingStatus).toBe('PREPARING');
      expect(await skuStock()).toMatchObject([{ id: poolId, onHand: 3, reserved: 1, available: 2 }]);
      const dispatch = parcel.locator('form').filter({ has: page.getByRole('button', { name: 'Dispatch parcel', exact: true }) });
      await dispatch.getByLabel('Reason or proof of handoff').fill('Handed over at the fixture counter.');
      await dispatch.getByRole('button', { name: 'Dispatch parcel' }).click();
      await expect(parcel.getByRole('list', { name: 'Tracking timeline' })).toContainText('Handed over at the fixture counter.');
      await parcel.getByText('Delivery exception', { exact: true }).click();
      await parcel.getByLabel('Reason for the delivery exception').fill('Address clarification requested.');
      await parcel.getByRole('button', { name: 'Record delivery exception' }).click();
      const timeline = parcel.getByRole('list', { name: 'Tracking timeline' });
      await expect(timeline).toContainText('Address clarification requested.');
      await expect(timeline).toContainText('Manual staff update');
      await expect(timeline).toContainText('Recorded');
      expect((await order(secondOrder)).payment.status).toBe('AWAITING_COLLECTION');
      await expect(parcel.getByRole('button', { name: 'Check carrier tracking' })).toHaveCount(0);
      await orderOperation(secondOrder, 'order.parcel.tracking', { parcelId, status: 'OUT_FOR_DELIVERY', evidence: slug });
      await orderOperation(secondOrder, 'order.parcel.tracking', { parcelId, status: 'DELIVERED', evidence: slug });
      await orderOperation(secondOrder, 'order.collect', { confirmed: true });
      const snapshot = await order(secondOrder);
      expect(snapshot.payment.status).toBe('COLLECTED');
      const workspace = await command(page, { read: 'product', id: productId });
      const offer = workspace.commerce.variants.find((row: { id: string }) => row.id === firstVariant).offer;
      await command(page, { action: 'offer.configure', input: {
        variantId: firstVariant, marketId: 'bd', sellerId: store, currency: 'BDT', expectedRevision: offer.revision,
        amountMinor: 139900, publication: 'ACTIVE', eligible: true,
      } });
      expect((await order(secondOrder)).lines).toEqual(snapshot.lines);
      const request = await buyer.request.post('/api/marketplace/cases', { headers: { Origin: storefrontOrigin }, data: {
        action: 'open', orderId: secondOrder, kind: 'RETURN', note: 'Isolated acceptance restock request.', lines: [{ orderItemId: snapshot.lines[0].id, quantity: 1 }],
      } });
      expect(request.ok(), await request.text()).toBe(true);
      const result = await request.json();
      const caseId = result.data?.id ?? result.id;
      const review = { action: 'review', caseId, note: 'Fixture review' };
      await command(page, { action: 'order.case', input: { ...review, revision: 0, status: 'IN_REVIEW' } });
      await command(page, { action: 'order.case', input: { ...review, revision: 1, status: 'RETURN_APPROVED' } });
      const receipt = { action: 'order.case', input: { action: 'receive', caseId, revision: 2, disposition: 'RESTOCK', confirmed: true, note: 'Fixture inspected at original warehouse.' } };
      await command(page, receipt);
      await command(page, receipt, 'BD', 409);
      const returned = await command(page, { read: 'order-case', id: caseId });
      expect(returned).toMatchObject({ status: 'RETURN_RECEIVED', returnDisposition: 'RESTOCK',
        returnLines: [{ variantId: firstVariant, sku: firstSku, unitPriceMinor: 129900, quantity: 1 }] });
      expect(await skuStock('INTERNATIONAL')).toMatchObject([{ id: poolId, onHand: 3, available: 3 }]);
      expect((await order(secondOrder)).lines).toEqual(snapshot.lines);
    });
  } finally {
    await buyerContext.close();
  }
});
