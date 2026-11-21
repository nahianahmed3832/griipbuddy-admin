import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = process.env.GRIIP_R06_PROCUREMENT_ORIGIN;
const password = process.env.GRIIPBUDDY_TEST_FIXTURE_PASSWORD;
const output = process.env.GRIIP_R06_PROCUREMENT_EVIDENCE_DIR;
const scope = process.env.GRIIP_R06_PROCUREMENT_SCOPE ?? 'all';
const fixtureSku = process.env.GRIIP_R06_PROCUREMENT_SKU ?? 'FIXTURE-BD-BLUE';
assert.match(origin ?? '', /^http:\/\/127\.0\.0\.1:\d{4,5}$/);
assert(password && output && ['active', 'managed', 'all'].includes(scope));
await mkdir(output, { recursive: true });
const prefix = '/admin';
const history = prefix + '/desk/operations/purchases';
const purchases = prefix + '/api/operations/purchases';
const withRegion = path => path + '?region=BD';
const dateTime = () => new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 19);
const evidence = reference => ({ reference, type: 'document', at: new Date().toISOString() });
const stamp = randomUUID().slice(0, 8);
const browser = await chromium.launch({ executablePath: process.env.GRIIP_R06_CHROMIUM });
const results = [];

async function checkFit(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), page.viewportSize().width);
}

async function api(page, path, body, method = body ? 'POST' : 'GET') {
  const response = await page.request.fetch(path, { method, ...(body && { data: body, headers: { Origin: origin } }) });
  assert.equal(response.status(), 200, await response.text());
  const result = await response.json();
  return result.success ? result.data : result;
}

