import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const admin = process.env.GRIIP_R07_PAYMENT_ORIGIN;
const api = process.env.GRIIP_R07_PAYMENT_API;
if (![admin, api].every(value => /^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(value))) {
  throw new Error('Use two isolated loopback endpoints.');
}
const output = process.env.GRIIP_R07_PAYMENT_EVIDENCE_DIR;
const password = process.env.GRIIPBUDDY_TEST_FIXTURE_PASSWORD;
assert(output && password);

const phone = '01000000001';
const manualSamplePhone = '01000000626';
const login = await fetch(api + '/api/v1/user/admin/login', {
  method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone_number: phone, password }),
});
assert.equal(login.status, 200);
const token = (await login.json()).data.access_token;
const orderResponse = await fetch(api + '/api/v1/order?searchQuery=' + manualSamplePhone, {
  headers: { Authorization: 'Bearer ' + token }, redirect: 'error',
});
assert.equal(orderResponse.status, 200);
const found = (await orderResponse.json()).data.data.find(row => row.customer_phone === manualSamplePhone);
assert(found && found.customer_name.startsWith('Dev sample'));
const id = found._id;
assert.match(id, /^[0-9a-f]{24}$/);

const browser = await chromium.launch({ executablePath: process.env.GRIIP_R07_CHROMIUM });
const prefix = process.env.GRIIP_R07_PAYMENT_PREFIX ?? '/admin';
assert(['','/admin'].includes(prefix));
const base = admin + prefix;
const command = base + '/api/managed?order=' + id;
const detail = base + '/dashboard/order-details/' + id;
async function open(width) {
  const context = await browser.newContext({ viewport: { width, height: 850 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const signed = await page.request.post(base + '/api/session', {
    headers: { Origin: admin }, form: { phone, password }, maxRedirects: 0,
  });
  assert.equal(signed.status(), 303);
  assert.equal(new URL(signed.headers().location, admin).pathname, prefix + '/dashboard/overview');
  await page.goto(detail);
  const payment = page.getByRole('region', { name: 'Payment Info', exact: true });
  await expect(payment).toBeVisible({ timeout: 30000 });
  return { context, page, payment };
}

async function read(page) {
  const response = await page.request.get(command);
  assert.equal(response.status(), 200);
  return (await response.json()).payment;
}

async function clickCommand(page, button) {
  const incoming = page.waitForResponse(response => response.url() === command && response.request().method() === 'POST');
  await button.click();
  return incoming;
}

try {
  const desktop = await open(1440);
  const starting = await read(desktop.page);
  assert.equal(starting.payment.provider, 'manual');
  assert.equal(starting.payment.status, 'pending');
  assert.equal(starting.payment.captured, 0);
  assert.equal(starting.payment.evidenceSubmitted, true);
  const link = await desktop.payment.getByRole('link', { name: 'Download receipt' }).getAttribute('href');
  assert(link);
  const authorizedReceipt = await desktop.page.request.get(admin + link);
  assert.equal(authorizedReceipt.status(), 200);
  assert.match(authorizedReceipt.headers()['content-type'], /^image\/jpeg/);
  assert.match(authorizedReceipt.headers()['cache-control'], /private, no-store/);
  const isolatedReceipt = new URL(link, admin);
  isolatedReceipt.searchParams.delete('market');
  assert.equal((await desktop.page.request.get(isolatedReceipt.href)).status(), 400);
  isolatedReceipt.searchParams.set('market', 'US');
  const wrongMarket = await desktop.page.request.get(isolatedReceipt.href);
  assert([400, 403, 409].includes(wrongMarket.status()));
  assert(!wrongMarket.headers()['content-type']?.startsWith('image/'));
  const otherContext = await browser.newContext();
  const guest = await otherContext.request.get(admin + link);
  assert.equal(guest.status(), 401);
  await otherContext.close();

  const approve = desktop.payment.getByRole('button', { name: 'Approve payment', exact: true });
  await expect(approve).toBeEnabled({ timeout: 30000 });
  assert(starting.evidence?.reference);
  await desktop.payment.getByLabel('Verified receipt reference').fill(starting.evidence.reference);
  const amount = desktop.payment.getByLabel('Verified amount (BDT)', { exact: true });
  await amount.fill(((starting.payment.amount + 1) / 100).toFixed(2));
  await desktop.payment.getByLabel('Review note').fill('Verified isolated manual receipt');
  assert.equal((await clickCommand(desktop.page, approve)).status(), 422);
  assert.equal((await read(desktop.page)).payment.captured, 0);
  await desktop.page.screenshot({ path: join(output, 'r07-manual-review-validation-1440.png') });
  await amount.fill((starting.payment.amount / 100).toFixed(2));
  assert.equal((await clickCommand(desktop.page, approve)).status(), 200);
  await expect.poll(async () => (await read(desktop.page)).payment.captured).toBe(starting.payment.amount);
  await desktop.context.close();

  const mobile = await open(390);
  const before = await read(mobile.page);
  assert(before.refund.amount >= 100);
  const reference = 'R07-REFUND-' + randomUUID();
  await mobile.payment.locator('summary').filter({ hasText: /^Record refund$/ }).click();
  await mobile.payment.getByLabel('Verified amount (BDT)', { exact: true }).fill('1.00');
  await mobile.payment.getByLabel('Refund reason').fill('Synthetic original-route reimbursement');
  await mobile.payment.getByLabel('Verified refund reference').fill(reference);
  let submitted;
  let recorded;
  await mobile.page.route(command, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    submitted = route.request().postDataJSON();
    const result = await route.fetch();
    assert.equal(result.status(), 200);
    recorded = await result.json();
    await route.abort();
  });
  await mobile.payment.getByRole('button', { name: 'Record refund', exact: true }).click();
  const history = mobile.page.getByRole('region', { name: 'Refund history' });
  await expect(history.getByText(reference, { exact: false })).toBeVisible({ timeout: 30000 });
  assert(submitted && recorded.id);
  assert.equal(recorded.state, 'refunded');
  await mobile.page.unroute(command);
  await mobile.page.reload();
  await expect(history.getByText(reference, { exact: false })).toHaveCount(1, { timeout: 30000 });
  const replay = await mobile.page.request.post(command, { headers: { Origin: admin }, data: submitted });
  assert.equal(replay.status(), 200);
  assert.deepEqual(await replay.json(), recorded);
  const saved = await read(mobile.page);
  assert.equal(saved.payment.refunded, 100);
  assert.equal(saved.refundBalance.held, 0);
  assert.equal(saved.refunds.filter(row => row.id === recorded.id).length, 1);
  await expect.poll(() => mobile.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await mobile.page.screenshot({ path: join(output, 'r07-original-route-refund-history-390.png') });
  await mobile.context.close();

  const evidence = { status: 'PASS', synthetic: true,
    desktop: { width: 1440, privateReceipt: true, missingAndWrongMarketDenied: true, anonymousDenied: true, reviewAmountValidation: true },
    mobile: { width: 390, acceptedThenResponseLost: true, historySurvivesReload: true, verifiedReference: true,
      sameOperationReturned: true, oneRefundEffect: true, heldAfterConfirmation: 0 } };
  await writeFile(join(output, 'R07_PAYMENT_RECOVERY_BROWSER.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} finally {
  await browser.close();
}
