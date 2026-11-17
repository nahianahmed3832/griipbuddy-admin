import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const origin = process.env.GRIIP_ADMIN_TEST_WEBSITE_ORDER_ORIGIN || 'http://127.0.0.1:4327';
const list = '/desk/orders/orders';
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMwMViNFTEMLQkAW45DwbLqlTgAAAAASUVORK5CYII=', 'base64');

async function signIn(page: Page, suffix = '1') {
  await page.goto(origin + '/sign-in');
  await page.getByLabel('Phone Number', { exact: true }).fill('0100000000' + suffix);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(origin + '/dashboard/overview');
}

test('staff can create a barcode order, read its private receipt and follow up from All Orders', async ({ page }) => {
  const phone = '019' + String(Date.now()).slice(-8);
  await signIn(page);
  await page.goto(origin + '/desk/orders/create');
  await page.getByRole('heading', { name: 'Create Order', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Search product by name or SKU' }).fill('FIXTURE-BD-BLUE');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add FIXTURE-BD-BLUE' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill('9900000000001');
  await page.getByRole('textbox', { name: 'Barcode', exact: true }).press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'Quantity for FIXTURE-BD-BLUE' })).toHaveValue('1');

  await page.getByLabel('Customer Name').fill('Website Order Fixture');
  await page.getByLabel('Customer Phone').fill(phone);
  await page.getByLabel('Delivery Address').fill('Fixture lane, Dhaka');
  await page.getByLabel('Delivery Notes').fill('Leave at reception');
  await page.getByLabel('Advance Payment', { exact: true }).fill('100');
  await page.getByLabel('Discount', { exact: true }).fill('20');
  await page.getByLabel('Sender Number').fill('01900000968');
  await page.getByLabel('Transaction ID').fill('FIXTURE-TRX-100');
  await page.getByLabel('Upload Payment Screenshot').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: pixel });
  const button = page.getByRole('button', { name: 'Create Order (৳750)', exact: true });
  await expect(button).toBeEnabled();
  const creation = page.waitForResponse(response => response.url().includes('action=create'));
  await button.click();
  const created = await creation;
  expect(created.status(), await created.text()).toBe(201);
  const { _id: id, COD, total_amount } = await created.json();
  expect(COD).toBe(750);
  expect(total_amount).toBe(850);
  await expect(page).toHaveURL(origin + list + '/' + id);
  const invoice = page.getByRole('region', { name: 'Invoice', exact: true });
  await expect(invoice.getByText('SKU: FIXTURE-BD-BLUE')).toBeVisible();
  await expect(invoice.getByText('৳850', { exact: true })).toBeVisible();
  await expect(invoice.getByText('৳750', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Executive Notes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Discount Logs' })).toBeVisible();
  await page.evaluate(() => { window.print = () => document.body.setAttribute('data-printed', 'yes'); });
  await page.getByRole('button', { name: 'Print Invoice' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'yes');
  await page.emulateMedia({ media: 'print' });
  await expect(invoice).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Executive Notes', includeHidden: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Order Logs', includeHidden: true })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });

  await page.goto(origin + list);
  await page.getByLabel('Search', { exact: true }).fill(phone);
  await page.getByLabel('SKU', { exact: true }).fill('FIXTURE-BD-BLUE');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('heading', { name: 'All Orders (1)' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Website Order Fixture' });
  await expect(row.getByText('৳750')).toBeVisible();

  await row.getByRole('button', { name: 'Pay Info' }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByText('FIXTURE-TRX-100')).toBeVisible();
  const proof = await dialog.getByRole('link', { name: 'View Payment Screenshot' }).getAttribute('href');
  expect(proof).toBeTruthy();
  const file = await page.request.get(origin + proof);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toContain('image/png');
  expect((await file.body()).subarray(0, 8).equals(pixel.subarray(0, 8))).toBe(true);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await row.getByRole('button', { name: 'Website Order Fixture' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Order History (1)' })).toBeVisible();
  await expect(dialog.getByText('SKU: FIXTURE-BD-BLUE')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await row.getByRole('button', { name: /Mark #.+ as called/ }).click();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(row.getByText(/Called by/)).toBeVisible();
  await row.getByRole('button', { name: /Actions for/ }).click();
  await dialog.getByRole('button', { name: 'Update Note' }).click();
  await dialog.getByRole('textbox', { name: 'Staff note', exact: true }).fill('Synthetic order checked.');
  await dialog.getByRole('button', { name: 'Add note' }).click();
  await expect(row.getByText('Synthetic order checked.')).toBeVisible();
  await row.getByRole('button', { name: /Actions for/ }).click();
  await dialog.getByRole('button', { name: 'Edit Order' }).click();
  await dialog.getByLabel('Delivery address').fill('Updated fixture address');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(row.getByText('Updated fixture address')).toBeVisible();
  await row.getByRole('button', { name: /Actions for/ }).click();
  await dialog.getByRole('button', { name: 'Update Status' }).click();
  await expect(dialog.getByRole('option', { name: 'Incomplete' })).toBeAttached();
  await dialog.getByLabel('New status').selectOption('ACCEPTED');
  await dialog.getByRole('button', { name: 'Save status' }).click();
  await expect(row.getByText('Accepted', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Status Logs' }).click();
  await expect(dialog.getByText('Accepted', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByLabel('Called?').selectOption('false');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No orders match')).toBeVisible();
  await page.getByLabel('Called?').selectOption('true');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(row).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download Excel' }).click();
  expect((await download).suggestedFilename()).toBe('website-orders.xlsx');
  const wrongMarket = await page.request.get(origin + '/api/website-orders?action=history&region=INTERNATIONAL&id=' + id);
  expect(wrongMarket.status()).toBe(404);
  expect((await page.request.get(origin + '/api/website-orders?action=notes&region=INTERNATIONAL&id=' + id)).status()).toBe(404);

  await row.getByRole('link', { name: /^#/ }).click();
  await expect(page.getByRole('link', { name: 'Back to Orders' })).toHaveAttribute('href', new RegExp(`q=${phone}`));
  await expect(page.getByText('Synthetic order checked.')).toBeVisible();
  await expect(page.getByText('Order contact and delivery details edited')).toBeVisible();
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(dialog.getByText('Synthetic order checked.')).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Previous staff notes' }).locator('small')).toContainText(/Admin|Fixture/i);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('button', { name: 'Order Actions' }).click();
  await dialog.getByRole('button', { name: 'Send to Courier' }).click();
  await expect(dialog.getByText('Updated fixture address')).toBeVisible();
  const warehouses = dialog.getByLabel('Dispatch warehouse');
  const warehouse = await warehouses.getByRole('option').filter({ hasText: /fixture/i }).first().getAttribute('value');
  expect(warehouse).toBeTruthy();
  const unknownWarehouse = await page.request.post(origin + '/api/website-orders?action=dispatch&region=BD&id=' + id,
    { headers: { Origin: origin }, data: { location: '000000000000000000000000' } });
  expect(unknownWarehouse.status()).toBe(404);
  await warehouses.selectOption(warehouse!);
  const dispatch = page.waitForResponse(response => response.url().includes('action=dispatch'));
  await dialog.getByRole('button', { name: 'Send to Steadfast' }).click();
  const dispatched = await dispatch;
  expect(dispatched.status(), await dispatched.text()).toBe(200);
  const parcel = await dispatched.json();
  await expect(page.getByText(`Parcel #${parcel.consignment_id}`)).toBeVisible();
  const duplicate = await page.request.post(origin + '/api/website-orders?action=dispatch&region=BD&id=' + id,
    { headers: { Origin: origin }, data: { location: warehouse } });
  expect(duplicate.status()).toBe(409);
  await page.getByRole('button', { name: 'Order Actions' }).click();
  await expect(dialog.getByRole('button', { name: 'Send to Courier' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Mark as Handed Over' }).click();
  await dialog.getByRole('button', { name: 'Confirm handover' }).click();
  await expect(page.getByText('Courier handover recorded.')).toBeVisible();
  await expect(page.getByText('Handed over to courier', { exact: true }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Print Invoice' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('link', { name: 'Back to Orders' }).click();
  await expect(row.getByRole('button', { name: /Actions for/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('read-only order staff can export filtered orders but cannot access mutations or the creation form', async ({ page, request }) => {
  expect((await request.get(origin + '/api/website-orders?action=export&region=BD')).status()).toBe(401);
  await signIn(page, '6');
  await page.goto(origin + list);
  await page.getByRole('navigation', { name: 'Filter orders by status' }).getByRole('link', { name: /In transit/ }).click();
  await expect(page.getByRole('table').getByText('In transit', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create Order' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sync with Courier' })).toHaveCount(0);
  expect((await page.request.get(origin + '/api/website-orders?action=export&region=BD&filter=IN_TRANSIT')).status()).toBe(200);
  expect((await page.request.post(origin + '/api/website-orders?action=create&region=BD',
    { headers: { Origin: origin }, data: {} })).status()).toBe(403);
  const existing = page.getByRole('table').getByRole('link', { name: /^#/ }).first();
  await existing.click();
  await expect(page.getByRole('region', { name: 'Invoice', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Order Actions' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add note' })).toHaveCount(0);
  await page.goto(origin + '/desk/orders/create');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
});

test('an open website order can edit quantity and delivery while keeping its recorded advance and proof', async ({ page }) => {
  await signIn(page);
  const endpoint = origin + '/api/website-orders?region=BD';
  const searched = await page.request.get(endpoint + '&action=products&q=FIXTURE-BD-BLUE');
  expect(searched.ok()).toBe(true);
  const { rows } = await searched.json();
  const variant = rows.find((row: { sku: string }) => row.sku === 'FIXTURE-BD-BLUE');
  expect(variant).toBeTruthy();
  const created = await page.request.post(endpoint + '&action=create', { headers: { Origin: origin }, data: {
    products: [{ product: variant.product, variant: variant.id, total_quantity: 1 }],
    customer_name: 'Order Draft Fixture', customer_phone: '018' + String(Date.now()).slice(-8),
    delivery_address: { address: 'Fixture road', division: 'Dhaka', district: 'Dhaka', thana: '' },
    order_note: 'Synthetic order', payment_type: 'CASH_ON_DELIVERY', delivery_charge: 70, paid_amount: 100,
    overall_discount_amount: 20, sender: '01900000968', reference: 'ORDER-DRAFT-FIXTURE', proof: pixel.toString('base64'),
  } });
  expect(created.status(), await created.text()).toBe(201);
  const { _id: id } = await created.json();
  const receipt = endpoint + '&action=proof&id=' + id;
  const before = await page.request.get(receipt);
  expect(before.ok()).toBe(true);
  await page.goto(origin + list + '/' + id);
  await page.getByRole('link', { name: 'Edit items and payment' }).click();
  await expect(page.getByRole('heading', { name: 'Edit items and payment' })).toBeVisible();
  await expect(page.getByLabel('Advance Payment', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Advance Payment', { exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('Payment Type', { exact: true })).toBeDisabled();
  await expect(page.getByText('Existing payment proof is retained.')).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Quantity for FIXTURE-BD-BLUE' }).fill('2');
  await page.getByLabel('Delivery Charge', { exact: true }).fill('0');
  const mutation = page.waitForResponse(response => response.url().includes('action=draft&') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save order changes' }).click();
  const response = await mutation;
  expect(response.status(), await response.text()).toBe(200);
  const subtotal = Math.round(variant.price * 2 * 100) / 100;
  expect(await response.json()).toMatchObject({ _id: id, total_amount: subtotal - 20, COD: subtotal - 120 });
  await expect(page).toHaveURL(origin + list + '/' + id);
  const after = await page.request.get(receipt);
  expect(await after.body()).toEqual(await before.body());
});
