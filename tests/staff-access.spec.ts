import { expect, test } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { fixturePassword } from './fixture-password';

test('a staff member can set a password and the owner can revoke access', async ({ page, browser }) => {
  const base = process.env.GRIIP_ADMIN_STAFF_TEST_ORIGIN ?? 'http://127.0.0.1:4327';
  const sequence = randomInt(100000, 999999);
  const role = 'Browser warehouse ' + sequence;
  const name = 'Fixture staff ' + sequence;
  const phone = '01999' + sequence;
  const password = 'Example warehouse passphrase ' + sequence;
  await page.goto(base + '/sign-in');
  await page.getByLabel('Email address or phone number').fill('01000000001');
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/desk/overview');
  await page.goto(base + '/desk/staff/roles/new');
  await page.getByLabel('Start from a template').selectOption('Warehouse viewer');
  await page.getByLabel('Role name').fill(role);
  await page.getByRole('searchbox', { name: 'Find permissions' }).fill('order_status');
  await expect(page.getByText('View order status report')).toBeVisible();
  await expect(page.getByText('View low stock report')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Find permissions' }).fill('');
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.getByRole('heading', { name: 'Review changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm and save role' }).click();
  await page.waitForURL('**/desk/staff/roles');

  await page.goto(base + '/desk/staff/staff/new');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Sign-in phone number').fill(phone);
  await page.getByLabel('Role', { exact: true }).selectOption({ label: role });
  await page.getByLabel('Assigned business location').selectOption({ label: 'Fixture warehouse (Bangladesh)' });
  await page.getByRole('button', { name: 'Create setup link' }).click();
  await expect(page.getByRole('heading', { name: 'Setup link ready' })).toBeVisible();
  const url = await page.getByLabel('Staff setup link').inputValue();
  const invitee = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await invitee.goto(url);
    await invitee.getByLabel('New password').fill(password);
    await invitee.getByLabel('Confirm password').fill(password);
    await invitee.getByRole('button', { name: 'Activate account' }).click();
    await expect(invitee.getByRole('heading', { name: 'Account is ready' })).toBeVisible();
    await invitee.getByRole('link', { name: 'Go to staff sign-in' }).click();
    await invitee.getByLabel('Email address or phone number').fill(phone);
    await invitee.getByLabel('Password', { exact: true }).fill(password);
    await invitee.getByRole('button', { name: 'Sign in' }).click();
    await invitee.waitForURL('**/desk/overview');

    await page.goto(base + '/desk/staff/staff?q=' + encodeURIComponent(name));
    await expect(page.getByRole('cell', { name: 'Active', exact: true })).toBeVisible();
    await page.getByRole('link', { name }).click();
    await page.getByRole('button', { name: 'Suspend access' }).click();
    await page.getByRole('button', { name: 'Confirm: Suspend access' }).click();
    await expect(page.getByText('Suspended', { exact: true })).toBeVisible();
    await invitee.reload();
    await invitee.waitForURL('**/sign-in');

    await page.goto(base + '/desk/staff/activity');
    await expect(page.getByRole('row', { name: new RegExp('Suspended access.*' + name) })).toBeVisible();
  } finally { await invitee.close(); }
});
