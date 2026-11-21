import { expect, test, type Page } from '@playwright/test';
import { randomBytes, randomInt } from 'node:crypto';
import { fixturePassword } from './fixture-password';

const base = new URL(process.env.GRIIP_ADMIN_STAFF_TEST_ORIGIN ?? 'http://127.0.0.1:4327');
const localPrefixes = ['', '/', '/admin', '/admin/'];
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port || base.username || base.password ||
    base.search || base.hash || !localPrefixes.includes(base.pathname)) {
  throw new Error('Staff mutation tests require the isolated loopback fixture.');
}
const target = base.origin + base.pathname.replace(/\/$/, '');
const overviewPath = /\/(?:desk|dashboard)\/overview$/;

async function signIn(page: Page, phone: string, password: string) {
  await page.goto(target + '/sign-in');
  await page.getByLabel('Phone Number', { exact: true }).fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

test('staff access lifecycle, profile, first sign-in and role history persist in the recovered fixture', async ({ page, browser }) => {
  const sequence = randomInt(100000, 999999);
  const role = 'Browser warehouse ' + sequence;
  const name = 'Fixture staff ' + sequence;
  const phone = '01999' + sequence;
  const initial = randomBytes(24).toString('hex');
  const changed = randomBytes(24).toString('hex');
  const reset = randomBytes(24).toString('hex');
  await signIn(page, '01000000001', fixturePassword());
  await page.waitForURL(overviewPath);
  await page.goto(target + '/desk/staff/roles/new');
  await expect(async () => {
    await page.getByLabel('Start from a template').selectOption('');
    await page.getByLabel('Start from a template').selectOption('Warehouse viewer');
    await expect(page.getByLabel('Role name')).toHaveValue('Warehouse viewer', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel('Role name').fill(role);
  await page.getByRole('searchbox', { name: 'Find permissions' }).fill('order_status');
  await expect(page.getByText('View order status report')).toBeVisible();
  await expect(page.getByText('View low stock report')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Find permissions' }).fill('');
  await page.getByRole('checkbox', { name: 'View users' }).check();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.getByRole('heading', { name: 'Review changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm and save role' }).click();
  await page.waitForURL('**/desk/staff/roles');

  await page.goto(target + '/desk/staff/staff/new');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Sign-in phone number').fill(phone);
  await page.getByRole('combobox', { name: 'Role', exact: true }).selectOption({ label: role });
  await page.getByLabel('Assigned business location').selectOption({ label: 'Fixture warehouse (Bangladesh)' });
  await page.getByLabel('Initial password', { exact: true }).fill(initial);
  await page.getByLabel('Confirm initial password', { exact: true }).fill(initial);
  const created = page.waitForResponse(response => response.url().endsWith('/api/staff-access') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create staff account' }).click();
  expect(await (await created).json()).toEqual({ success: true });
  await page.waitForURL('**/desk/staff/staff');
  await page.getByRole('searchbox', { name: 'Search' }).fill(name);
  await page.getByRole('combobox', { name: 'Market', exact: true }).selectOption('BD');
  await page.getByRole('combobox', { name: 'Role', exact: true }).selectOption({ label: role });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('link', { name })).toBeVisible();

  const staffPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await signIn(staffPage, phone, initial);
    await staffPage.waitForURL('**/dashboard/profile');
    await expect(staffPage.getByRole('heading', { name: 'My profile' })).toBeVisible();
    await expect(staffPage.getByText('Change your password to continue to the workspace.')).toBeVisible();
    await staffPage.goto(target + '/dashboard/overview');
    await staffPage.waitForURL('**/dashboard/profile');
    const profileWhileRestricted = await staffPage.request.post(target + '/api/staff-access', {
      headers: { Origin: base.origin }, data: { action: 'profile-edit', values: { full_name: 'Attempt during rotation', revision: null } },
    });
    expect(profileWhileRestricted.status()).toBe(403);

    await staffPage.getByLabel('Current password', { exact: true }).fill(initial);
    await staffPage.getByLabel('New password', { exact: true }).fill(changed);
    await staffPage.getByLabel('Confirm new password', { exact: true }).fill(changed);
    await staffPage.getByRole('button', { name: 'Change password', exact: true }).click();
    await staffPage.waitForURL('**/sign-in');
    await signIn(staffPage, phone, changed);
    await staffPage.waitForURL(overviewPath);
    await staffPage.getByLabel('Account menu', { exact: true }).click();
    await staffPage.getByRole('link', { name: 'My profile' }).click();
    const updatedName = name + ' renamed';
    await staffPage.getByLabel('Full name').fill(updatedName);
    await staffPage.getByRole('button', { name: 'Save profile' }).click();
    await expect(staffPage.getByText('Profile saved.')).toBeVisible();
    await staffPage.reload();
    await expect(staffPage.getByLabel('Full name')).toHaveValue(updatedName);
    await expect(staffPage.getByLabel('Market', { exact: true })).toHaveValue('Bangladesh');
    await expect(staffPage.getByLabel('Role', { exact: true })).toHaveValue(role);
    const forged = await staffPage.request.post(target + '/api/staff-access', {
      headers: { Origin: base.origin }, data: { action: 'profile-edit', actor: 'fixture-owner', values: { role_ref: '100000000000000000000001' } },
    });
    expect(forged.status()).toBe(400);
    await staffPage.goto(target + '/dashboard/staffs');
    await expect(staffPage.getByRole('heading', { name: 'All Staffs' })).toBeVisible();
    await staffPage.goto(target + '/dashboard/staffs?market=INTERNATIONAL');
    await expect(staffPage.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
    await staffPage.goto(target + '/desk/staff/activity');
    await expect(staffPage.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
    await expect(staffPage.getByRole('region', { name: 'Access activity' })).toHaveCount(0);

    await page.goto(target + '/desk/staff/staff?q=' + encodeURIComponent(updatedName));
    await page.getByRole('link', { name: updatedName }).click();
    await page.getByRole('button', { name: 'Revoke sessions', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm: Revoke sessions' }).click();
    await expect(page.getByText('Sessions revoked.')).toBeVisible();
    const revoked = await staffPage.request.post(target + '/api/staff-access', {
      headers: { Origin: base.origin }, data: { action: 'profile-edit', values: { full_name: 'Stale update', revision: null } },
    });
    expect(revoked.status()).toBe(401);

    await page.getByText('Set staff password', { exact: true }).click();
    await page.getByLabel('New password', { exact: true }).fill(reset);
    await page.getByLabel('Confirm new password', { exact: true }).fill(reset);
    await page.getByRole('button', { name: 'Set password and revoke sessions' }).click();
    await expect(page.getByText('Password updated. Previous sessions were revoked.')).toBeVisible();
    await signIn(staffPage, phone, reset);
    await staffPage.waitForURL('**/dashboard/profile');
    await page.getByRole('button', { name: 'Suspend access' }).click();
    await page.getByRole('button', { name: 'Confirm: Suspend access' }).click();
    await expect(page.getByText('Suspended', { exact: true })).toBeVisible();
    await staffPage.reload();
    await staffPage.waitForURL('**/sign-in');
    await page.getByRole('button', { name: 'Reactivate access', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm: Reactivate access' }).click();
    await expect(page.getByText('Active', { exact: true })).toBeVisible();

    await page.goto(target + '/desk/staff/activity');
    await expect(page.getByRole('row', { name: new RegExp('Suspended access.*' + updatedName) })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp('Revoked sessions.*' + updatedName) })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp('Set staff password.*' + updatedName) })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp('Created role.*' + role) })).toBeVisible();
  } finally { await staffPage.close(); }
});
