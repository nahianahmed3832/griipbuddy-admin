import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { legacyDestinations, resolveLegacy } from '../src/lib/legacy-destinations';
import { fixturePassword } from './fixture-password';

const origin = 'http://127.0.0.1:4327';

async function signIn(page: Page, suffix = '1') {
  await page.goto(origin + '/sign-in');
  await page.getByLabel('Phone Number', { exact: true }).fill('0100000000' + suffix);
  await page.getByLabel('Password', { exact: true }).fill(fixturePassword());
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(origin + '/dashboard/overview');
}

test('the dashboard manifest is explicitly mapped and malformed paths are rejected', () => {
  const expected = readFileSync('evidence/legacy-routes.txt','utf8').split(/\r?\n/)
    .filter(line => line.startsWith('/dashboard/')).map(line => line.slice('/dashboard/'.length)).sort();
  expect(Object.keys(legacyDestinations).sort()).toEqual(expected);
  expect(resolveLegacy(['orders', 'edit', '000000000000000000000001'])).toMatchObject({
    path: '/desk/orders/orders/000000000000000000000001', query: { draft:'1' },
  });
  expect(resolveLegacy(['reports', '../../outside'])).toBeUndefined();
  expect(resolveLegacy(['renew-subscription'])).toMatchObject({path:'/desk/settings/renew-subscription',pending:expect.any(String)});
});

test('production links open the editable overview, order filters and stock exports', async ({page,request}) => {
  await signIn(page);
  await page.goto(origin + '/dashboard/overview?view=classic');
  await expect(page).toHaveURL(/\/dashboard\/overview\?view=classic$/);
  await expect(page.getByRole('link',{name:'Current overview'})).toBeVisible();
  await page.getByRole('link',{name:'Current overview'}).click();
  await expect(page.getByRole('heading',{name:'Needs attention'})).toBeVisible();
  await page.goto(origin + '/dashboard/orders?status=PLACED,IN_TRANSIT');
  await expect(page).toHaveURL(origin + '/dashboard/orders?status=PLACED,IN_TRANSIT');
  await expect(page.getByRole('heading', { name: /^All Orders/ })).toBeVisible();
  await page.goto(origin + '/dashboard/check-outlet-stocks');
  await expect(page.getByRole('heading',{name:'Stocks report',level:1})).toBeVisible();
  await page.getByLabel('Product, SKU or barcode').fill('FIXTURE-BD-BLUE');
  await page.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.getByRole('table').getByText('FIXTURE-BD-BLUE',{exact:true}).first()).toBeVisible();
  const href = await page.getByRole('link',{name:'Download Excel'}).getAttribute('href');
  expect(href).toContain('q=FIXTURE-BD-BLUE');
  const workbook = await page.request.get(origin + href);
  expect(workbook.status()).toBe(200);
  expect((await workbook.body()).subarray(0,2).toString()).toBe('PK');
  expect((await request.get(origin + href)).status()).toBe(401);
  await page.getByRole('link',{name:'Print / PDF'}).click();
  await expect(page.getByRole('button',{name:'Print or save PDF'})).toBeVisible();
  await page.goto(origin + '/dashboard/assigned-orders');
  await expect(page.getByRole('heading',{name:'Assigned orders',level:1})).toBeVisible();
});

test('eligible admins can create and edit a disabled coupon through the native editor', async ({page}) => {
  await signIn(page);
  await page.goto(origin + '/dashboard/create-coupon');
  const code = 'PARITY-' + Date.now().toString(36).toUpperCase();
  await page.getByLabel('Code',{exact:true}).fill(code);
  await page.getByLabel('Discount value',{exact:true}).fill('15');
  await page.getByLabel('Minimum order amount').fill('350');
  await page.getByLabel('Total usage limit').fill('20');
  await page.getByLabel('Usage limit per customer').fill('2');
  await page.getByLabel('First order only').check();
  await page.getByRole('button',{name:'Create disabled coupon'}).click();
  await expect(page).toHaveURL(/\/desk\/marketing\/coupons/);
  await page.getByRole('link',{name:code,exact:true}).click();
  await expect(page.getByLabel('Discount value',{exact:true})).toHaveValue('15');
  await expect(page.getByLabel('Minimum order amount')).toHaveValue('350');
  await expect(page.getByLabel('First order only')).toBeChecked();
  await page.getByLabel('Minimum order amount').fill('450');
  await page.getByRole('button',{name:'Save coupon',exact:true}).click();
  await expect(page).toHaveURL(/\/desk\/marketing\/coupons(?:\?|$)/);
  await page.getByRole('link',{name:code,exact:true}).click();
  await expect(page.getByLabel('Minimum order amount')).toHaveValue('450');
  await expect(page.getByText(/Disabled · 0 recorded uses/)).toBeVisible();
});

