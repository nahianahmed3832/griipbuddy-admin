import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { marketplaceWorkspacePath } from '../src/lib/connected-marketplace-contract';
import { fixturePassword } from './fixture-password';

const origin = process.env.GRIIP_CONNECTED_TEST_ADMIN_ORIGIN!;
const sellerSlug = process.env.GRIIP_MARKETPLACE_TEST_SELLER_SLUG ?? '';
const bdOrder = process.env.GRIIP_MARKETPLACE_TEST_ORDER_BD ?? '';
const usOrder = process.env.GRIIP_MARKETPLACE_TEST_ORDER_US ?? '';
const workspace = `/admin${marketplaceWorkspacePath}`;
const endpoint = '/admin/api/connected-catalog';
const read = { region: 'BD', request: { read: 'marketplace-workspace' } };
const bypassCSP = process.env.GRIIP_CONNECTED_TEST_NEXT_DEV === '1';

// The loopback Next development server uses eval for source maps.
test.use({ bypassCSP });

const isolate = (page: Page) => page.route(url => url.origin !== origin, route => route.abort());

async function signIn(page: Page, phone: string) {
  await page.goto('/admin/sign-in');
  await page.getByLabel('Phone Number').fill(phone);
  await page.getByLabel('Password').fill(fixturePassword());
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/desk\/overview$/);
}

async function startFixtureSession(page: Page, phone: string) {
  const result = await page.request.post('/admin/api/session', { headers: { Origin: origin },
    form: { phone, password: fixturePassword() }, maxRedirects: 0 });
  expect(result.status()).toBe(303);
  expect(result.headers().location).toBe('/admin/desk/overview');
}

