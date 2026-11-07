import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const origin = 'http://127.0.0.1:4327';
const variant = '000000000000000000000005';
const intlVariant = '000000000000000000000006';
const intlProduct = '000000000000000000000004';
const product = '000000000000000000000003';
const warehouse = '000000000000000000000007';
const destination = '0000000000000000000000f8';
const foreignLocation = '0000000000000000000000f9';
const stockPage = origin + '/desk/inventory/stock/' + variant;

type FixtureCollection = {
  findOne(filter: object): Promise<Record<string, unknown> | null>;
  updateOne(filter: object, update: object, options?: { upsert: boolean }): Promise<unknown>;
};

async function fixtureDatabase<T>(work: (collection: (name: string) => FixtureCollection, id: (value: string) => unknown) => Promise<T>) {
  const backend = process.env.GRIIP_ADMIN_TEST_BACKEND_DIR;
  if (!backend) throw new Error('Set GRIIP_ADMIN_TEST_BACKEND_DIR to the private recovered backend with installed dependencies.');
  const { MongoClient, ObjectId } = createRequire(resolve(backend, 'package.json'))('mongoose').mongo;
  const client = new MongoClient('mongodb://127.0.0.1:38117/griipbuddy_fixture?replicaSet=griip-recovery&directConnection=true',
    { serverSelectionTimeoutMS: 2000 });
  try {
    const db = client.db('griipbuddy_fixture');
    const topology = await db.admin().command({ hello: 1 });
    const id = (value: string) => new ObjectId(value);
    const marker = await db.collection('variants').findOne({ _id: id(variant), sku: 'FIXTURE-BD-BLUE' });
    if (topology.setName !== 'griip-recovery' || topology.me !== '127.0.0.1:38117' || !marker) {
      throw new Error('Unexpected disposable inventory fixture.');
    }
    return await work(name => db.collection(name), id);
  } finally {
    await client.close();
  }
}

async function signIn(page: Page, role = '1') {
  await page.goto(origin + '/sign-in');
  await page.getByLabel('Staff email or phone number').fill('0100000000' + role);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(origin + '/desk/overview');
}

async function confirm(page: Page, status = 200) {
  const response = page.waitForResponse(value => value.url() === origin + '/api/operations');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  const result = await response;
  expect(result.status(), await result.text()).toBe(status);
  return result;
}

function quantities() {
  return fixtureDatabase(async (collection, id) => {
    const [source, target, global] = await Promise.all([
      collection('stocks').findOne({ variant: id(variant), business_location: id(warehouse) }),
      collection('stocks').findOne({ variant: id(variant), business_location: id(destination) }),
      collection('globalstocks').findOne({ variant: id(variant) }),
    ]);
    return [source?.available_quantity, target?.available_quantity ?? 0, global?.available_quantity];
  });
}

test('native stock actions reconcile the physical and global counts and reject cross-region transfers', async ({ page }) => {
  await fixtureDatabase(async (collection, id) => {
    await collection('business_locations').updateOne({ _id: id(warehouse) }, { $set: { is_deleted: false } });
    for (const [key, name, region] of [[destination, 'Acceptance receiving', 'BD'], [foreignLocation, 'Acceptance international', 'INTERNATIONAL']]) {
      await collection('business_locations').updateOne({ _id: id(key) }, {
        $set: { name, slug: name.toLowerCase().replaceAll(' ', '-'), region, is_deleted: false },
      }, { upsert: true });
    }
  });
  await signIn(page);
  await page.goto(stockPage);
  await page.getByRole('button', { name: 'Adjust stock' }).click();
  await page.getByLabel('Location', { exact: true }).selectOption(warehouse);
  await page.getByLabel('Adjustment').selectOption('DEDUCTION');
  await page.getByRole('dialog').getByLabel('Quantity').fill('1');
  await confirm(page);
  await expect.poll(quantities).toEqual([11, 0, 11]);

  const denial = await page.request.post(origin + '/api/operations', {
    headers: { Origin: origin },
    data: { action: 'stock-transfer', recordId: variant, region: 'BD', values: { location: warehouse, destination: foreignLocation, quantity: '1' } },
  });
  expect(denial.status()).toBe(400);
  await page.getByRole('button', { name: 'Transfer stock' }).click();
  await page.getByLabel('Source location').selectOption(warehouse);
  await page.getByLabel('Destination location').selectOption(destination);
  await page.getByRole('dialog').getByLabel('Quantity').fill('2');
  await confirm(page);
  await expect.poll(quantities).toEqual([9, 2, 11]);
});

