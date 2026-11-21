import { expect, test, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';
import { fixturePassword } from './fixture-password';

const base = new URL(process.env.GRIIP_ADMIN_OVERVIEW_TEST_ORIGIN ?? 'http://127.0.0.1:4327');
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port ||
    !['/', '/admin', '/admin/'].includes(base.pathname) || base.username || base.password || base.search || base.hash) {
  throw new Error('Use the isolated Admin fixture for responsive overview checks.');
}
const origin = base.origin + base.pathname.replace(/\/$/, '');
const dashboard = origin + '/dashboard/overview';
const evidenceDir = process.env.GRIIP_ADMIN_OVERVIEW_EVIDENCE;
const fixtureLocation = '000000000000000000000007';
const viewportWidths = [320, 390, 768, 1440];

async function signIn(page: Page, phone = '01000000001') {
  await page.goto(origin + '/sign-in');
  await page.getByLabel('Phone Number', { exact: true }).fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(dashboard);
}

async function pageContained(page: Page) {
  const bounds = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(bounds.scrollWidth).toBe(bounds.width);
}

async function visibleDefinition(page: Page, trigger: Locator, width: number) {
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-describedby', await tooltip.getAttribute('id') ?? '');
  await expect(tooltip).not.toHaveText('');
  await expect.poll(async () => {
    const rect = await tooltip.boundingBox();
    return Boolean(rect && rect.x >= 7 && rect.x + rect.width <= width - 7 &&
      rect.y >= 7 && rect.y + rect.height <= (page.viewportSize()?.height ?? 0) - 7);
  }).toBe(true);
  await pageContained(page);
  const bounds = await tooltip.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}

async function screenshot(page: Page, filename: string) {
  if (evidenceDir) await page.screenshot({ path: join(evidenceDir, filename), animations: 'disabled' });
}

const placedDefinition = (page: Page) => page.getByRole('button', { name: 'Orders placed definition', exact: true }).first();

