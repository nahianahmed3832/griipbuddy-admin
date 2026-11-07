import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const origin = process.env.GRIIP_ADMIN_TEST_WEBSITE_ORDER_ORIGIN || 'http://127.0.0.1:4327';
const list = '/desk/orders/orders';
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMwMViNFTEMLQkAW45DwbLqlTgAAAAASUVORK5CYII=', 'base64');

async function signIn(page: Page, suffix = '1') {
  await page.goto(origin + '/sign-in');
  await page.getByLabel('Staff email or phone number').fill('0100000000' + suffix);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(origin + '/desk/overview');
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
  await dialog.getByLabel('Staff note').fill('Synthetic order checked.');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(row.getByText('Synthetic order checked.')).toBeVisible();
  await row.getByRole('button', { name: /Actions for/ }).click();
  await dialog.getByRole('button', { name: 'Edit Order' }).click();
  await dialog.getByLabel('Delivery address').fill('Updated fixture address');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(row.getByText('Updated fixture address')).toBeVisible();
  await row.getByRole('button', { name: /Actions for/ }).click();
  await dialog.getByRole('button', { name: 'Update Status' }).click();
  await dialog.getByLabel('New status').selectOption('ACCEPTED');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
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
  await page.goto(origin + '/desk/orders/create');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
});
