// Run only through the isolated Hostinger Operations workspace with test accounts.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const origin = 'https://dev.griipbuddy.com';
const root = origin + '/operations-preview';
const path = '/desk/operations/purchases';
const output = process.env.GRIIP_PURCHASING_EVIDENCE;
if (!output || !process.env.GRIIP_BRAVE_EXECUTABLE) throw new Error('Set the staging evidence directory and Brave executable.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.GRIIP_BRAVE_EXECUTABLE, headless: true });
const stamp = randomBytes(4).toString('hex').toUpperCase();
const sku = 'OPS-TEST-RECEIVE-BLACK';
const supplier = '00000000000000000000f103';
const expected = 'Test Supplier · Demo Components';
const url = (suffix = '') => root + path + suffix;
const pos = (page, name) => page.getByRole('button', { name, exact: true });
const text = (page, name) => page.getByRole('heading', { name, exact: true });
const navigate = (page, suffix) => page.goto(root + suffix, { waitUntil: 'domcontentloaded' });
const shot = (page, name) => page.screenshot({ path: join(output, name + '.png'), fullPage: true, animations: 'disabled' });
const api = root + '/api/operations/purchases';
async function login(role, phone, mobile = false) {
  const password = process.env['GRIIP_OPS_STAGE_' + role + '_PASSWORD'];
  assert.match(password ?? '', /^[a-f0-9]{48}$/);
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await navigate(page, '/sign-in');
  await page.getByLabel('Staff email or phone number').fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await pos(page, 'Sign in').click();
  await page.waitForURL(root + '/desk/operations', { waitUntil: 'domcontentloaded' });
  return page;
}
function posted(page, buttonName) {
  return Promise.all([
    page.waitForResponse(res => res.url().startsWith(api) && res.request().method() === 'POST'),
    pos(page, buttonName).click(),
  ]).then(async ([response]) => {
    const result = await response.json();
    assert.equal(response.status(), 200, result.message);
    return { data: result.data, request: response.request().postDataJSON() };
  });
}
async function details(page, order) {
  const response = await page.request.get(api + '/' + order + '?region=BD');
  const value = await response.json();
  assert.equal(response.status(), 200, value.message);
  return value.data;
}
async function awaitStatus(page, badge) {
  await page.locator('.po-status').getByText(badge, { exact: true }).waitFor();
}

try {
  const owner = await login('OWNER', '01000000001');
  const warehouse = await login('RECEIVE', '01000000013', true);
  const packer = await login('PACK', '01000000011');
  assert.equal(await packer.getByRole('link', { name: 'Purchases & receiving', exact: true }).count(), 0);
  await packer.goto(url());
  await text(packer, 'Access restricted').waitFor();
  await owner.goto(url('/new'));
  await text(owner, 'New purchase draft').waitFor();
  const supplierInput = owner.locator('select[name="supplier"]');
  await supplierInput.waitFor();
  assert.ok(await supplierInput.locator('option').filter({ hasText: 'Demo Components' }).count() === 1);
  await supplierInput.selectOption(supplier);
  await owner.getByLabel('Find internal SKU').fill(sku);
  await pos(owner, 'Add variant').click();
  await owner.getByLabel('Order quantity', { exact: true }).fill('10');
  await owner.getByLabel('Supplier SKU', { exact: true }).fill('TEST-SUP-BLACK');
  await owner.getByLabel('Quoted unit price in minor units').fill('12550');
  await owner.getByLabel('Freight', { exact: true }).fill('1500');
  await owner.getByLabel('Tax', { exact: true }).fill('0');
  await owner.getByLabel('Other charges', { exact: true }).fill('0');
  await owner.getByLabel('Quote or source reference').fill('TEST-QUOTE-' + stamp);
  await owner.getByLabel('Delivery terms', { exact: true }).fill('Fixture warehouse delivery. Count and inspect on arrival.');
  await owner.getByLabel('Payment terms', { exact: true }).fill('Test terms. 30 days after an invoice is recorded.');
  const { data: draft } = await posted(owner, 'Save purchase draft');
  await owner.waitForURL(url('/' + draft.order) + '?region=BD');
  await text(owner, 'Purchase order preview').waitFor();
  assert.equal((await details(owner, draft.order)).quote.totalMinor, 127000);
  assert.ok((await owner.locator('.po-preview').innerText()).includes(expected));
  await shot(owner, 'purchase-preview');
  await owner.emulateMedia({ media: 'print' });
  assert.equal(await owner.getByRole('heading', { name: 'Purchase order preview' }).isVisible(), true);
  assert.equal(await owner.getByRole('heading', { name: 'Approval and supplier updates' }).isVisible(), false);
  await owner.emulateMedia({ media: 'screen' });
  await owner.getByLabel('I checked the supplier, quantity, total and terms shown above.').check();
  await posted(owner, 'Approve this version');
  await awaitStatus(owner, 'Internally approved');
  const supplierForm = owner.locator('details').filter({ has: owner.getByText('Record supplier communication', { exact: true }) });
  await supplierForm.getByLabel('Reported stage').selectOption('confirmed');
  await supplierForm.getByLabel('Evidence reference', { exact: true }).fill('TEST-CONFIRM-' + stamp);
  await supplierForm.getByLabel('I am recording a supplier action that already occurred.').check();
  await posted(owner, 'Record supplier update');
  await awaitStatus(owner, 'Confirmed by manual record or document');
  const moneyBefore = (await details(owner, draft.order)).finance;
  assert.equal(moneyBefore.currencies[0].invoiced, null);
  assert.equal(moneyBefore.currencies[0].verified, 0);

  await warehouse.goto(url('/' + draft.order));
  await text(warehouse, 'Record a physical receipt').waitFor();
  assert.equal(await text(warehouse, 'Purchase order preview').count(), 0);
  assert.equal(await text(warehouse, 'Supplier invoices and payments').count(), 0);
  const layout = await warehouse.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return { overflow: document.documentElement.scrollWidth - width, wide: [...document.querySelectorAll('main *, header *, .ops-tabs')]
      .filter(node => node.clientWidth && node.getBoundingClientRect().right > width + 4 &&
        !(node.closest('.ops-scroll') && !node.matches('.ops-scroll')))
      .slice(0, 30).map(node => [node.tagName, node.className, Math.round(node.getBoundingClientRect().right)]) };
  });
  if (layout.overflow) {
    await shot(warehouse, 'receiving-layout-check');
    console.log('Mobile overflow elements', JSON.stringify(layout));
  }
  assert.equal(layout.overflow, 0);
  await warehouse.getByLabel('Supplier delivery reference').fill('TEST-DELIVERY-' + stamp);
  await warehouse.getByLabel('Supporting evidence reference').fill('TEST-NOTE-' + stamp);
  await warehouse.getByLabel('Physically received ' + sku, { exact: true }).fill('6');
  await warehouse.getByLabel('Accepted for sale ' + sku, { exact: true }).fill('5');
  await warehouse.getByLabel('Held for inspection ' + sku, { exact: true }).fill('1');
  await warehouse.getByLabel('I physically counted these stock units at this warehouse.').check();
  await shot(warehouse, 'receiving-mobile');
  const { data: receipt, request } = await posted(warehouse, 'Finalize physical receipt');
  const replay = await warehouse.request.post(api + '/' + draft.order + '?region=BD', { headers: { Origin: origin }, data: request });
  assert.equal((await replay.json()).data.id, receipt.id);
  await warehouse.reload();
  await text(warehouse, 'Receiving balances').waitFor();
  const warehouseView = await details(warehouse, draft.order);
  assert.equal(warehouseView.quote, undefined);
  assert.equal(warehouseView.finance, undefined);
  assert.deepEqual(warehouseView.totals[0], { variant: '00000000000000000000f102', ordered: 10, delivered: 6, closed: 0, physical: 6,
    accepted: 5, held: 1, rejected: 0, expected: 4 });

  await owner.reload();
  await text(owner, 'Receiving balances').waitFor();
  await owner.getByText('Purchase and receiving audit', { exact: true }).click();
  await owner.getByText('Manual operator report · TEST-CONFIRM-' + stamp, { exact: true }).waitFor();
  await shot(owner, 'partial-receipt');
  await pos(warehouse, 'Print stock labels').click();
  await text(warehouse, 'Print 5 labels').waitFor();
  assert.equal(await warehouse.locator('.barcode-label').count(), 5);
  await pos(warehouse, 'Close').click();

  await owner.getByText('Close undelivered remainder', { exact: true }).click();
  const closeForm = owner.locator('details').filter({ has: owner.getByText('Close undelivered remainder', { exact: true }) });
  await closeForm.getByLabel('Closure reason').fill('The receiving team closed four undelivered test units.');
  await closeForm.getByLabel('Evidence reference', { exact: true }).fill('TEST-CLOSE-' + stamp);
  await posted(owner, 'Close the undelivered units');
  await awaitStatus(owner, 'Remainder closed internally');
  const closed = await details(owner, draft.order);
  assert.equal(closed.totals[0].closed, 4);
  assert.equal(closed.totals[0].accepted, 5);
  assert.equal(closed.totals[0].held, 1);
  assert.deepEqual(closed.finance, moneyBefore);
  await owner.getByText('Release held goods after inspection', { exact: true }).click();
  const release = owner.locator('details').filter({ has: owner.getByText('Release held goods after inspection', { exact: true }) });
  await release.getByLabel('Quantity to release').fill('1');
  await release.getByLabel('Inspection reason').fill('The synthetic unit passed a warehouse inspection.');
  await release.getByLabel('Evidence reference', { exact: true }).fill('TEST-INSPECTION-' + stamp);
  const released = await posted(owner, 'Release inspected units');
  const retried = await owner.request.post(api + '/' + draft.order + '?region=BD', { headers: { Origin: origin }, data: released.request });
  assert.equal((await retried.json()).data.id, released.data.id);
  await owner.reload();
  await text(owner, 'Receiving balances').waitFor();
  const final = await details(owner, draft.order);
  assert.equal(final.totals[0].accepted, 6);
  assert.equal(final.totals[0].held, 0);
  assert.equal(final.totals[0].closed, 4);
  assert.deepEqual(final.finance, moneyBefore);
  assert.equal(final.audit.filter(row => row.kind === 'receipt').length, 1);
  assert.equal(final.audit.filter(row => row.kind === 'release').length, 1);
  await owner.getByText('Purchase and receiving audit', { exact: true }).click();
  await shot(owner, 'closed-and-released');
  await writeFile(join(output, 'hosted-receipt.json'), JSON.stringify({
    order: draft.order, reference: final.reference, quoteMinor: 127000, currency: 'BDT', partial: warehouseView.totals[0],
    final: final.totals[0], invoiceAndPaymentsUnchanged: true, mutations: final.audit.map(({ id, at, kind, actor }) => ({ id, at, kind, actor })),
    postings: final.postings.map(row => ({ ref: row._id, movement: row.movement, lot: row.lot, quantity: row.quantity })),
  }, null, 2) + '\n');
  console.log('PASS Hostinger Brave owner draft, print preview and manual confirmation');
  console.log('PASS 390px receiving access, purchase and finance exclusion, duplicate receipt and five printable unit labels');
  console.log('PASS close four undelivered units, release one retained unit exactly once, stable audit and unchanged payment evidence');
  console.log('Hosted test order ' + final.reference);
} finally { await browser.close(); }
