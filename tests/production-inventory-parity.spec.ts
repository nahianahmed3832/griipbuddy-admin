import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const origin = process.env.GRIIP_ADMIN_TEST_OPERATIONS_ORIGIN ?? 'http://127.0.0.1:4327';
const offset = Number(process.env.GRIIP_ADMIN_TEST_OPERATIONS_PORT_OFFSET ?? 0);
const warehouseId = '000000000000000000000007';
const productId = '000000000000000000000003';
const variantId = '000000000000000000000005';
const sku = 'FIXTURE-BD-BLUE';
const otherSku = 'PREVIEW-FORM-CASE-STANDARD-1';

test('production inventory, purchasing, variant media, and barcode workflows', async ({ page }) => {
  test.skip(!offset, 'Use a dedicated fixture port offset for this mutating workflow.');
  if (!/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(origin) || !Number.isInteger(offset) || offset < 0 || offset > 500) {
    throw new Error('Use a disposable loopback fixture.');
  }
  const backend = process.env.GRIIP_ADMIN_TEST_BACKEND_DIR;
  if (!backend) throw new Error('Set GRIIP_ADMIN_TEST_BACKEND_DIR to the disposable fixture backend.');
  const { MongoClient, ObjectId } = createRequire(resolve(backend, 'package.json'))('mongoose').mongo;
  const address = '127.0.0.1:' + (38117 + offset);
  const client = new MongoClient('mongodb://' + address + '/griipbuddy_fixture?replicaSet=griip-recovery&directConnection=true',
    { serverSelectionTimeoutMS: 2000 });
  const db = client.db('griipbuddy_fixture');
  const oid = (value?: string) => new ObjectId(value);
  const outlet = oid();
  const supplier = oid();
  const purchase = oid();
  try {
    const hello = await db.admin().command({ hello: 1 });
    const original = await db.collection('variants').findOne({ _id: oid(variantId), sku });
    if (hello.setName !== 'griip-recovery' || hello.me !== address || !original) throw new Error('Unexpected fixture database.');
    const actor = await db.collection('users').findOne({ phone_number: '01000000001' });
    if (!actor) throw new Error('The fixture owner is missing.');
    const now = new Date();
    await db.collection('business_locations').updateOne({ _id: oid(warehouseId) }, { $set: { type: 'WAREHOUSE' } });
    await db.collection('business_locations').insertOne({
      _id: outlet, slug: 'fixture-parity-outlet-' + outlet, name: 'Fixture parity outlet', type: 'OUTLET',
      region: 'BD', is_active: true, is_deleted: false,
    });
    await db.collection('suppliers').insertOne({ _id: supplier, name: 'Fixture purchase supplier ' + supplier,
      contact_id: Number.parseInt(String(supplier).slice(-12), 16), is_deleted: false });
    await db.collection('purchases').insertOne({
      _id: purchase, created_by: actor._id, received_by: actor._id, business_location: oid(warehouseId), supplier,
      purchase_number: 209001, purchase_date: now, status: 'draft', createdAt: now, updatedAt: now,
      items: [{ _id: oid(), variant: oid(variantId), product: oid(productId), qty: 1, unit_cost: 100, discount: 0, tax: 0 }],
      expenses_applied: [], attachments: [],
    });

    await page.goto(origin + '/sign-in');
    await page.getByLabel('Phone Number', { exact: true }).fill('01000000001');
    await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL(origin + '/dashboard/overview');

    await page.goto(origin + '/dashboard/inventory/view/warehouse?warehouse_id=' + warehouseId);
    await expect(page.getByRole('table').getByText(sku, { exact: true })).toBeVisible();
    await page.goto(origin + '/dashboard/inventory/outlet-update?outlet_id=' + outlet);
    await page.getByLabel('Select Warehouse').selectOption(warehouseId);
    await expect(page.getByLabel('Select Outlet')).toHaveValue(String(outlet));
    await page.getByLabel('Search product or SKU').fill(sku);
    await page.getByRole('button', { name: 'Find products' }).click();
    await page.getByRole('button', { name: 'Add ' + sku, exact: true }).click();
    await page.getByRole('button', { name: 'Confirm Update' }).click();
    await expect(page).toHaveURL(new RegExp('/dashboard/inventory/view/outlet\\?outlet_id=' + outlet));
    const outletRow = page.getByRole('row').filter({ hasText: 'Fixture domestic case' });
    await expect(outletRow.getByRole('cell', { name: '1', exact: true })).toBeVisible();

    await page.goto(origin + '/dashboard/check-outlet-stocks?product=' + productId);
    await expect(page.getByRole('table').getByText(sku, { exact: true })).toBeVisible();
    await expect(page.getByRole('table').getByText(otherSku, { exact: true })).toHaveCount(0);

    await page.goto(origin + '/dashboard/purchase/edit/' + purchase);
    const search = page.getByRole('searchbox', { name: 'Search for Products' });
    await search.fill(sku);
    await expect(page.getByRole('list', { name: 'Matching products' }).getByRole('button', { name: new RegExp(sku) })).toBeDisabled();
    await search.fill(otherSku);
    await page.getByRole('list', { name: 'Matching products' }).getByRole('button', { name: new RegExp(otherSku) }).click();
    await expect(page.getByRole('table').getByText(otherSku, { exact: true })).toBeVisible();
    await page.getByLabel('Unit cost for item 2').fill('125');
    const purchaseSave = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/purchases/record?'));
    await page.getByRole('button', { name: 'Save purchase', exact: true }).click();
    const savedPurchase = await purchaseSave;
    expect(savedPurchase.status()).toBe(200);
    await expect(page.getByRole('table').getByText(otherSku, { exact: true })).toBeVisible();

    const image = 'https://example.test/fixture-blue.png';
    await page.route('**/api/catalog-edit?upload=1', route => route.fulfill({ json: { url: image } }));
    await page.goto(origin + '/dashboard/update-product/fixture-bd');
    const attribute = Object.keys(original.attribute_values)[0];
    const value = original.attribute_values[attribute];
    await page.getByLabel('Assign images by attribute').selectOption(attribute);
    await page.getByLabel('Upload New Image for ' + value).setInputFiles({ name: 'blue.png', mimeType: 'image/png', buffer: Buffer.from('fixture image') });
    await expect(page.getByRole('list', { name: 'Images for ' + value })).toContainText('Image 1');
    const variantSave = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/catalog-edit'));
    await page.getByRole('button', { name: 'Update Variants', exact: true }).click();
    const savedVariant = await variantSave;
    expect(savedVariant.status()).toBe(200);
    const variant = await db.collection('variants').findOne({ _id: oid(variantId), sku });
    expect(variant?.image_based_on).toBe(attribute);
    expect(variant?.images).toContain(image);

    const generated = await page.request.post(origin + '/api/operations', {
      headers: { Origin: origin }, data: { action: 'barcode-generate', region: 'BD', values: { sku, quantity: '1', note: 'Parity fixture' } },
    });
    expect(generated.status(), await generated.text()).toBe(200);
    const [barcode] = (await generated.json()).barcodes;
    await page.goto(origin + '/dashboard/barcodes/logs?barcode=' + barcode);
    await page.getByRole('button', { name: 'Edit barcode', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit ' + barcode });
    await edit.getByLabel('Condition').selectOption('OPEN_BOX');
    await edit.getByLabel('Admin note (optional)').fill('Verified label condition');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('list', { name: 'Barcode history' }).getByText('Note: Verified label condition')).toBeVisible();
    await page.goto(origin + '/dashboard/barcodes?barcode=' + barcode);
    await page.getByRole('dialog', { name: barcode }).getByRole('button', { name: 'Reset barcode' }).click();
    await expect(page.getByRole('dialog', { name: barcode })).toHaveCount(0);
    const label = await db.collection('barcodes').findOne({ barcode });
    expect(label?.status).toBe('QC_PENDING');
    expect(label?.conditions).toBe('NEW');
  } finally {
    await client.close();
  }
});
