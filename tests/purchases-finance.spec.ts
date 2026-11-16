import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const origin = process.env.GRIIP_ADMIN_PURCHASE_TEST_ORIGIN ?? 'http://127.0.0.1:4327';

async function signIn(page: Page, suffix = '1') {
  await page.goto(origin + '/sign-in');
  await page.getByLabel('Staff email or phone number').fill('0100000000' + suffix);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(origin + '/desk/overview');
}

test('staff can update a supplier and save, filter and region-scope default rates', async ({ page }) => {
  await signIn(page);
  const reference = String(Date.now()).slice(-8);
  const name = 'Rate supplier ' + reference;
  await page.goto(origin + '/desk/inventory/suppliers');
  await page.getByRole('button', { name: 'Add supplier', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Supplier name').fill(name);
  await dialog.getByLabel('Contact reference number').fill(reference);
  await dialog.getByLabel('Supplier type').selectOption('COMPANY');
  await dialog.getByLabel('Payment terms').fill('Payment due in 30 days');
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByText('Payment due in 30 days', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit supplier', exact: true }).click();
  await dialog.getByLabel('Payment terms').fill('Payment due in 14 days');
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Payment due in 14 days', { exact: true })).toBeVisible();

  await page.goto(origin + '/desk/inventory/rates');
  await page.getByRole('link', { name: 'Set rates' }).click();
  await expect(page.getByRole('heading', { name: 'Default Purchase', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Supplier', exact: true }).selectOption({ label: name });
  await page.getByRole('combobox', { name: 'Search products by name or SKU' }).fill('FIXTURE-BD-BLUE');
  await page.getByRole('option', { name: /FIXTURE-BD-BLUE/ }).click();
  await page.getByLabel('Unit cost for FIXTURE-BD-BLUE').fill('123.45');
  await page.getByRole('button', { name: 'Create Default Purchase' }).click();
  await expect(page.getByText('Saved 1 purchase rate.')).toBeVisible();
  await page.goto(origin + '/desk/inventory/rates?q=FIXTURE-BD-BLUE');
  await expect(page.getByRole('row').filter({ hasText: 'FIXTURE-BD-BLUE' })).toContainText(name);
  await page.goto(origin + '/desk/inventory/rates?region=INTERNATIONAL&q=FIXTURE-BD-BLUE');
  await expect(page.getByText('No matching rates', { exact: true })).toBeVisible();
});

test('the Bangladesh expense ledger supports lookup records, edits, approval and scoped reporting', async ({ page, request }) => {
  await signIn(page);
  const sequence = String(Date.now()).slice(-7);
  const category = 'Expense category ' + sequence;
  const expense = 'Warehouse expense ' + sequence;
  await page.goto(origin + '/desk/payments/expense-categories/new');
  await page.getByLabel('Title').fill(category);
  await page.getByRole('button', { name: 'Save expense category' }).click();
  await expect(page.getByRole('heading', { name: category, exact: true })).toBeVisible();

  await page.goto(origin + '/desk/payments/expenses/new');
  await page.getByLabel('Title').fill(expense);
  await page.getByLabel('Amount (BDT)').fill('200.50');
  await page.getByLabel('Expense date').fill('2026-11-10');
  await page.getByLabel('Payment method').selectOption('cash');
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption({ label: category });
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(page.getByRole('heading', { name: expense, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Edit expense' }).click();
  await page.getByLabel('Amount (BDT)').fill('251.50');
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(page.getByText(/251\.5/)).toBeVisible();
  await page.getByLabel('Staff note').fill('Checked fixture voucher');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByText(/Checked fixture voucher/)).toBeVisible();
  await page.getByRole('button', { name: 'Withdraw approval' }).click();
  await expect(page.getByText('Unapproved', { exact: true })).toBeVisible();

  await page.goto(origin + '/desk/payments/expense-report');
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption({ label: category });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('table').filter({ hasText: category }).getByRole('row').filter({ hasText: category }).first()).toContainText(/251\.5/);
  const anonymous = await request.post(origin + '/api/finance-records?view=expenses&region=BD', { headers: { Origin: origin }, data: {} });
  expect(anonymous.status()).toBe(401);
  const wrongMarket = await page.request.post(origin + '/api/finance-records?view=expenses&region=INTERNATIONAL', { headers: { Origin: origin }, data: {} });
  expect(wrongMarket.status()).toBe(403);
});
