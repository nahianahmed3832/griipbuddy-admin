import { expect, test, type Locator, type Page } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const origin = new URL(process.env.GRIIP_ADMIN_R04_ORDER_ORIGIN ?? 'http://127.0.0.1:4332/admin');
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.username ||
    origin.password || origin.search || origin.hash || origin.pathname !== '/admin') {
  throw new Error('R04 order mutation checks require an isolated loopback Admin fixture under /admin.');
}
const target = origin.href;
const queue = target + '/dashboard/orders';
const firstOrder = '#990001';

async function signIn(page: Page, phone = '01000000001') {
  await page.goto(target + '/sign-in');
  await page.getByLabel('Phone Number', { exact: true }).fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard\/overview$/);
}

async function expectViewportFit(page: Page) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(width).toBeLessThanOrEqual(1);
}

async function expectInsideViewport(locator: Locator, width: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
}

for (const width of [1440, 768, 390, 320]) {
  test(`queue and detail fit at ${width}px with distinct order, payment and shipment fields`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    await page.goto(queue + '?filter=IN_TRANSIT');
    const orderLink = page.getByRole('link', { name: firstOrder, exact: true });
    await expect(orderLink).toBeVisible();

    const statuses = page.getByRole('navigation', { name: 'Filter orders by status' });
    if (width < 861) {
      await expect(statuses.getByRole('combobox', { name: 'Order status' })).toHaveValue('IN_TRANSIT');
      expect((await statuses.boundingBox())!.height).toBeLessThan(100);
    } else {
      await expect(statuses.getByRole('link', { name: 'In Transit · 22' })).toHaveAttribute('aria-current', 'page');
    }
    await expectViewportFit(page);

    const row = page.getByRole('row').filter({ has: orderLink });
    await expect(row.locator('[data-field="status"]')).toContainText('In transit');
    await expect(row.locator('[data-field="payment"]')).toContainText('400 BDT paid');
    await expect(row.locator('[data-field="shipment"]')).toContainText('Tracking available');
    await expect(row.locator('[data-field="total"]')).toContainText('2,000 BDT');

    if (width === 390) {
      const trigger = row.getByRole('button', { name: 'Actions for ' + firstOrder });
      await trigger.focus();
      await trigger.press('Enter');
      const menu = page.getByRole('menu', { name: 'Actions for ' + firstOrder });
      await expect(menu.getByRole('menuitem', { name: 'View Details' })).toBeFocused();
      await expectInsideViewport(menu, width);
      await page.keyboard.press('End');
      await expect(menu.getByRole('menuitem').last()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
    }

    await orderLink.click();
    const invoice = page.getByRole('region', { name: 'Invoice', exact: true });
    await expect(invoice.getByRole('heading', { name: /990001/ })).toBeVisible();
    const actions = page.getByRole('group', { name: 'Order actions', exact: true });
    await expect(actions.getByRole('button', { name: 'Order Actions', exact: true })).toBeInViewport();
    await expect(actions.getByRole('button', { name: 'Print Invoice' })).toBeInViewport();
    await expectInsideViewport(actions, width);
    await expectViewportFit(page);
    await expect(invoice.getByText('State unavailable', { exact: true })).toBeVisible();
    await expect(invoice.getByText('Tracking FIXTURE-TRACKING', { exact: true })).toBeVisible();

    const items = invoice.getByRole('region', { name: 'Invoice items' });
    await items.focus();
    await expect(items).toBeFocused();
    if (width === 320) {
      await expect.poll(() => items.evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
    }
    await page.emulateMedia({ media: 'print' });
    await expect(actions).toBeHidden();
    await expect(invoice).toBeVisible();
  });
}

test('mobile status, paging, back links and page size preserve the search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await signIn(page);
  await page.goto(queue + '?q=R04-Q-SYNTHETIC&filter=IN_TRANSIT');
  const pages = page.getByRole('navigation', { name: 'Order pages' });
  const status = page.getByRole('combobox', { name: 'Order status' });
  await expect(pages).toContainText('1–20 of 22');
  await pages.getByRole('link', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/q=R04-Q-SYNTHETIC&filter=IN_TRANSIT&page=2$/);
  await expect(pages).toContainText('21–22 of 22');
  await expect(pages.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();

  await page.getByRole('link', { name: '#990021', exact: true }).click();
  await page.getByRole('link', { name: 'Back to Orders' }).click();
  await expect(page).toHaveURL(/q=R04-Q-SYNTHETIC&filter=IN_TRANSIT&page=2$/);
  await expect(pages).toContainText('21–22 of 22');

  const size = pages.getByRole('combobox', { name: 'Orders per page' });
  await size.selectOption('40');
  await expect(page).toHaveURL(/q=R04-Q-SYNTHETIC&filter=IN_TRANSIT&limit=40$/);
  await expect(pages).toContainText('1–22 of 22');
  await status.selectOption('DELIVERED');
  await expect(page).toHaveURL(/q=R04-Q-SYNTHETIC&filter=DELIVERED&limit=40$/);
  await expect(page.getByRole('link', { name: '#990023', exact: true })).toBeVisible();
  await page.goBack();
  await expect(status).toHaveValue('IN_TRANSIT');
  await expect(size).toHaveValue('40');
  await expect(page.getByRole('searchbox', { name: 'Search orders' })).toHaveValue('R04-Q-SYNTHETIC');

  await status.selectOption('FAILED');
  await expect(page.getByText('No matching orders', { exact: true })).toBeVisible();
  await expect(pages).toContainText('0–0 of 0');
  await page.goto(queue + '?from=2025-11-02&to=2025-11-01');
  await expect(page.getByRole('alert').filter({ hasText: 'Review the date range' })).toBeVisible();
  await expect(page.getByText('Orders unavailable', { exact: true })).toBeVisible();
  await expect(pages).toContainText('Order count unavailable');
  await expectViewportFit(page);
});

test('order detail note dialog restores focus, validates and persists a supported change', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await signIn(page);
  await page.goto(queue + '?q=990001');
  await page.getByRole('link', { name: firstOrder, exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Order Actions', exact: true });
  await trigger.focus();
  await trigger.press('Enter');
  const actions = page.getByRole('dialog', { name: 'Order Actions', exact: true });
  await expect(actions.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(actions).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.press('Enter');
  await actions.getByRole('button', { name: 'Update Note' }).click();
  const dialog = page.getByRole('dialog', { name: 'Update Note', exact: true });
  const note = dialog.getByRole('textbox', { name: 'Staff note' });
  const add = dialog.getByRole('button', { name: 'Add note' });
  await add.click();
  await expect(dialog).toBeVisible();
  expect(await note.evaluate(element => (element as HTMLTextAreaElement).validity.valueMissing)).toBe(true);

  const message = 'R04 synthetic note ' + Date.now();
  await note.fill(message);
  await add.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Staff note added.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Order operations' }).getByText(message, { exact: true })).toBeVisible();
});

test('mobile order controls and server requests respect view and update permissions', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await signIn(page, '01000000006');
  await page.goto(queue + '?q=990001');
  const order = page.getByRole('link', { name: firstOrder, exact: true });
  const trigger = page.getByRole('button', { name: 'Actions for ' + firstOrder });
  await trigger.click();
  const menu = page.getByRole('menu', { name: 'Actions for ' + firstOrder });
  await expect(menu.getByRole('menuitem', { name: 'View Details' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Update Note' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await order.click();
  await expect(page.getByRole('button', { name: 'Print Invoice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Order Actions', exact: true })).toHaveCount(0);

  const url = new URL(page.url());
  const id = url.pathname.split('/').at(-1);
  const response = await page.request.post(target + '/api/website-orders?action=note&region=BD&id=' + id, {
    headers: { origin: origin.origin },
    data: { note: 'Rejected R04 synthetic note' },
  });
  expect(response.status()).toBe(403);
  expect(await response.text()).toBe('This workspace is read-only.');

  const warehouse = await browser.newPage({ viewport: { width: 390, height: 900 } });
  try {
    await signIn(warehouse, '01000000004');
    await warehouse.goto(url.href);
    await expect(warehouse.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
    await expect(warehouse.getByRole('region', { name: 'Invoice', exact: true })).toHaveCount(0);
    const read = await warehouse.request.get(target + '/api/website-orders?action=detail&region=BD&id=' + id);
    expect(read.status()).toBe(403);
  } finally {
    await warehouse.close();
  }
});