test('a purple admin updates a seller and edits delivery in Bangladesh while US checkout stays provider-managed', async ({ page, browser }) => {
  test.skip(!sellerSlug, 'Seed a seller with a Bangladesh request in the disposable Marketplace fixture.');
  const tag = randomBytes(4).toString('hex');
  const district = `fixture-${tag.replace(/\d/g, digit => String.fromCharCode(97 + Number(digit)))}`;
  const option = `Fixture delivery ${tag}`;
  await isolate(page);
  await signIn(page, '01000000001');
  await page.goto('/admin/desk/markets?region=BD');
  await expect(page.getByRole('link', { name: 'Marketplace operations', exact: true })).toHaveAttribute('href', `${workspace}?region=BD`);
  await page.goto(`${workspace}?region=BD`);
  await expect(page.getByRole('heading', { name: 'Bangladesh', level: 1 })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search sellers', exact: true }).fill(sellerSlug);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(address => address.searchParams.get('q') === sellerSlug);
  const seller = page.getByRole('row').filter({ hasText: sellerSlug });
  await expect(seller).toHaveCount(1);
  const initialGrant = (await seller.getByRole('cell').nth(1).innerText()).trim();
  const initialPublication = (await seller.getByRole('cell').nth(2).innerText()).trim();
  expect(['Pending', 'Denied', 'Approved']).toContain(initialGrant);
  const initiallyApproved = initialGrant === 'Approved';
  const initiallyPublished = initialPublication === 'Published';
  await seller.getByText('Manage seller', { exact: false }).first().click();
  await seller.getByRole('checkbox', { name: 'Confirm this seller’s access change for Bangladesh.' }).check();
  await seller.getByRole('button', { name: initiallyApproved ? 'Revoke access in Bangladesh' : 'Approve in Bangladesh' }).click();
  await expect(seller.getByRole('cell').nth(1)).toHaveText(initiallyApproved ? 'Denied' : 'Approved');
  await seller.getByRole('checkbox', { name: /this shop across all markets/ }).check();
  await seller.getByRole('button', { name: initiallyPublished ? 'Unpublish shop globally' : 'Publish shop globally' }).click();
  await expect(seller.getByRole('cell').nth(2)).toHaveText(initiallyPublished ? 'Unpublished' : 'Published');

  const delivery = page.getByRole('region', { name: 'Delivery options' });
  await delivery.getByText('Add delivery option', { exact: true }).click();
  const newOption = delivery.getByRole('form', { name: 'New delivery option', exact: true });
  await newOption.getByLabel('District code', { exact: true }).fill(district);
  await newOption.getByLabel('District name', { exact: true }).fill('Fixture district');
  await newOption.getByLabel('Method code', { exact: true }).fill('standard');
  await newOption.getByLabel('Option name', { exact: true }).fill(option);
  await newOption.getByLabel('Charge (BDT)', { exact: true }).fill('25.50');
  await newOption.getByRole('button', { name: 'Save delivery option', exact: true }).click();
  await expect(delivery.getByRole('row', { name: new RegExp(option) })).toBeVisible();

  await page.getByLabel('Operating region: Bangladesh').click();
  await page.getByRole('link', { name: 'International', exact: true }).click();
  await expect(page).toHaveURL(address => address.pathname === workspace && address.searchParams.get('region') === 'INTERNATIONAL');
  await expect(page.getByRole('heading', { name: 'United States', level: 1 })).toBeVisible();
  await expect(page.getByText('PayPal', { exact: true })).toBeVisible();
  await expect(page.getByText('Checkout and delivery use this market’s provider configuration.')).toBeVisible();
  await expect(page.getByText('Add delivery option', { exact: true })).toHaveCount(0);
  await expect(seller.getByRole('cell').nth(1)).toHaveText('No request');
  await expect(seller.getByRole('cell').nth(2)).toHaveText(initiallyPublished ? 'Unpublished' : 'Published');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

  const limited = await browser.newPage({ baseURL: origin, bypassCSP });
  try {
    await isolate(limited);
    await signIn(limited, '01000000003');
    const response = await limited.request.post(endpoint, { headers: { Origin: origin }, data: read });
    expect(response.status()).toBe(403);
  } finally {
    await limited.close();
  }
});

test('an owner can open market-specific Marketplace orders, seller handoff and return cases', async ({ page, browser }) => {
  test.skip(!bdOrder || !usOrder, 'Seed Bangladesh and US orders with a seller handoff and US return case in the disposable fixture.');
  test.setTimeout(120_000);
  await isolate(page);
  await startFixtureSession(page, '01000000001');
  await page.goto('/admin/desk/orders/marketplace?region=BD&queue=all');
  const table = page.getByRole('table', { name: 'Marketplace orders' });
  await expect(table.getByRole('link', { name: bdOrder, exact: true })).toBeVisible();
  await expect(table.getByRole('link', { name: usOrder, exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Marketplace order cases', exact: true })).toBeVisible();

  await page.goto('/admin/desk/orders/marketplace?region=INTERNATIONAL&queue=all');
  const selected = table.getByRole('link', { name: usOrder, exact: true });
  await expect(selected).toBeVisible();
  await expect(table.getByRole('link', { name: bdOrder, exact: true })).toHaveCount(0);
  const usRow = table.getByRole('row').filter({ hasText: usOrder });
  await expect(usRow.getByRole('cell').nth(1)).toHaveText(/Unfulfilled|Packing|Ready to ship|Shipped|Delivered/);
  await expect(usRow.getByRole('cell').nth(5)).toHaveText(/\$/);
  const detail = new URL((await selected.getAttribute('href'))!, origin);
  expect(detail.pathname).toMatch(/\/admin\/dashboard\/order-details\/native-/);
  expect(detail.searchParams.get('region')).toBe('INTERNATIONAL');
  await page.goto(detail.href);
  await expect(page.getByRole('heading', { name: usOrder, level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Seller handoff' })).toBeVisible();
  await expect(page.getByText(/Ready for pickup/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Order cases' })).toBeVisible();

  await page.goto('/admin/dashboard/marketplace-orders/cases?region=INTERNATIONAL');
  const caseTable = page.getByRole('table', { name: 'Marketplace order cases' });
  const returnRow = caseTable.getByRole('row').filter({ hasText: usOrder });
  const returnLink = returnRow.getByRole('link', { name: 'Return', exact: true });
  await expect(returnLink).toBeVisible();
  const caseUrl = new URL((await returnLink.getAttribute('href'))!, origin);
  expect(caseUrl.searchParams.get('region')).toBe('INTERNATIONAL');
  await page.goto(caseUrl.href);
  await expect(page.getByRole('heading', { name: 'Return case', level: 1 })).toBeVisible();

  const ordinaryViewer = await browser.newPage({ baseURL: origin, bypassCSP });
  try {
    await isolate(ordinaryViewer);
    await startFixtureSession(ordinaryViewer, '01000000003');
    await ordinaryViewer.goto('/admin/desk/orders/marketplace?region=BD');
    await expect(ordinaryViewer.getByRole('heading', { name: 'Access restricted', level: 1 })).toBeVisible();
    await expect(ordinaryViewer.getByRole('link', { name: 'Marketplace order cases', exact: true })).toHaveCount(0);
    const response = await ordinaryViewer.request.post(endpoint, { headers: { Origin: origin },
      data: { region: 'BD', request: { read: 'orders', queue: 'all' } } });
    expect(response.status()).toBe(403);
  } finally {
    await ordinaryViewer.close();
  }
});
