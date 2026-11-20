import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = process.env.GRIIP_M05_TEST_ADMIN_ORIGIN;
const password = process.env.GRIIPBUDDY_TEST_FIXTURE_PASSWORD;
const output = process.env.GRIIP_M05_PROCUREMENT_EVIDENCE_DIR;
assert.match(origin ?? '', /^http:\/\/127\.0\.0\.1:\d{4,5}$/);
assert(password && output, 'Provide the local recovery fixture password and evidence destination.');
await mkdir(output, { recursive: true });
const prefix = '/admin';
const purchases = prefix + '/desk/operations/purchases?region=BD';
const browser = await chromium.launch();
const screenshots = [];
const evidenceTime = () => new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 19);

async function login(page, phone) {
  await page.goto(prefix + '/sign-in');
  await page.getByRole('textbox', { name: 'Phone Number' }).fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|desk)\//);
}

async function capture(page, name, viewport) {
  const filename = 'admin-procurement-' + name + '-' + viewport + '.png';
  await page.screenshot({ path: join(output, filename) });
  screenshots.push({ file: filename, route: new URL(page.url()).pathname + new URL(page.url()).search, viewport: page.viewportSize() });
}

try {
  for (const [key, viewport, supplier] of [
    ['desktop', { width: 1440, height: 1000 }, 'Synthetic Bay Supplier'],
    ['mobile', { width: 390, height: 844 }, 'Synthetic Dock Supplier'],
  ]) {
    const context = await browser.newContext({ baseURL: origin, viewport, isMobile: key === 'mobile' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await login(page, '01000000001');
    await page.goto(purchases);
    await expect(page.getByRole('heading', { name: 'Purchases and receiving', exact: true })).toBeVisible();
    await capture(page, 'orders', key);
    await page.locator('.po-list li').filter({ hasText: supplier }).getByRole('link').click();
    await page.waitForURL(/\/operations\/purchases\/[a-f0-9]{24}(?:\?|$)/);
    const id = new URL(page.url()).pathname.split('/').at(-1);
    assert.match(id, /^[a-f0-9]{24}$/);
    const endpoint = prefix + '/api/operations/purchases/' + id;
    const read = async (subpath = '') => {
      const response = await page.request.get(endpoint + subpath + '?region=BD');
      assert(response.ok(), await response.text());
      return (await response.json()).data;
    };
    const before = await read();
    const row = before.postings.find(post => post.quantity > post.corrected + (post.returned ?? 0));
    assert(row, 'The isolated recovery fixture needs a remaining receipt unit.');
    const lines = await read('/labels/' + row._id);
    assert(lines.length, 'The original lot has no available barcode labels.');
    await expect(page.getByRole('region', { name: 'Receiving balances' })).toBeVisible();
    assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= viewport.width);

    const dispatch = page.getByRole('region', { name: 'Supplier returns', exact: true });
    await dispatch.getByRole('combobox', { name: 'Original receipt posting' }).selectOption(row._id);
    await dispatch.getByRole('spinbutton', { name: 'Units dispatched' }).fill('1');
    await dispatch.getByRole('textbox', { name: 'Reason for return' }).fill('Fixture quality inspection');
    await dispatch.getByRole('textbox', { name: 'Original unit labels' }).fill(lines[0].barcode);
    await dispatch.getByRole('textbox', { name: 'Evidence reference' }).fill('M05-BROWSER-RETURN-' + key);
    await dispatch.locator('input[type=datetime-local]').fill(evidenceTime());
    await dispatch.getByRole('checkbox').check();
    await dispatch.getByRole('heading').evaluate(node => node.scrollIntoView({ block: 'center' }));
    await capture(page, 'return', key);

    let firstRequestKey;
    await page.route(origin + endpoint + '?region=BD', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const data = route.request().postDataJSON();
      if (data.action !== 'supplier-return') return route.continue();
      if (firstRequestKey) {
        assert.equal(data.key, firstRequestKey);
        return route.continue();
      }
      firstRequestKey = data.key;
      const saved = await route.fetch();
      assert.equal(saved.status(), 200, await saved.text());
      return route.abort('connectionreset');
    });
    const post = dispatch.getByRole('button', { name: 'Record supplier dispatch' });
    await post.click();
    await expect(dispatch.getByRole('status')).toContainText(/failed to fetch|network/i);
    await post.click();
    await expect.poll(async () => (await read()).totals[0].returned).toBe((before.totals[0].returned ?? 0) + 1);
    await page.unroute(origin + endpoint + '?region=BD');
    await page.reload();
    const after = await read();
    assert.equal(after.audit.filter(event => event.kind === 'supplier-return').length,
      before.audit.filter(event => event.kind === 'supplier-return').length + 1);
    assert.equal(after.finance.currencies[0].unmatchedInvoice, before.finance.currencies[0].unmatchedInvoice);

    const recorded = after.audit.find(event => event.payload?.evidence?.reference === ('M05-BROWSER-RETURN-' + key).toUpperCase());
    assert(recorded?.id);
    await page.getByText('Record supplier credit', { exact: true }).click();
    const credit = page.locator('details').filter({ has: page.getByText('Record supplier credit', { exact: true }) });
    await credit.getByRole('combobox', { name: 'Dispatched supplier return' }).selectOption(recorded.id);
    await credit.getByRole('spinbutton', { name: 'Credit amount in minor units' }).fill('10025');
    await credit.getByRole('textbox', { name: 'Evidence reference' }).fill('M05-BROWSER-CREDIT-' + key);
    await credit.locator('input[type=datetime-local]').fill(evidenceTime());
    await credit.getByRole('button', { name: 'Record credit document' }).click();
    await expect.poll(async () => (await read()).finance.records.some(event =>
      event.kind === 'supplier-credit' && event.supplierReturn === recorded.id && event.amountMinor === 10025)).toBe(true);
    const finance = page.getByRole('region', { name: 'Supplier credits and money received' });
    await finance.evaluate(node => node.scrollIntoView({ block: 'center' }));
    await capture(page, 'finance', key);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(JSON.stringify({ status: 'passed', chromiumChecks: 2, screenshots }, null, 2));
} finally {
  await browser.close();
}
