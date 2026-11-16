import { expect, test } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const origin = process.env.GRIIP_ADMIN_TEST_PREORDER_ORIGIN || 'http://127.0.0.1:4327';
const path = '/desk/orders/preorders';
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMwMViNFTEMLQkAW45DwbLqlTgAAAAASUVORK5CYII=', 'base64');

test.beforeAll(() => {
  if (!/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(origin)) throw new Error('Run pre-order acceptance only against a local fixture.');
});

test('staff can create, quote, receive, edit, export and manage a pre-order', async ({ page }) => {
  const suffix = String(Date.now()).slice(-8);
  const product = 'GriipBuddy reference ' + suffix;
  await page.goto(origin + '/sign-in');
  await page.getByLabel('Staff email or phone number').fill('01000000001');
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(origin + '/desk/overview');

  await page.goto(origin + path);
  await page.getByRole('link', { name: 'Create pre-order', exact: true }).click();
  await page.getByLabel('Product name', { exact: true }).fill(product);
  await page.getByLabel('Upload a reference image').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: pixel });
  await expect(page.getByLabel('Reference images, one link per line')).toHaveValue(/^pre-orders\/[a-f0-9-]+\.png$/);
  await page.getByLabel('Catalog product or SKU').fill('FIXTURE-BD-BLUE');
  await page.getByRole('button', { name: 'Find products' }).click();
  await page.getByRole('button', { name: 'Add FIXTURE-BD-BLUE', exact: true }).click();
  await page.getByLabel('Customer name').fill('Synthetic customer');
  await page.getByLabel('Customer phone', { exact: true }).fill('019' + suffix);
  await page.getByLabel('Delivery address').fill('Synthetic lane, Dhaka');
  await page.getByRole('button', { name: 'Create pre-order', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(path + '/[0-9a-f]{24}$'));
  const id = page.url().split('/').at(-1);
  await expect(page.getByRole('heading', { name: product + ' × 1' })).toBeVisible();
  await expect(page.getByText(/Catalog item · FIXTURE-BD-BLUE/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reference image 1' })).toHaveAttribute('href', /^https:\/\/media\.fixture\.invalid\/pre-orders\//);

  await page.getByText('Quote', { exact: true }).click();
  await page.getByLabel('Quoted unit price', { exact: true }).fill('600');
  await page.getByLabel('Advance required', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Save quote', exact: true }).click();
  await expect(page.getByText('৳1,200', { exact: true }).first()).toBeVisible();
  await page.getByText('Record advance', { exact: true }).click();
  await page.getByLabel('Amount received').fill('100');
  await page.getByLabel('Payment method', { exact: true }).fill('bKash');
  await page.getByLabel('Transaction ID').fill('PRE-FIXTURE-TRX');
  await page.getByLabel('I verified this payment.').check();
  await page.getByRole('button', { name: 'Save advance', exact: true }).click();
  await expect(page.getByText('PRE-FIXTURE-TRX')).toBeVisible();

  await page.getByText('Attach payment receipt', { exact: true }).click();
  await page.getByLabel('Receipt image').setInputFiles({ name: 'payment.png', mimeType: 'image/png', buffer: pixel });
  await page.getByRole('button', { name: 'Upload receipt' }).click();
  const receipt = page.getByRole('link', { name: 'View receipt 1' });
  await expect(receipt).toBeVisible();
  const receiptPath = await receipt.getAttribute('href');
  const image = await page.request.get(origin + receiptPath);
  expect(image.status(), await image.text()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/png');
  expect((await image.body()).subarray(0, 8).equals(pixel.subarray(0, 8))).toBe(true);
  expect((await page.request.get(origin + receiptPath + '&region=INTERNATIONAL')).status()).toBe(403);

  await page.getByText('Add staff note', { exact: true }).click();
  await page.getByLabel('Staff note', { exact: true }).fill('Verified a synthetic receipt.');
  await page.getByRole('button', { name: 'Save staff note' }).click();
  await expect(page.getByText(/Verified a synthetic receipt\./)).toBeVisible();

  await page.getByText('Mark as called', { exact: true }).click();
  await page.getByLabel('I contacted the customer.').check();
  await page.getByRole('button', { name: 'Record call' }).click();
  await expect(page.getByText(/Called by/)).toBeVisible();

  await page.getByText('Send SMS', { exact: true }).click();
  await page.getByLabel('SMS message').fill('Synthetic fixture message.');
  await page.getByLabel(/Send this message to/).check();
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Synthetic fixture message.', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Edit pre-order' }).click();
  await page.getByLabel('Delivery address').fill('Updated synthetic lane');
  await page.getByRole('button', { name: 'Save pre-order' }).click();
  await expect(page.getByText('Updated synthetic lane', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Back to pre-orders' }).click();
  await page.getByLabel('Search', { exact: true }).fill(product);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('heading', { name: 'Pre-orders (1)', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Select all visible pre-orders' }).check();
  await page.getByText('Assign selected to batch', { exact: true }).click();
  await page.getByLabel('Batch label').fill('FIXTURE-' + suffix);
  await page.getByRole('button', { name: 'Assign batch' }).click();
  await expect(page.getByRole('cell', { name: 'FIXTURE-' + suffix })).toBeVisible();
  await page.getByText('Change selected statuses', { exact: true }).click();
  await page.getByLabel('New status').selectOption('PURCHASED');
  await page.getByRole('button', { name: 'Apply status' }).click();
  await expect(page.getByRole('cell', { name: 'Purchased', exact: true })).toBeVisible();

  const download = await page.getByRole('link', { name: 'Download Excel' }).getAttribute('href');
  const report = await page.request.get(origin + download);
  expect(report.status()).toBe(200);
  expect(report.headers()['content-disposition']).toContain('pre-orders.xlsx');
  expect((await report.body()).subarray(0, 2).toString()).toBe('PK');
  await page.getByText('Send selected to courier', { exact: true }).click();
  await page.getByLabel('I verified the addresses and cash to collect for the selected pre-orders.').check();
  await page.getByRole('button', { name: 'Dispatch selected' }).click();
  await expect(page.getByText('1 dispatched. 0 could not be dispatched. Review each pre-order before retrying.')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Handed over to courier', exact: true })).toBeVisible();
  const crossOrigin = await page.request.post(origin + '/api/preorders?action=remove&id=' + id, {
    headers: { origin: 'https://example.com' }, data: {},
  });
  expect(crossOrigin.status()).toBe(403);

  await page.goto(origin + path + '/' + id);
  await page.getByText('Delete pre-order', { exact: true }).click();
  await page.getByLabel('Permanently delete this pre-order.').check();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page).toHaveURL(origin + path);
  await page.goto(origin + path + '/' + id);
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
});