test('native receiving creates a purchase and supports a partial scanned return', async ({ page }) => {
  await signIn(page);
  await page.goto(origin + '/desk/inventory/suppliers');
  await page.getByRole('button', { name: 'Add supplier' }).click();
  await page.getByLabel('Supplier name').fill('Acceptance supply');
  await page.getByLabel('Contact reference number').fill('9870021');
  await confirm(page);
  await expect(page.getByRole('table').getByText('Acceptance supply')).toBeVisible();

  await page.goto(origin + '/desk/catalog/variants/' + variant);
  await page.getByRole('button', { name: 'Set purchase rate' }).click();
  await page.getByLabel('Supplier', { exact: true }).selectOption({ label: 'Acceptance supply' });
  await page.getByLabel('Unit cost').fill('300');
  await confirm(page);
  await page.goto(origin + '/desk/inventory/barcodes');
  await page.getByRole('button', { name: 'Generate barcodes' }).click();
  await page.getByLabel('Variant SKU').fill('FIXTURE-BD-BLUE');
  await page.getByLabel('Quantity').fill('2');
  await confirm(page);
  const codes = (await page.getByLabel('Generated barcodes').inputValue()).split('\n');
  expect(codes).toHaveLength(2);
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Receive barcodes' }).click();
  await page.getByLabel('Receiving location').selectOption(warehouse);
  await page.getByLabel('Scanned barcodes').fill(codes.join('\n'));
  await confirm(page);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const afterReceiving = await quantities();
  await page.getByRole('button', { name: 'Receive barcodes' }).click();
  await page.getByLabel('Receiving location').selectOption(warehouse);
  await page.getByLabel('Scanned barcodes').fill(codes[0]);
  await confirm(page, 409);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('already been received');
  expect(await quantities()).toEqual(afterReceiving);

  await page.goto(origin + '/desk/inventory/purchases');
  await page.getByRole('table').getByRole('link').first().click();
  await page.getByRole('button', { name: 'Edit purchase notes' }).click();
  await page.getByRole('dialog').getByLabel('Purchase notes', { exact: true }).fill('Checked during receipt acceptance');
  await confirm(page);
  await expect(page.getByRole('paragraph').filter({ hasText: 'Checked during receipt acceptance' })).toBeVisible();

  const placed = await page.request.post('http://127.0.0.1:38100/api/v1/order', { data: {
    order_by: 'GUEST', customer_name: 'Acceptance checkout', customer_phone: '01000000008',
    delivery_address: { division: 'Fixture', district: 'Fixture', thana: 'Fixture', address: 'Fixture address' },
    products: [{ product, total_quantity: 2, total_price: 1600, shipping_cost: 0, shipping_cost_per_unit: 0,
      selected_variant: { _id: variant, sku: 'FIXTURE-BD-BLUE', barcode: '9900000000001',
        regular_price: 900, sale_price: 800, attribute_values: { Color: 'Blue' } } }],
    payment_type: 'CASH_ON_DELIVERY', files: [], sub_total: 1600, delivery_charge: 0, total_discount: 0,
    paid_amount: 0, total_amount: 1600, payable_amount: 1600, COD: 1600, is_delivery_charge_paid: false,
  } });
  expect(placed.status(), await placed.text()).toBe(201);
  const order = (await placed.json()).data._id;
  await page.goto(origin + '/desk/orders/orders/' + order);
  await page.getByRole('button', { name: 'Add staff note' }).click();
  await page.getByRole('dialog').getByLabel('Staff note').fill('Confirmed delivery details during acceptance');
  await confirm(page);
  await expect(page.getByRole('cell',{name:'Confirmed delivery details during acceptance'})).toBeVisible();
  await page.getByRole('button', { name: 'Assign order barcodes' }).click();
  await page.getByRole('dialog').getByLabel('Scanned barcodes').fill(codes.join('\n'));
  await confirm(page);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await fixtureDatabase(async (collection, id) => {
    await collection('orders').updateOne({ _id: id(order) }, { $set: {
      transfer_to_courier: true, tracking_code: 'FIXTURE-TRACKING', status: 'IN_TRANSIT',
    } });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Assign order barcodes' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh simulated tracking' }).click();
  await confirm(page);
  await expect(page.getByText('Delivered', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Mark pending return' }).click();
  await confirm(page);
  await expect(page.getByText('Pending return', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Process scanned return' }).click();
  await page.getByRole('dialog').getByLabel('Scanned barcodes').fill(codes[0]);
  await confirm(page);
  await expect.poll(() => fixtureDatabase(async (collection, id) =>
    (await collection('orders').findOne({ _id: id(order) }))?.status)).toBe('PARTIAL');
  expect(await quantities()).toEqual([Number(afterReceiving[0]) - 1, afterReceiving[1], Number(afterReceiving[2]) - 1]);
});

test('CMS and international catalog forms update existing records with permission checks', async ({ page, request }) => {
  await signIn(page, '4');
  const data = { action: 'announcement-create', region: 'BD', values: { message: 'Acceptance announcement', enabled: 'false' } };
  expect((await page.request.post(origin + '/api/operations', { headers: { Origin: origin }, data })).status()).toBe(403);
  expect((await request.post(origin + '/api/operations', { headers: { Origin: origin }, data })).status()).toBe(401);

  await signIn(page);
  await page.goto(origin + '/desk/catalog/products/' + product);
  const details = { action: 'product-details', recordId: product, region: 'INTERNATIONAL', values: { description: 'Wrong region' } };
  expect((await page.request.post(origin + '/api/operations', { headers: { Origin: origin }, data: details })).status()).toBe(404);
  await page.getByRole('button', { name: 'Edit product details' }).click();
  await page.getByLabel('Product description').fill('Updated sample case description.');
  await page.getByLabel('Delivery estimate').fill('2–4 days');
  await page.getByLabel('Search tags (comma separated)').fill('case, CASE, matte');
  await confirm(page);
  await expect(page.locator('.product-record-copy').getByText('Updated sample case description.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixture domestic case', level: 1 })).toBeVisible();
  await expect(page.getByRole('table').getByText('FIXTURE-BD-BLUE')).toBeVisible();
  await fixtureDatabase(async (collection, id) => {
    const item = await collection('products').findOne({ _id: id(product) });
    expect(item).toMatchObject({ slug: 'fixture-bd', search_tags: ['CASE', 'matte'], is_published: true });
  });
  expect((await page.request.post(origin + '/api/operations', { headers: { Origin: 'https://cross-site.invalid' }, data })).status()).toBe(403);
  await page.goto(origin + '/desk/content/announcements');
  await page.getByRole('button', { name: 'Add announcement' }).click();
  await page.getByLabel('Announcement text').fill('Acceptance announcement');
  await page.getByLabel('Visibility').selectOption('false');
  await confirm(page);
  await page.getByRole('link', { name: 'Acceptance announcement' }).click();
  await page.getByRole('button', { name: 'Edit announcement' }).click();
  await page.getByLabel('Announcement text').fill('Updated acceptance announcement');
  await confirm(page);
  await expect(page.getByRole('heading', { name: 'Updated acceptance announcement' })).toBeVisible();

  await page.goto(origin + '/desk/markets/pricing/' + intlVariant + '?region=INTERNATIONAL');
  await page.getByRole('button', { name: 'Edit regional price' }).click();
  await page.getByLabel('Currency').selectOption('USD');
  await page.getByLabel('Regular price').fill('19');
  await page.getByLabel('Sale price').fill('16.50');
  await confirm(page);
  await expect(page.getByText(/USD 19 \/ 16.5/)).toBeVisible();
  await page.goto(origin + '/desk/markets/visibility/' + intlProduct + '?region=INTERNATIONAL');
  await page.getByRole('button', { name: 'Edit country coverage' }).click();
  await page.getByLabel('Country codes').fill('US');
  await confirm(page);
  await page.getByRole('button', { name: 'Edit publication' }).click();
  await page.getByLabel('Visibility').selectOption('false');
  await confirm(page);
  await expect(page.getByText('Inactive', { exact: true })).toBeVisible();
});

test('native cash sale and return reconcile inventory and coupon status retries are safe', async ({ page }) => {
  test.skip(process.env.GRIIP_ADMIN_TEST_FIXTURE_PARITY !== '1', 'Requires the private Step 8 parity backend.');
  await signIn(page);
  await page.goto(origin + '/desk/pos/sales');
  const before = await quantities();
  await page.getByRole('button', { name: 'Record cash sale' }).click();
  await page.getByLabel('Sale location').selectOption(warehouse);
  await page.getByLabel('Variant SKU').fill('FIXTURE-BD-BLUE');
  await page.getByLabel('Quantity').fill('1');
  await confirm(page);
  await expect.poll(quantities).toEqual([Number(before[0]) - 1, before[1], Number(before[2]) - 1]);
  await page.getByRole('table').getByRole('link', { name: '1001' }).click();
  await page.getByRole('button', { name: 'Record cash return' }).click();
  await page.getByRole('dialog').getByLabel('Sale item', { exact: true }).selectOption(variant);
  await page.getByLabel('Quantity').fill('1');
  await confirm(page);
  await expect.poll(quantities).toEqual(before);
  await expect(page.getByRole('button', { name: 'Record cash return' })).toHaveCount(0);

  await page.goto(origin + '/desk/marketing/coupons');
  await page.getByRole('button', { name: 'Add coupon' }).click();
  await page.getByLabel('Coupon code').fill('ACCEPTANCE15');
  await page.getByLabel('Discount type').selectOption('PERCENTAGE');
  await page.getByLabel('Discount value').fill('15');
  await page.getByLabel('Starts on (UTC)').fill('2026-01-01');
  await page.getByLabel('Expires on (UTC)').fill('2026-12-31');
  await confirm(page);
  await page.getByRole('link', { name: 'ACCEPTANCE15' }).click();
  await expect(page).toHaveURL(/\/desk\/marketing\/coupons\/[a-f0-9]{24}(\?|$)/);
  const id = page.url().split('/').at(-1)?.split('?')[0];
  await page.getByRole('button', { name: 'Change coupon status' }).click();
  await page.getByRole('dialog').getByLabel('Coupon status', { exact: true }).selectOption('true');
  await confirm(page);
  const replay = await page.request.post(origin + '/api/operations', { headers: { Origin: origin },
    data: { action: 'coupon-status', recordId: id, region: 'BD', values: { enabled: 'true' } } });
  expect(replay.status()).toBe(200);
  await page.reload();
  await expect(page.locator('dd').getByText('Active', { exact: true })).toBeVisible();
});
