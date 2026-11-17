import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const origin = process.env.GRIIP_ADMIN_TEST_STOCK_CHANGES_ORIGIN || 'http://127.0.0.1:4327';
const fixtureLocation = '000000000000000000000007';
const first = 'FIXTURE-BD-BLUE';
const second = 'PREVIEW-FORM-CASE-STANDARD-1';

test.beforeAll(() => {
  if (!/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(origin)) throw new Error('Run stock changes acceptance only against a local fixture.');
});

async function add(page: Page, sku: string) {
  await page.getByLabel('Search product or SKU').fill(sku);
  await page.getByRole('button', { name: 'Find products' }).click();
  await page.getByRole('button', { name: 'Add ' + sku, exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Quantity for ' + sku })).toHaveValue('1');
}

async function location(page: Page, name: string, type: string) {
  const response = await page.request.post(origin + '/api/locations?region=BD', { headers: { origin }, data: {
    name, type, address: { local_address: 'Synthetic Rd', division: '', district: '', thana: '', zip_code: '' }, manager_name: '', contact_numbers: [],
  } });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).id as string;
}

test('stock staff transfer multiple products and expenses, then adjust warehouse stock and stock an outlet', async ({ page }) => {
  const suffix = String(Date.now()).slice(-8);
  await page.goto(origin + '/sign-in');
  await page.getByLabel('Phone Number', { exact: true }).fill('01000000001');
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(origin + '/dashboard/overview');
  const warehouse = await location(page, 'Synthetic transfer warehouse ' + suffix, 'WAREHOUSE');
  const outlet = await location(page, 'Synthetic transfer outlet ' + suffix, 'OUTLET');

  await page.goto(origin + '/desk/inventory/transfers/create');
  await page.getByLabel('From location').selectOption(fixtureLocation);
  await page.getByLabel('To location').selectOption(warehouse);
  await add(page, first);
  await add(page, second);
  await page.getByRole('button', { name: 'Add Expense', exact: true }).click();
  await page.getByLabel('Expense type 1').fill('Transport');
  await page.getByLabel('Expense amount 1').fill('50.25');
  await page.getByRole('button', { name: 'Add Expense', exact: true }).click();
  await page.getByLabel('Expense type 2').fill('Packing');
  await page.getByLabel('Expense amount 2').fill('20');
  await page.getByLabel('Expense note 2').fill('Test packaging');
  const transferPromise = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/stock-changes?mode=transfer'));
  await page.getByRole('button', { name: 'Record stock transfer' }).click();
  const original = await transferPromise;
  expect(original.status(), await original.text()).toBe(201);
  await expect(page.getByRole('status').filter({ hasText: 'Stock transfer recorded.' })).toBeVisible();
  const written = original.request().postDataJSON();
  const replay = await page.request.post(original.url(), { headers: { origin }, data: written });
  expect(replay.status(), await replay.text()).toBe(201);
  expect((await replay.json()).id).toBe((await original.json()).id);
  const wrongRegion = await page.request.post(original.url().replace('region=BD', 'region=INTERNATIONAL'), { headers: { origin }, data: {
    ...written, key: 'wrong-region-' + suffix,
  } });
  expect(wrongRegion.status()).toBe(404);

  await page.goto(origin + '/desk/inventory/warehouse-update');
  await page.getByLabel('Business location').selectOption(warehouse);
  await page.getByLabel('Reason', { exact: true }).fill('Fixture stock recount');
  await add(page, first);
  await add(page, second);
  await expect(page.getByRole('row').filter({ hasText: first }).filter({ has: page.getByRole('cell', { name: '1', exact: true }) })).toBeVisible();
  const adjustmentPromise = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('mode=warehouse-update'));
  await page.getByRole('button', { name: 'Record stock adjustment' }).click();
  const adjustment = await adjustmentPromise;
  expect(adjustment.status(), await adjustment.text()).toBe(201);
  await expect(page.getByRole('status').filter({ hasText: 'Stock adjustment recorded.' })).toBeVisible();
  const adjustmentRetry = await page.request.post(adjustment.url(), { headers: { origin }, data: adjustment.request().postDataJSON() });
  expect(adjustmentRetry.status()).toBe(201);
  expect((await adjustmentRetry.json()).id).toBe((await adjustment.json()).id);

  await page.goto(origin + '/desk/inventory/outlet-update');
  await page.getByLabel('From location').selectOption(warehouse);
  await page.getByLabel('To location').selectOption(outlet);
  await add(page, second);
  await expect(page.getByRole('row').filter({ hasText: second }).filter({ has: page.getByRole('cell', { name: '2', exact: true }) })).toBeVisible();
  await page.getByRole('button', { name: 'Record stock transfer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Stock transfer recorded.' })).toBeVisible();

  await page.goto(origin + '/desk/inventory/adjustments/create');
  await page.getByLabel('Business location').selectOption(outlet);
  await page.getByLabel('Adjustment type').selectOption('DEDUCTION');
  await page.getByLabel('Reason', { exact: true }).fill('Fixture outlet count correction');
  await add(page, second);
  await expect(page.getByRole('row').filter({ hasText: second }).filter({ has: page.getByRole('cell', { name: '1', exact: true }) })).toBeVisible();
  await page.getByRole('button', { name: 'Record stock adjustment' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Stock adjustment recorded.' })).toBeVisible();
});
