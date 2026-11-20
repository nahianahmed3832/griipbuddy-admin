import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { marketplaceWorkspacePath } from '../src/lib/connected-marketplace-contract';
import { fixturePassword } from './fixture-password';

const origin = process.env.GRIIP_CONNECTED_TEST_ADMIN_ORIGIN!;
const sellerSlug = process.env.GRIIP_MARKETPLACE_TEST_SELLER_SLUG!;
const workspace = `/admin${marketplaceWorkspacePath}`;
const endpoint = '/admin/api/connected-catalog';
const read = { region: 'BD', request: { read: 'marketplace-workspace' } };
const bypassCSP = process.env.GRIIP_CONNECTED_TEST_NEXT_DEV === '1';

// The loopback Next development server uses eval for source maps.
test.use({ bypassCSP });

async function signIn(page: Page, phone: string) {
  await page.goto('/admin/sign-in');
  await page.getByLabel('Phone Number').fill(phone);
  await page.getByLabel('Password').fill(fixturePassword());
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/desk\/overview$/);
}

test('a purple admin updates a seller and edits delivery in Bangladesh while US checkout stays provider-managed', async ({ page, browser }) => {
  const isolate = (target: Page) => target.route(url => url.origin !== origin, route => route.abort());
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
