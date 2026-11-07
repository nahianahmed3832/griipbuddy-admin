import { expect, test } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const origin = process.env.GRIIP_ADMIN_TEST_ACCOUNTING_ORIGIN ?? 'http://127.0.0.1:4327';
const path = '/desk/payments/accounting';

test('opens an entity, approves income and a regional expense, and exports the HQ statement', async ({ page }) => {
  const name = 'Accounting browser fixture ' + Date.now();
  const book = 'browser-' + Date.now();
  await page.goto(origin + '/sign-in');
  await page.getByLabel('Staff email or phone number').fill('01000000001');
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(origin + '/desk/overview');

  await page.goto(origin + path + '?view=books');
  await page.getByLabel('Book code').fill(book);
  await page.getByLabel('Legal entity name').fill(name);
  await page.getByLabel('Registration country code').fill('US');
  await page.getByRole('button', { name: 'Create book' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved to the accounting workspace.' })).toBeVisible();

  await page.getByRole('link', { name: 'Record income or expense' }).click();
  await page.getByLabel('Legal entity book').selectOption(book);
  await page.getByLabel('Entry type').selectOption('income');
  await page.getByLabel('Transaction currency').selectOption('USD');
  await page.getByLabel('Amount', { exact: true }).fill('200');
  await page.getByLabel('Description').fill('Fixture sales income');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page).toHaveURL(/view=journal/);
  const income = page.locator('details.finance-record').filter({ hasText: 'Fixture sales income' }).first();
  await income.locator('summary').click();
  await income.getByRole('checkbox').check();
  await income.getByRole('button', { name: 'Approve and post' }).click();
  await expect(income.locator('summary')).toContainText('posted');

  await page.getByRole('link', { name: 'Record income or expense' }).click();
  await page.getByLabel('Legal entity book').selectOption(book);
  await page.getByLabel('Amount', { exact: true }).fill('3000');
  await page.getByLabel('Description').fill('Fixture Dhaka warehouse');
  await page.getByLabel('USD per 1 BDT').fill('0.008');
  await page.getByLabel('Exchange-rate source for this date').fill('Fixture rate evidence');
  await page.getByLabel('Debit account').selectOption('6100');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page).toHaveURL(/view=journal/);
  const expense = page.locator('details.finance-record').filter({ hasText: 'Fixture Dhaka warehouse' }).first();
  await expense.locator('summary').click();
  await expect(expense.getByText('BDT 3,000.00', { exact: true })).toHaveCount(2);
  await expense.getByRole('checkbox').check();
  await expense.getByRole('button', { name: 'Approve and post' }).click();
  await expect(expense.locator('summary')).toContainText('posted');

  await page.getByRole('link', { name: 'Profit & loss' }).click();
  await page.getByLabel('Reporting scope').selectOption('hq');
  await page.getByLabel('Legal entity', { exact: true }).selectOption(book);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.locator('.metric').filter({ hasText: 'Net profit / loss' })).toContainText('USD 176.00');
  const exportLink = page.getByRole('link', { name: 'Download working papers' });
  const exported = await page.request.get(origin + await exportLink.getAttribute('href'));
  expect(exported.status()).toBe(200);
  expect(await exported.text()).toContain('"Net profit or loss","176"');
  expect(exported.headers()['content-disposition']).toMatch(/griipbuddy-report-.*\.csv/);
});