async function openPage(width, phone = '01000000001', credential = password) {
  const context = await browser.newContext({ baseURL: origin, viewport: { width, height: 900 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(180_000);
  const signIn = await page.request.post(prefix + '/api/session', {
    form: { phone, password: credential }, headers: { Origin: origin }, maxRedirects: 0,
  });
  assert.equal(signIn.status(), 303);
  assert.match(signIn.headers().location, /\/(dashboard|desk)\//);
  return page;
}

async function active(page, width) {
  const supplier = 'R06 Browser Supplier ' + stamp + ' ' + width;
  const canonical = prefix + '/dashboard/suppliers/all';
  const rates = withRegion(prefix + '/api/purchases/rates');
  const barcodeOperation = prefix + '/api/operations';
  await page.goto(withRegion(canonical));
  await page.getByRole('link', { name: 'Add supplier', exact: true }).click();
  const create = page.getByRole('button', { name: 'Create Supplier', exact: true });
  const form = page.locator('form').filter({ has: create });
  await expect(create).toBeEnabled();
  await form.getByLabel('Supplier Name').fill(supplier);
  await form.getByLabel('Contact ID').fill(String(randomInt(1000000, 9999999)));
  await form.getByLabel('Supplier Type').selectOption('COMPANY');
  await form.locator('input[name="email"]').fill('browser-fixture@example.invalid');
  await form.locator('input[name="phone"]').fill('01000000101');
  await form.locator('input[name="address"]').fill('Fixture warehouse return address');
  await create.click();
  await expect(page).toHaveURL(new RegExp(canonical));
  const filter = page.getByLabel('Search suppliers');
  await filter.fill(supplier);
  await page.getByLabel('Supplier type').selectOption('COMPANY');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  const result = page.getByRole('link', { name: supplier, exact: true });
  await expect(result).toBeVisible();
  await checkFit(page);
  await page.screenshot({ path: join(output, 'r06-supplier-directory-' + width + '.png') });
  const supplierPath = (await result.getAttribute('href')).split('?')[0];
  const supplierId = supplierPath.split('/').at(-1);
  await result.click();
  await expect(page.getByRole('heading', { name: supplier, exact: true })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: 'Fixture warehouse return address' })).toBeVisible();
  await checkFit(page);

  const variants = await api(page, rates + '&q=' + encodeURIComponent(fixtureSku));
  const variant = variants.find(row => row.sku === fixtureSku);
  assert(variant);
  const saved = await api(page, rates, { region: 'BD', supplier: supplierId,
    lines: [{ id: variant.id, cost: '19.25', discount: '0', tax: '0' }] }, 'PUT');
  assert.deepEqual(saved.saved, [variant.id]);
  const generated = await api(page, barcodeOperation, { action: 'barcode-generate', region: 'BD',
    values: { sku: fixtureSku, quantity: '1', note: 'R06 isolated browser' } });
  const label = generated.barcodes[0];
  assert.match(label, /^\d{13}$/);
  await page.goto(withRegion(prefix + '/dashboard/barcodes/receive'));
  const location = page.getByLabel('Business location');
  const warehouse = await location.locator('option').filter({ hasText: /Fixture warehouse/i }).first().getAttribute('value');
  assert(warehouse);
  await location.selectOption(warehouse);
  await page.getByRole('textbox', { name: 'Scan or type a barcode' }).fill(label);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Scanned units' })).toContainText(fixtureSku);
  let first;
  let replay;
  await page.route(origin + barcodeOperation, async route => {
    if (route.request().method() !== 'POST' || route.request().postDataJSON().action !== 'barcode-receive') return route.continue();
    const committed = await route.fetch();
    assert.equal(committed.status(), 200, await committed.text());
    if (first) {
      replay = await committed.json();
      return route.fulfill({ response: committed });
    }
    first = await committed.json();
    return route.abort('connectionreset');
  });
  const receive = page.getByRole('button', { name: 'Receive 1 unit(s)', exact: true });
  await receive.click();
  await expect(page.getByRole('alert').filter({ hasText: 'retry this same batch' })).toBeVisible();
  await receive.click();
  const view = page.getByRole('link', { name: 'View purchase' });
  await expect(view).toBeVisible();
  assert(first?.purchaseId);
  assert.deepEqual(replay, first);
  await page.unroute(origin + barcodeOperation);
  await checkFit(page);
  await page.screenshot({ path: join(output, 'r06-barcode-receipt-' + width + '.png') });
  await view.click();
  const lines = page.getByRole('region', { name: 'Purchase lines' });
  await expect(lines).toContainText(fixtureSku);
  await expect(lines.getByRole('columnheader', { name: 'Received', exact: true })).toBeVisible();
  await expect(lines.getByRole('columnheader', { name: 'Lot', exact: true })).toBeVisible();
  await expect(lines.getByRole('row').filter({ hasText: fixtureSku }).getByRole('cell').nth(3)).toHaveText('1');
  await expect(page.getByRole('heading', { name: 'Purchase #' + first.purchaseNumber })).toBeVisible();
  results.push({ scope: 'active legacy', width, supplierCreateFilterDetail: true, exactLegacyReceiptReplay: true, receivedAndLot: true });
}

async function managed(page, width) {
  await page.goto(withRegion(prefix + '/dashboard/purchase/all'));
  await page.getByRole('link', { name: 'Purchasing and receiving', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Purchases and receiving', exact: true })).toBeVisible();
  const choices = await api(page, withRegion(purchases + '/choices') + '&sku=' + encodeURIComponent(fixtureSku));
  const warehouse = choices.warehouses.find(row => /Fixture warehouse/i.test(row.name ?? row.business_location_name ?? ''));
  assert(choices.item && warehouse);
  const sku = choices.item.sku;
  const reference = 'R06-BROWSER-' + stamp + '-' + width;
  const supplier = await api(page, withRegion(purchases), { action: 'supplier', key: randomUUID(),
    name: '=R06 Managed ' + stamp + ' ' + width, contactId: randomInt(10000000, 99999999) });
  const quote = { supplier: supplier.id, warehouse: warehouse._id, currency: 'BDT', quoteReference: reference,
    freightMinor: 0, taxMinor: 0, otherMinor: 0, deliveryTerms: 'Synthetic counted deliveries',
    paymentTerms: 'Recorded separately', lines: [{ variant: choices.item.variant, supplierSku: 'R06-BROWSER-SKU',
      quantity: 3, purchasingUnit: 'unit', unitsPerPurchase: 1, unitMinor: 1000 }] };
  const draft = await api(page, withRegion(purchases), { action: 'draft', key: randomUUID(), quote });
  const endpoint = withRegion(purchases + '/' + draft.order);
  const detail = () => api(page, endpoint);
  const mutate = (action, values) => api(page, endpoint, { action, key: randomUUID(), ...values });
  let order = await detail();
  await mutate('approve', { revision: order.revision, quoteHash: order.quote.hash });
  order = await detail();
  await mutate('communication', { revision: order.revision, stage: 'confirmed', acknowledged: true,
    expectedAt: new Date(Date.now() + 86400000).toISOString(), evidence: evidence(reference + '-CONFIRMED') });
  await page.goto(withRegion(history));
  await page.getByLabel('Search purchases').fill('Managed ' + stamp + ' ' + width);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const orders = page.getByRole('region', { name: 'Purchase history' });
  const item = orders.getByRole('link', { name: order.reference, exact: true });
  await expect(item).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Purchase history pages' })).toContainText('1 records');
  const download = page.waitForEvent('download');
  await orders.getByRole('link', { name: 'Export listing page' }).click();
  const csv = await readFile(await (await download).path(), 'utf8');
  assert(csv.includes(order.reference) && csv.includes("'=R06 Managed") && !csv.includes('R06-BROWSER-SKU'));
  await checkFit(page);
  await page.screenshot({ path: join(output, 'r06-purchase-history-' + width + '.png') });
  await item.click();

  const receipt = page.getByRole('heading', { name: 'Record a physical receipt' }).locator('..');
  const finalizeReceipt = receipt.getByRole('button', { name: 'Finalize physical receipt', exact: true });
  await expect(finalizeReceipt).toBeEnabled();
  await receipt.getByLabel('Physically received ' + sku).fill('2');
  await receipt.getByLabel('Accepted for sale ' + sku).fill('1');
  await receipt.getByRole('checkbox', { name: /I physically counted/ }).check();
  await finalizeReceipt.click();
  await expect(receipt.getByRole('status')).toContainText('must add up');
  await receipt.getByLabel('Accepted for sale ' + sku).fill('2');
  await receipt.getByLabel('Supplier delivery reference').fill(reference + '-RECEIPT');
  await finalizeReceipt.click();
  await expect.poll(async () => (await detail()).totals[0].physical).toBe(2);
  order = await detail();
  assert.equal(order.totals[0].expected, 1);
  assert.equal(order.finance.records.length, 0);
  const posting = order.postings[0];
  assert.equal(posting.returnable, 2);
  const labels = await api(page, withRegion(purchases + '/' + draft.order + '/labels/' + posting._id));
  assert.equal(labels.length, 2);
  await checkFit(page);
  await page.screenshot({ path: join(output, 'r06-managed-receipt-' + width + '.png') });

  const dispatch = page.getByRole('region', { name: 'Supplier returns', exact: true });
  await expect.poll(() => Math.floor(Date.now() / 1000) * 1000).toBeGreaterThanOrEqual(Date.parse(order.receiptLines[0].receivedAt));
  const dispatchAt = dateTime();
  const send = dispatch.getByRole('button', { name: 'Record supplier dispatch', exact: true });
  const fillDispatch = async () => {
    await expect(send).toBeEnabled();
    await dispatch.getByLabel('Original receipt posting').selectOption(posting._id);
    await dispatch.getByLabel('Units dispatched').fill('1');
    await dispatch.getByLabel('Reason for return').fill('Fixture inspection rejection');
    await dispatch.getByLabel('Original unit labels').fill(labels[0].barcode);
    await dispatch.getByLabel('Evidence reference').fill(reference + '-RETURN');
    await dispatch.locator('input[type=datetime-local]').fill(dispatchAt);
    await dispatch.getByRole('checkbox').check();
  };
  await fillDispatch();
  let firstKey;
  let replayKey;
  await page.route(origin + endpoint, async route => {
    if (route.request().method() !== 'POST' || route.request().postDataJSON().action !== 'supplier-return') return route.continue();
    const data = route.request().postDataJSON();
    if (firstKey) {
      replayKey = data.key;
      return route.continue();
    }
    firstKey = data.key;
    const saved = await route.fetch();
    assert.equal(saved.status(), 200, await saved.text());
    return route.abort('connectionreset');
  });
  await send.click();
  await expect(dispatch.getByRole('status')).toContainText('Network interruption');
  await page.reload();
  await fillDispatch();
  await send.click();
  await expect(dispatch.getByRole('status')).toHaveText('Supplier dispatch recorded and stock updated.');
  assert.equal(replayKey, firstKey);
  await page.unroute(origin + endpoint);
  const returned = await detail();
  assert.equal(returned.totals[0].returned, 1);
  assert.equal(returned.audit.filter(row => row.kind === 'supplier-return').length, 1);
  assert.equal(returned.finance.records.length, 0);

  await mutate('invoice', { amountMinor: 3000, currency: 'BDT', evidence: evidence(reference + '-INVOICE') });
  await mutate('payment', { amountMinor: 1000, currency: 'BDT', invoiceReference: reference + '-INVOICE',
    evidence: evidence(reference + '-PAYMENT') });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Supplier payment totals' })).toContainText('BDT 20.00');
  const reconciled = await detail();
  assert.equal(reconciled.totals[0].accepted, returned.totals[0].accepted);
  assert.equal(reconciled.totals[0].returned, 1);
  await page.getByText('Record supplier credit', { exact: true }).click();
  const credit = page.locator('details').filter({ has: page.getByText('Record supplier credit', { exact: true }) });
  await credit.getByLabel('Dispatched supplier return').selectOption(returned.audit.find(row => row.kind === 'supplier-return').id);
  await credit.getByLabel('Credit amount in minor units').fill('925');
  await credit.getByLabel('Evidence reference').fill(reference + '-CREDIT');
  await credit.locator('input[type=datetime-local]').fill(dateTime());
  await credit.getByRole('button', { name: 'Record credit document' }).click();
  await expect(page.getByRole('region', { name: 'Supplier credits and money received' })).toContainText('BDT 9.25');
  await checkFit(page);
  const finance = page.getByRole('region', { name: 'Supplier credits and money received' });
  await finance.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, 'r06-managed-finance-' + width + '.png') });
  await page.getByRole('link', { name: 'Back to purchases' }).click();
  await expect(page.getByLabel('Search purchases')).toHaveValue('Managed ' + stamp + ' ' + width);
  results.push({ scope: 'isolated managed', width, authorizedFilteredCsv: true, partialReceiptAndLot: true, receiptValidation: true,
    supplierReturnReplayAfterReload: true, separateInvoicePaymentCredit: true, preservedSearch: true });
}

try {
  for (const width of [1440, 390]) {
    const page = await openPage(width, process.env.GRIIP_R06_PROCUREMENT_OWNER_PHONE ?? '01000000001');
    try {
      if (scope !== 'managed') await active(page, width);
      if (scope !== 'active') await managed(page, width);
    } finally {
      await page.context().close();
    }
  }
  if (scope !== 'active' && process.env.GRIIP_R06_PROCUREMENT_RECEIVER_PASSWORD) {
    const page = await openPage(390, process.env.GRIIP_R06_PROCUREMENT_RECEIVER_PHONE ?? '01000000004',
      process.env.GRIIP_R06_PROCUREMENT_RECEIVER_PASSWORD);
    try {
      await page.goto(withRegion(history));
      await expect(page.getByRole('heading', { name: 'Expected deliveries', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Suppliers', exact: true })).toHaveCount(0);
      await page.goto(withRegion(history + '/suppliers'));
      await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
      results.push({ scope: 'restricted warehouse role', supplierDirectoryDenied: true });
    } finally {
      await page.context().close();
    }
  }
  const report = { status: 'PASS', synthetic: true, scenarios: results };
  await writeFile(join(output, 'R06_PROCUREMENT_BROWSER.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
