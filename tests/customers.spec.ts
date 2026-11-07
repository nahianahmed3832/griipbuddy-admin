import { randomInt } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const directory = '/desk/customers/customers';
const writable = process.env.GRIIP_ADMIN_CUSTOMER_TEST_ORIGIN ?? 'http://127.0.0.1:4327';

async function signIn(page: Page, origin: string, phone: string) {
  await page.goto(origin + '/sign-in');
  await page.getByLabel('Staff email or phone number').fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/desk\/overview$/);
}

test('the customer directory searches across accounts and links authorized staff to website orders', async ({ page, request }) => {
  expect((await request.get('/api/customers')).status()).toBe(401);
  await signIn(page, '', '01000000001');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(directory);
  await page.getByRole('searchbox', { name: 'Search' }).fill('+8801000000002');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('1 matching account · Shared across markets')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const exportUrl = await page.getByRole('link', { name: 'Export Excel' }).getAttribute('href');
  const download = await page.request.get(exportUrl!);
  expect(download.status()).toBe(200);
  expect(download.headers()['content-disposition']).toContain('customers.xlsx');
  expect((await download.body()).subarray(0, 2).toString()).toBe('PK');
  await page.getByRole('table', { name: 'Customer accounts' }).getByRole('link', { name: /^Open profile for/ }).click();
  await expect(page.getByRole('heading', { name: 'Website order history' })).toBeVisible();
  await expect(page.getByRole('link', { name: '#990001', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Staff activity' })).toBeVisible();
  await page.getByRole('link', { name: 'Customer directory', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('+8801000000002');

  await signIn(page, '', '01000000003');
  await page.goto(directory);
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  expect((await page.request.get('/api/customers')).status()).toBe(403);
});

test('customer creation leaves verification pending and records edits and private notes', async ({ page }) => {
  await signIn(page, writable, '01000000001');
  await page.goto(writable + '/desk/customers/create');
  const phone = '019' + String(randomInt(10000000, 99999999));
  const name = 'Fixture customer ' + phone.slice(-5);
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Mobile number').fill('+88 ' + phone);
  await page.getByLabel('Email address (optional)').fill('test@example.com');
  await page.getByRole('button', { name: 'Create customer', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('Pending', { exact: true })).toBeVisible();
  await expect(page.getByText('Customer created', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reactivate account' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit profile' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit profile' });
  await edit.getByLabel('Tags (optional)').fill('VIP, follow-up, vip');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('list', { name: 'Customer tags' }).getByText('vip', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Updated tags.', { exact: true })).toBeVisible();

  await page.getByLabel('Staff note', { exact: true }).fill('Synthetic follow-up note');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Synthetic follow-up note', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Synthetic follow-up note', { exact: true })).toBeVisible();

  const duplicate = await page.request.post(writable + '/api/customers', {
    headers: { Origin: writable }, data: { full_name: 'Duplicate', phone_number: phone, email: '' },
  });
  expect(duplicate.status()).toBe(409);
  const foreignOrigin = await page.request.post(writable + '/api/customers', {
    headers: { Origin: 'https://example.invalid' }, data: { full_name: 'Duplicate', phone_number: phone, email: '' },
  });
  expect(foreignOrigin.status()).toBe(403);
});
