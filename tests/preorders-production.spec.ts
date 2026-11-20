import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { jsPDF } from 'jspdf';
import { fixturePassword } from './fixture-password';

const origin = process.env.GRIIP_ADMIN_TEST_PREORDER_ORIGIN;
const prefix = process.env.NEXT_PUBLIC_GRIIP_ADMIN_PREFIX === '/admin' ? '/admin' : '';
const path = prefix + '/dashboard/pre-orders';
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMwMViNFTEMLQkAW45DwbLqlTgAAAAASUVORK5CYII=', 'base64');

test('pinned preorder routes support creation, row actions, editing and receipt review', async ({ page }) => {
  test.skip(!origin, 'Set GRIIP_ADMIN_TEST_PREORDER_ORIGIN to the mounted editable admin against an isolated fixture.');
  if (!origin || !/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(origin)) throw new Error('Use only a local synthetic fixture.');
  const unique = String(Date.now()).slice(-8);
  const phone = '019' + unique;
  await page.context().route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin + prefix + '/sign-in');
  await page.getByLabel('Phone Number', { exact: true }).fill('01000000001');
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(origin + prefix + '/dashboard/overview');

  await page.goto(origin + path);
  await expect(page.getByRole('heading', { name: /^All Pre-Orders/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Quote / Advance / Paid' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Requested - / })).toBeVisible();
  await page.getByRole('combobox', { name: 'Items per page' }).selectOption('40');
  await expect(page).toHaveURL(/limit=40/);
  await page.getByRole('main').getByRole('link', { name: 'Create Pre-Order' }).click();
  await expect(page.getByRole('heading', { name: 'Create Pre-Order' })).toBeVisible();
  await page.getByLabel('Product Name *', { exact: true }).fill('Fixture reference ' + unique);
  await page.getByLabel('Upload reference images').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: pixel });
  await expect(page.getByRole('button', { name: 'Remove reference image 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Add product' }).click();
  const second = page.getByRole('region', { name: 'Product 2' });
  await second.getByRole('button', { name: 'From our store' }).click();
  await second.getByLabel('Search Product').fill('FIXTURE-BD-BLUE');
  await second.getByRole('button', { name: /SKU: FIXTURE-BD-BLUE/i }).click();
  await page.getByLabel('Customer Name *', { exact: true }).fill('Synthetic preorder');
  await page.getByLabel('Phone *', { exact: true }).fill(phone);
  await page.getByLabel('Address *', { exact: true }).fill('Synthetic lane');
  await page.getByRole('button', { name: 'Create Pre-Order', exact: true }).click();
  await expect(page).toHaveURL(origin + path);
  await page.getByRole('searchbox', { name: 'Search' }).fill(phone);
  await expect(page.getByRole('heading', { name: 'All Pre-Orders (1)', exact: true })).toBeVisible();
  const order = page.getByRole('row').filter({ hasText: phone });
  await order.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(order.getByText(/Already called by/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'Select all' }).check();
  await page.getByRole('button', { name: 'Assign Batch', exact: true }).click();
  await page.getByLabel('Batch Label').fill('BATCH-' + unique);
  await page.getByRole('dialog').getByRole('button', { name: 'Assign Batch' }).click();
  await expect(order.getByText('BATCH-' + unique)).toBeVisible();
  const exportPath = await page.getByRole('link', { name: 'Download Excel' }).getAttribute('href');
  const workbook = await page.request.get(origin + exportPath);
  expect(workbook.ok()).toBe(true);
  expect((await workbook.body()).subarray(0, 2).toString()).toBe('PK');

  await order.locator('summary').click();
  await order.getByRole('link', { name: 'View Details' }).click();
  await expect(page.getByRole('heading', { name: 'Products (2)' })).toBeVisible();
  await page.getByRole('button', { name: 'Quote', exact: true }).click();
  await page.getByLabel('Unit Price (BDT)').fill('600');
  await page.getByLabel('Required Advance').fill('100');
  await page.getByRole('button', { name: 'Save Quote' }).click();
  await expect(page.getByRole('heading', { name: 'Quote & Payment' })).toBeVisible();
  await expect(page.getByText('1200', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Record Advance', exact: true }).click();
  await page.getByLabel('Amount Received (BDT)').fill('100');
  await page.getByLabel('Transaction ID').fill('PREORDER-FIXTURE');
  await page.getByRole('button', { name: 'Confirm Advance' }).click();
  await expect(page.getByText('Confirmed', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Upload Receipt' }).click();
  const document = new jsPDF();
  document.text('Synthetic preorder receipt', 20, 20);
  document.addPage();
  document.text('Synthetic receipt continued', 20, 20);
  await page.getByLabel('Upload payment proof').setInputFiles([
    { name: 'receipt.png', mimeType: 'image/png', buffer: pixel },
    { name: 'receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from(document.output('arraybuffer')) },
    { name: 'extra.png', mimeType: 'image/png', buffer: pixel },
  ]);
  await page.getByRole('button', { name: 'Remove extra.png' }).click();
  await page.getByRole('button', { name: 'Save Receipt' }).click();
  await page.getByRole('button', { name: 'View Receipt 1' }).click();
  await expect(page.getByRole('dialog', { name: 'Receipt 1' })).toBeVisible();
  const receiptPath = await page.getByRole('dialog', { name: 'Receipt 1' }).getByRole('link').getAttribute('href');
  const image = await page.request.get(origin + receiptPath);
  expect(image.headers()['content-type']).toBe('image/png');
  expect((await image.body()).subarray(0, 8)).toEqual(pixel.subarray(0, 8));
  await page.getByRole('button', { name: 'Close image gallery' }).click();
  await page.getByRole('button', { name: 'View Receipt 2' }).click();
  const pdfPreview = await page.getByRole('dialog', { name: 'Receipt 2' }).getByRole('link').getAttribute('href');
  const jpeg = await page.request.get(origin + pdfPreview);
  expect(jpeg.headers()['content-type']).toBe('image/jpeg');
  expect((await jpeg.body()).subarray(0, 3)).toEqual(Buffer.from([255, 216, 255]));
  await page.getByRole('button', { name: 'Close image gallery' }).click();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByRole('textbox', { name: 'Address *', exact: true }).fill('Updated synthetic lane');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Updated synthetic lane', { exact: true })).toBeVisible();

  const bulk = origin + prefix + '/api/preorders?action=bulk-status';
  const ids = Array.from({ length: 101 }, () => randomBytes(12).toString('hex'));
  const bulkStatus = (selected: string[]) => page.request.post(bulk, {
    headers: { origin }, data: { ids: selected, status: 'QUOTED' },
  });
  const accepted = await bulkStatus(ids.slice(0, 100));
  expect(accepted.status()).toBe(200);
  expect(await accepted.json()).toMatchObject({ modified: 0 });
  expect((await bulkStatus(ids)).status()).toBe(400);
});
