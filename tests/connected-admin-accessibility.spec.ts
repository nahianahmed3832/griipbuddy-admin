import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fixturePassword } from './fixture-password';

const admin = '/admin/dashboard';
const screens = [
  ['categories', 'Catalog organization'],
  ['category-attributes', 'Catalog organization'],
  ['catalog-menus', 'Catalog organization'],
  ['catalog-collections', 'Catalog organization'],
  ['products', 'Products'],
  ['create-product', 'Create Product'],
  ['check-outlet-stocks', 'Stock report'],
  ['marketplace-orders', 'Marketplace orders'],
  ['homepage', 'Homepage merchandising'],
] as const;

test('existing catalog operations remain keyboard accessible at each viewport', async ({ page, baseURL }, info) => {
  test.setTimeout(120_000);
  await page.context().route(url => url.origin !== baseURL && !['about:', 'data:'].includes(url.protocol), route => route.abort());
  await page.goto('/admin/sign-in');
  await page.getByLabel('Phone Number').fill('01000000001');
  await page.getByLabel('Password').fill(fixturePassword());
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/admin\/dashboard\/overview$/);

  await page.goto(admin + '/categories');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Catalog organization' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(main).toBeFocused();

  const toggle = page.getByRole('button', { name: 'Toggle Sidebar' });
  if (info.project.name === 'mobile') {
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await expect(drawer.getByRole('button', { name: 'Close navigation' })).toBeFocused();
    for (const key of ['Shift+Tab', 'Shift+Tab', 'Tab', 'Tab']) {
      await page.keyboard.press(key);
      await expect.poll(() => drawer.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  } else {
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }

  for (const [route, title] of screens) {
    await test.step('Audit ' + route, async () => {
      await page.goto(admin + '/' + route, { waitUntil: 'domcontentloaded' });
      await expect(main.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
      const { violations } = await new AxeBuilder({ page }).include('#main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(violations.flatMap(violation => violation.nodes.map(node => `${violation.id} ${node.target.join(' ')}`))).toEqual([]);
    });
  }

  await page.goto(admin + '/check-outlet-stocks');
  const search = page.getByRole('searchbox', { name: 'Search warehouse stock' });
  await search.focus();
  await page.keyboard.press('Tab');
  await expect(main.getByRole('button', { name: 'Search', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  const table = main.getByRole('region', { name: 'Warehouse stock table' });
  await expect(table).toBeFocused();
  if (info.project.name === 'mobile') {
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => table.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  }
  await search.fill('acceptance-no-such-physical-sku');
  await search.press('Enter');
  await expect(main.getByText('No physical stock pools match this search.')).toBeVisible();
});
