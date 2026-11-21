import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import * as XLSX from 'xlsx';

const origin = process.env.GRIIP_R07_ORDERS_ORIGIN;
const password = process.env.GRIIPBUDDY_TEST_FIXTURE_PASSWORD;
const output = process.env.GRIIP_R07_ORDERS_EVIDENCE_DIR;
assert.match(origin ?? '', /^http:\/\/127\.0\.0\.1:\d{4,5}$/);
assert(password && output);
await mkdir(output, { recursive: true });
const prefix = '/admin';
const queue = prefix + '/dashboard/orders';
const exportUrl = prefix + '/api/website-orders?action=export';
const orders = ['#990701', '#990702', '#990703'];
const selected = '000000000000000000007a01';
const foreign = '000000000000000000007a03';
const international = '000000000000000000007a04';
const query = 'R07-WORKSPACE-SYNTHETIC';
const headers = ['Source', 'Order', 'Invoice', 'Date', 'Order status', 'SKUs and quantities', 'Currency', 'Order total'];
const browser = await chromium.launch({ executablePath: process.env.GRIIP_R07_CHROMIUM });
const results = [];

async function openPage(width, phone = '01000000001') {
  const context = await browser.newContext({ baseURL: origin, viewport: { width, height: 900 }, acceptDownloads: true });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(50_000);
  const signIn = await page.request.post(prefix + '/api/session', {
    form: { phone, password }, headers: { Origin: origin }, maxRedirects: 0,
  });
  assert.equal(signIn.status(), 303);
  assert.match(signIn.headers().location, /\/(dashboard|desk)\//);
  return page;
}

function readWorkbook(body, suggestedFilename) {
  if (suggestedFilename) assert.equal(suggestedFilename, 'website-orders.xlsx');
  const book = XLSX.read(body, { type: 'buffer' });
  const sheet = book.Sheets['Website Orders'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  assert.deepEqual(rows[0], headers);
  assert(!JSON.stringify(rows).includes('R07 PRIVATE'));
  assert(!JSON.stringify(rows).includes('R07-PRIVATE-TRACKING'));
  assert(!JSON.stringify(rows).includes('01000000707'));
  assert(Object.values(sheet).every(cell => !cell?.f), 'Exported warehouse text must remain inert');
  return rows;
}

async function checkedExport(page, suffix) {
  const reply = await page.request.get(exportUrl + suffix);
  assert.equal(reply.status(), 200, await reply.text().then(raw => /^\w/.test(raw) ? raw.slice(0, 140) : 'spreadsheet'));
  assert.match(reply.headers()['cache-control'], /private.*no-store/i);
  assert.equal(reply.headers()['x-content-type-options'], 'nosniff');
  return readWorkbook(await reply.body());
}

async function verifyViewport(width) {
  const page = await openPage(width);
  try {
    await page.goto(queue + '?q=' + query + '&filter=DELIVERED');
    const rowLinks = page.getByRole('link', { name: /^#99070[1-3]$/ });
    await expect(rowLinks).toHaveText(orders.slice().reverse());
    const filter = page.getByRole('button', { name: 'Filter', exact: true });
    if (await filter.getAttribute('aria-expanded') !== 'true') await filter.click();
    await page.getByRole('combobox', { name: 'Order date', exact: true }).selectOption('oldest');
    await expect(page).toHaveURL(/sort=oldest/);
    await expect(rowLinks).toHaveText(orders);
    const first = page.getByRole('row').filter({ has: page.getByRole('link', { name: orders[0], exact: true }) });
    await expect(first).toContainText('Recovered');
    await expect(first.locator('[data-field="payment"]')).toBeVisible();
    await expect(first.locator('[data-field="shipment"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: join(output, 'order-workspace-' + width + '.png') });

    await first.getByRole('checkbox', { name: 'Select order ' + orders[0] }).check();
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Export 1 selected' }).click();
    const file = await download;
    const { readFile } = await import('node:fs/promises');
    const single = readWorkbook(await readFile(await file.path()), file.suggestedFilename());
    assert.equal(single.length, 2);
    assert.deepEqual(single[1].slice(0, 3), ['Recovered', 990701, query + '-1']);
    assert.equal(single[1][5], '=R07-TEST-SKU × 1');

    const all = await checkedExport(page, '&region=BD&q=' + query + '&sort=oldest&checkout=1');
    assert.deepEqual(all.slice(1).map(row => row[1]), [990701, 990702, 990703]);
    const intl = await checkedExport(page, '&region=INTERNATIONAL&selected=' + international);
    assert.deepEqual(intl.slice(1).map(row => [row[1], row[6]]), [[990704, 'USD']]);
    for (const [status, suffix] of [
      [404, '&region=BD&selected=' + selected + ',' + international],
      [400, '&region=BD&selected=' + selected + ',' + selected.toUpperCase()],
      [400, '&region=BD&selected=hybrid-9d640da2-eea8-4f08-9a61-3069334aa179'],
      [400, '&region=BD&region=INTERNATIONAL&selected=' + selected],
    ]) assert.equal((await page.request.get(exportUrl + suffix)).status(), status);
    results.push({ width, oldestNewest: true, boundsFit: true, separateFinancialShipment: true, safeSelectedAndFilteredWorkbook: true });
  } finally { await page.context().close(); }
}

async function verifyOperatorScope() {
  const page = await openPage(390, '01000000006');
  try {
    const all = await checkedExport(page, '&region=BD&q=' + query);
    assert.deepEqual(all.slice(1).map(row => row[1]), [990702, 990701]);
    for (const [status, suffix] of [
      [403, '&region=INTERNATIONAL&selected=' + international],
      [404, '&region=BD&selected=' + selected + ',' + foreign],
      [403, '&region=BD&location=000000000000000000007a00&q=' + query],
    ]) assert.equal((await page.request.get(exportUrl + suffix)).status(), status);
    results.push({ assignedLocationEnforced: true, marketGrantEnforced: true, mixedSelectionDeniedWithoutPartialWorkbook: true });
  } finally { await page.context().close(); }

  const denied = await openPage(390, '01000000004');
  try {
    assert.equal((await denied.request.get(exportUrl + '&region=BD&q=' + query)).status(), 403);
    results.push({ noOrderGrantDenied: true });
  } finally { await denied.context().close(); }
}

async function verifyBatch() {
  const page = await openPage(390);
  const action = '**/admin/api/managed';
  try {
    await page.goto(queue + '?q=01000000623');
    const checkbox = page.getByRole('checkbox', { name: /^Select order #/ });
    await expect(checkbox).toHaveCount(1);
    const record = page.getByRole('row').filter({ has: checkbox }).getByRole('link', { name: /^#/ });
    const number = await record.textContent();
    await checkbox.check();
    const reason = 'Synthetic R07 cancellation response recovery';
    await page.getByLabel('Cancellation reason', { exact: true }).fill(reason);
    let original;
    await page.route(action, async route => {
      const command = route.request().postDataJSON();
      if (command?.action !== 'order-cancel-batch') return route.continue();
      original = command;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).rows[0].status, 'cancelled');
      await route.abort();
    });
    await page.getByRole('button', { name: 'Cancel selected orders', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Retry with the original reason' })).toBeVisible();
    await page.unroute(action);
    assert(original?.key);
    await page.reload();
    const recovery = page.getByRole('region', { name: 'Batch cancellation' });
    await expect(recovery.getByText(number, { exact: false })).toBeVisible();
    await recovery.getByLabel('Cancellation reason').fill('Different synthetic reason');
    await recovery.getByRole('button', { name: 'Recover cancellation results' }).click();
    await expect(recovery.getByRole('alert')).toContainText('No new request was sent');
    await recovery.getByLabel('Cancellation reason').fill(reason);
    const replay = page.waitForResponse(reply =>
      reply.request().method() === 'POST' && reply.url().endsWith('/api/managed'));
    await recovery.getByRole('button', { name: 'Recover cancellation results' }).click();
    const reply = await replay;
    assert.equal(reply.status(), 200);
    assert.equal(reply.request().postDataJSON().key, original.key);
    assert.equal((await reply.json()).rows[0].status, 'replayed');
    await expect(page.getByRole('list', { name: 'Cancellation results' })).toContainText('Already cancelled by this operation');
    await page.screenshot({ path: join(output, 'order-cancellation-recovery-390.png') });
    results.push({ width: 390, acceptedThenResponseLost: true, changedPayloadBlocked: true, sameOperationRecoveredAfterReload: true });
  } finally { await page.context().close(); }
}

try {
  for (const width of [1440, 390]) await verifyViewport(width);
  await verifyOperatorScope();
  await verifyBatch();
  const report = { status: 'PASS', synthetic: true, results };
  await writeFile(join(output, 'R07_ORDER_WORKSPACE_BROWSER.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