test('the fraud lookup is disabled on the fixture and restricted staff cannot open the stock report', async ({page}) => {
  await signIn(page,'6');
  await page.goto(origin + '/dashboard/fraud-checker');
  await expect(page.locator('main section').getByRole('button',{name:'Check courier history'})).toBeDisabled();
  await page.goto(origin + '/dashboard/check-outlet-stocks');
  await expect(page.getByRole('heading',{name:'Access restricted',level:1})).toBeVisible();
});

test('hidden sales and plan routes preserve their visible behavior', async ({page}) => {
  await signIn(page);
  await page.goto(origin + '/dashboard/sales-executive');
  await expect(page.getByRole('heading',{name:/^Sales Executive \(/,level:1})).toBeVisible();
  await expect(page.getByLabel('Date range preset')).toHaveValue('0');
  await expect(page.getByRole('link',{name:'Download Excel'})).toBeVisible();
  await page.goto(origin + '/dashboard/current-plan');
  await expect(page.getByRole('heading',{name:'Current Plan Feature Coming Soon!',level:1})).toBeVisible();
  await expect(page.getByText('We\'ll inform you when this feature becomes available to use.')).toBeVisible();
  await page.goto(origin + '/dashboard/renew-subscription');
  await expect(page.getByRole('heading',{name:'Renew Subscription Feature Coming Soon!',level:1})).toBeVisible();
});

test('Header Management edits and toggles a fixture announcement', async ({page, request}) => {
  await signIn(page);
  await page.goto(origin + '/dashboard/header');
  await expect(page.getByRole('heading', { name: 'Header Management', level: 1 })).toBeVisible();

  const message = 'Fixture announcement ' + Date.now();
  const input = page.getByLabel('Message Text', { exact: true });
  await input.fill(message);
  await page.getByRole('switch', { name: 'Show on website', exact: true }).click();
  await page.getByRole('button', { name: 'Add Message', exact: true }).click();
  const entry = page.getByText(message, { exact: true }).locator('../..');
  await expect(entry.getByRole('switch')).not.toBeChecked();
  await entry.getByRole('switch').click();
  await expect(entry.getByRole('switch')).toBeChecked();

  await entry.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Edit message text').fill(message + ' updated');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const updated = page.getByText(message + ' updated', { exact: true });
  await expect(updated).toBeVisible();
  await updated.locator('../..').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(updated).toHaveCount(0);

  expect((await request.post(origin + '/api/production-header', {
    headers: { Origin: origin }, data: { action: 'create', message, enabled: false },
  })).status()).toBe(401);
});

test('the best-selling editor selects a catalog product and saves the section', async ({page}) => {
  await signIn(page);
  await page.goto(origin + '/dashboard/homepage/best-selling');
  await expect(page.getByRole('heading',{name:'Best Selling Products',level:1})).toBeVisible();
  await page.getByRole('button',{name:'Add Product'}).click();
  const entry = page.getByRole('group',{name:/^Entry \d+$/}).last();
  await entry.getByLabel('Find products').fill('Fixture domestic case');
  await entry.getByRole('button',{name:'Search products',exact:true}).click();
  await entry.getByRole('button',{name:'Fixture domestic case',exact:true}).click();
  const id = await entry.getByLabel('Product reference',{exact:true}).inputValue();
  expect(id).toMatch(/^[a-f0-9]{24}$/i);
  const saved = page.waitForResponse(response => response.url().endsWith('/api/workspace') && response.request().method() === 'POST');
  await page.getByRole('button',{name:'Save Changes'}).click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.getByLabel('Product reference',{exact:true}).last()).toHaveValue(id);
});
