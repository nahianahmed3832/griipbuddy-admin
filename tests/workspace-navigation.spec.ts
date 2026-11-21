import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { fixturePassword } from './fixture-password';

const base = new URL(process.env.GRIIP_ADMIN_NAV_TEST_ORIGIN ?? 'http://127.0.0.1:4338/admin');
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port || base.username || base.password ||
    base.search || base.hash || !['/', '/admin', '/admin/'].includes(base.pathname)) {
  throw new Error('Workspace navigation tests require an isolated loopback Admin and synthetic staff.');
}
const target = base.origin + base.pathname.replace(/\/$/, '');
const baseline = process.env.GRIIP_ADMIN_NAV_BASELINE === '1';
const evidence = process.env.GRIIP_ADMIN_NAV_EVIDENCE_DIR;
const overviewPath = /\/dashboard\/overview(?:\?|$)/;

async function signIn(page: Page, phone = '01000000001') {
  await page.goto(target + '/sign-in');
  await page.getByLabel('Phone Number', { exact: true }).fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(overviewPath);
}

async function capture(page: Page, view: string) {
  if (evidence) await page.screenshot({ path: join(evidence, 'r04-admin-shell-' + (baseline ? 'before' : 'after') + '-' + view + '.png'), animations: 'disabled' });
}

const sizes = [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }];
for (const size of sizes) {
  test(`workspace shell at ${size.width} CSS pixels`, async ({ page }) => {
    await page.setViewportSize(size);
    await signIn(page);
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    const workspace = breadcrumb.getByRole('link', { name: 'Core workspace', exact: true });
    await expect(breadcrumb.getByText('Overview', { exact: true })).toBeVisible();
    if (baseline && size.width < 851) await expect(workspace).toBeHidden();
    else await expect(workspace).toBeVisible();
    await expect(page.getByLabel('Operating region: Bangladesh', { exact: true })).toBeVisible();
    await capture(page, String(size.width));
    if (!baseline) expect(await page.locator('html').evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);

    if (size.width === 1440) {
      const account = page.getByLabel('Account menu', { exact: true });
      await account.click();
      await expect(page.getByRole('link', { name: 'My profile', exact: true })).toBeVisible();
      await capture(page, '1440-account');
      await account.click();
    }

    if (size.width < 851) {
      const toggle = page.getByRole('button', { name: 'Open navigation' });
      await toggle.focus();
      await page.keyboard.press('Enter');
      const drawer = page.getByRole('dialog', { name: 'Navigation', exact: true });
      const close = drawer.getByRole('button', { name: 'Close navigation' });
      await expect(drawer).toBeVisible();
      await expect(close).toBeFocused();
      await capture(page, size.width + '-drawer');
      if (!baseline) {
        const orders = drawer.getByRole('button', { name: 'Website Orders' });
        expect((await orders.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        const first = drawer.locator('a[href]').first();
        await first.focus();
        await page.keyboard.press('Shift+Tab');
        await expect(first).not.toBeFocused();
        await page.keyboard.press('Tab');
        await expect(first).toBeFocused();
        await page.keyboard.press('Control+k');
        await expect(page.getByRole('dialog', { name: 'Search workspace' })).toHaveCount(0);
      }
      await page.keyboard.press('Escape');
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }

    const search = page.getByRole('button', { name: 'Search workspace' });
    await search.focus();
    await page.keyboard.press('Control+k');
    const searchDialog = page.getByRole('dialog', { name: 'Search workspace' });
    await expect(searchDialog.getByRole('textbox')).toBeFocused();
    await searchDialog.getByRole('textbox').fill('All Orders');
    await expect(searchDialog.getByRole('link', { name: /^All Orders Sales & Orders/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(search).toBeFocused();
    if (!baseline && size.width < 851) {
      const toggle = page.getByRole('button', { name: 'Open navigation' });
      await toggle.click();
      const drawer = page.getByRole('dialog', { name: 'Navigation', exact: true });
      await drawer.getByRole('button', { name: 'Website Orders' }).click();
      await drawer.getByRole('link', { name: 'All Orders', exact: true }).click();
      await page.waitForURL(/\/dashboard\/orders(?:\?|$)/);
      await expect(breadcrumb.getByText('All Orders', { exact: true })).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
    }
  });
}

test('active groups, account spacing and the existing authorized market controls', async ({ page }) => {
  test.skip(baseline);
  await page.setViewportSize(sizes[0]);
  await signIn(page);
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  const orders = nav.getByRole('button', { name: 'Website Orders' });
  await expect(orders).toHaveAttribute('aria-expanded', 'false');
  const controlled = await orders.getAttribute('aria-controls');
  expect(controlled).toBeTruthy();
  await orders.focus();
  await page.keyboard.press('Space');
  await expect(orders).toHaveAttribute('aria-expanded', 'true');
  const allOrders = nav.getByRole('link', { name: 'All Orders', exact: true });
  await expect(page.locator(`[id="${controlled}"]`).getByRole('link', { name: 'All Orders' })).toBeVisible();
  await allOrders.click();
  await page.waitForURL(/\/dashboard\/orders(?:\?|$)/);
  await expect(allOrders).toHaveAttribute('aria-current', 'page');
  await expect(orders).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('All Orders', { exact: true })).toBeVisible();

  const account = page.getByLabel('Account menu', { exact: true });
  const spacing = page.getByLabel('Sidebar spacing', { exact: true });
  const shell = page.locator('[data-sidebar-density]');
  await account.click();
  await expect(spacing).toHaveValue('standard');
  const standardHeight = (await orders.boundingBox())!.height;
  await spacing.selectOption('compact');
  await expect(shell).toHaveAttribute('data-sidebar-density', 'compact');
  await expect.poll(async () => (await orders.boundingBox())!.height).toBeLessThan(standardHeight);
  await capture(page, '1440-account-compact');
  await spacing.focus();
  await page.keyboard.press('Escape');
  await expect(spacing).toBeHidden();
  await expect(account).toBeFocused();
  await page.reload();
  await expect(shell).toHaveAttribute('data-sidebar-density', 'compact');

  const market = page.getByLabel('Operating region: Bangladesh', { exact: true });
  await account.click();
  await market.click();
  await expect(spacing).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(market).toBeFocused();
  await market.click();
  await expect(page.getByRole('link', { name: 'Bangladesh', exact: true })).toHaveAttribute('aria-current', 'true');
  await page.getByRole('link', { name: 'International', exact: true }).click();
  await page.waitForURL(/region=INTERNATIONAL/);
  const international = page.getByLabel('Operating region: International', { exact: true });
  await expect(international).toBeVisible();
  await international.click();
  await page.getByRole('link', { name: 'Bangladesh', exact: true }).click();
  await expect(market).toBeVisible();

  await account.click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(/\/sign-in$/);
  await signIn(page, '01000000004');
  await expect(shell).toHaveAttribute('data-sidebar-density', 'standard');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Market workspace', { exact: true })).toBeVisible();
  await expect(page.locator('details.workspace-market')).toHaveCount(0);
  await expect(orders).toHaveCount(0);
  await page.goto(target + '/dashboard/overview?region=INTERNATIONAL');
  await expect(page.getByLabel('Operating region: Bangladesh', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Operating region: International', { exact: true })).toHaveCount(0);
  await page.goto(target + '/desk/staff/activity');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
});