for (const width of viewportWidths) {
  test(`overview definitions stay in bounds and dismiss at ${width}px`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 844 });
    await signIn(page);
    const left = placedDefinition(page);
    const right = page.getByRole('button', { name: width < 640 ? 'Cancelled before dispatch definition' : 'Returns processed definition', exact: true });
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
    const anchor = await left.boundingBox();
    const rightAnchor = await right.boundingBox();
    expect(anchor).not.toBeNull();
    expect(rightAnchor?.x).toBeGreaterThan(anchor!.x);

    const priorLink = page.getByRole('region', { name: 'Trading snapshot' }).getByRole('link', { name: 'Orders placed', exact: true });
    await priorLink.focus();
    await page.keyboard.press('Tab');
    await expect(left).toBeFocused();
    const focused = await visibleDefinition(page, left, width);
    await screenshot(page, `dashboard-tooltip-after-${width}.png`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(left).toBeFocused();
    await page.keyboard.press('Tab');

    await right.hover();
    const hovered = await visibleDefinition(page, right, width);
    await page.getByRole('tooltip').hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await page.mouse.move(width - 2, 2);
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    const touch = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true });
    try {
      const touchPage = await touch.newPage();
      await signIn(touchPage);
      const touchButton = placedDefinition(touchPage);
      await touchButton.tap();
      const tapped = await visibleDefinition(touchPage, touchButton, width);
      await touchButton.tap();
      await expect(touchPage.getByRole('tooltip')).toHaveCount(0);
      await touchButton.tap();
      await expect(touchPage.getByRole('tooltip')).toBeVisible();
      await touchPage.touchscreen.tap(width - 2, 2);
      await expect(touchPage.getByRole('tooltip')).toHaveCount(0);
      await test.info().attach('viewport geometry', {
        body: JSON.stringify({ width, anchor, rightAnchor, focused, hovered, tapped }, null, 2),
        contentType: 'application/json',
      });
    } finally {
      await touch.close();
    }
  });

  test(`dashboard report drilldowns preserve their scope at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await signIn(page);
    const filters = { period: 'custom', from: '2026-01-01', to: '2026-11-21', compare: 'none' };
    const scenarios = [
      { label: 'Sales report', title: /^Sales Summary$/i, slug: 'sales-summary', scope: { ...filters, locations: fixtureLocation } },
      { label: 'Order status report', title: /^Order Status/i, slug: 'order-status', scope: { ...filters, region: 'INTERNATIONAL', currency: 'EUR' } },
    ];

    for (const { label, title, slug, scope } of scenarios) {
      await page.goto(dashboard + '?' + new URLSearchParams(scope as Record<string, string>));
      const drilldown = page.getByRole('link', { name: label, exact: true });
      await drilldown.click();
      await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
      await expect(page).toHaveURL(current => current.pathname.endsWith('/reports/' + slug) &&
        Object.entries(scope).every(([key, value]) => current.searchParams.get(key) === value));
      await expect(page.getByRole('combobox', { name: 'Period', exact: true })).toHaveText('Custom range');
      await expect(page.getByLabel('From', { exact: true })).toHaveValue(filters.from);
      await expect(page.getByLabel('To', { exact: true })).toHaveValue(filters.to);
      await pageContained(page);

      const report = page.locator('.production-report-page');
      if ('currency' in scope) {
        await expect(report.locator('.report-header-copy')).toContainText('International · EUR');
        await expect(page.getByRole('combobox', { name: 'Currency', exact: true })).toHaveText('EUR');
      } else {
        await expect(report.locator('.report-header-copy')).toContainText('Bangladesh · BDT');
        await expect(page.getByRole('button', { name: 'Locations', exact: true })).toContainText('Fixture warehouse');
        const compare = page.getByRole('switch', { name: 'Compare with previous period' });
        await expect(compare).not.toBeChecked();
        await compare.click();
        await expect(page).toHaveURL(current => !current.searchParams.has('compare') &&
          current.searchParams.get('locations') === fixtureLocation && current.searchParams.get('from') === filters.from);
        await page.reload();
        await expect(compare).toBeChecked();
        await expect(page.getByRole('button', { name: 'Locations', exact: true })).toContainText('Fixture warehouse');
      }

      await screenshot(page, `dashboard-${slug}-after-${width}.png`);
      const table = report.getByRole('region', { name: / table$/ }).first();
      await expect(table).toBeVisible();
      await table.focus();
      await expect(table).toBeFocused();
      const tableBounds = await table.evaluate(el => ({
        width: el.clientWidth, scrollWidth: el.scrollWidth, outsideViewport: el.getBoundingClientRect().right > window.innerWidth,
      }));
      expect(tableBounds.outsideViewport).toBe(false);
      if (tableBounds.scrollWidth > tableBounds.width) {
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      }

      const refresh = page.getByRole('link', { name: 'Refresh', exact: true });
      const refreshUrl = new URL((await refresh.getAttribute('href'))!, origin);
      for (const [key, value] of Object.entries(scope)) {
        if (key !== 'compare') expect(refreshUrl.searchParams.get(key)).toBe(value);
      }
      if (width === 390) {
        await refresh.click();
        await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
        await expect(page.getByLabel('From', { exact: true })).toHaveValue(filters.from);
        await pageContained(page);
      }
      if (evidenceDir) await test.info().attach(slug + ' table geometry', {
        body: JSON.stringify({ width, tableBounds, scope }, null, 2),
        contentType: 'application/json',
      });
    }
  });
}

test('a bad report filter can be reset without changing market', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto(origin + '/dashboard/reports/sales-summary?region=INTERNATIONAL&currency=INVALID');
  await expect(page.getByRole('alert').filter({ hasText: 'These report filters could not be applied.' })).toBeVisible();
  await page.getByRole('link', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Sales Summary$/i })).toBeVisible();
  await expect(page).toHaveURL(url => url.searchParams.get('region') === 'INTERNATIONAL' && !url.searchParams.has('currency'));
  await pageContained(page);
});

test('a limited account cannot open the report through a direct URL', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, '01000000003');
  await expect(page.getByRole('link', { name: 'Sales report', exact: true })).toHaveCount(0);
  await page.goto(origin + '/dashboard/reports/sales-summary');
  await expect(page.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible();
  await expect(page.locator('.production-report-page')).toHaveCount(0);
});
