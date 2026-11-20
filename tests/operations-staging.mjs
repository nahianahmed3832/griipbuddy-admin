// Runs against the dedicated operations preview and writes screenshots of synthetic data.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.env.GRIIP_OPERATIONS_PREVIEW_ORIGIN ?? 'https://dev.griipbuddy.com';
const root = origin + '/operations-preview';
const desk = '/desk/operations';
const evidence = process.env.GRIIP_OPERATIONS_EVIDENCE;
const phones = { owner: '01000000001', pack: '01000000011', support: '01000000012' };
const open = async (page, path) => page.goto(root + path, { waitUntil: 'networkidle' });
const screenshot = async (page, name) => { if (evidence) await page.screenshot({ path: join(evidence, name + '.png'), fullPage: true }); };
const heading = (page, name) => page.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible' });
const lookup = async (page, reference) => {
  await open(page, desk + '/support');
  await page.getByLabel('Invoice or order number').fill(reference);
  await page.getByRole('button', { name: 'Find order' }).click();
  await page.getByRole('heading', { name: new RegExp(reference) }).waitFor();
  await page.waitForLoadState('networkidle');
};
const saveIssue = async (page, action, text) => {
  await page.getByLabel('Issue action').selectOption(action);
  if (text) await page.getByRole('textbox').last().fill(text);
  const pending = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/operations/issues/'));
  await page.getByRole('button', { name: 'Save issue' }).click();
  const response = await pending;
  const payload = await response.json();
  assert.equal(response.status(), 200, payload.message);
  return payload.data;
};
const post = (page, path, data) => page.request.post(root + '/api/operations/' + path + '?region=BD', {
  headers: { Origin: origin, 'Content-Type': 'application/json' }, data,
});

assert.equal(new URL(origin).hostname, 'dev.griipbuddy.com', 'Use the dedicated synthetic staging site.');
if (evidence) await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.GRIIP_BRAVE_EXECUTABLE, headless: true });
try {
  const pages = {};
  for (const [role, phone] of Object.entries(phones)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, colorScheme: 'light' });
    const page = await context.newPage();
    page.setDefaultTimeout(14000);
    const password = process.env['GRIIP_OPS_STAGE_' + role.toUpperCase() + '_PASSWORD'];
    assert.match(password ?? '', /^[a-f0-9]{48}$/);
    await open(page, '/sign-in');
    await page.getByLabel('Staff email or phone number').fill(phone);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(root + desk);
    pages[role] = page;
  }
  const { owner, pack, support } = pages;
  await heading(owner, 'Financial overview');
  await heading(pack, 'Packing queue');
  await heading(support, 'Customer support');
  assert.equal(await pack.getByRole('link', { name: 'COD reconciliation' }).count(), 0);
  assert.equal(await support.getByRole('link', { name: 'Packing', exact: true }).count(), 0);
  const crossOrigin = await owner.request.post(root + '/api/operations/refresh', { data: {}, headers: { Origin: 'https://example.invalid' } });
  assert.equal(crossOrigin.status(), 403);
  assert.equal((await post(support, 'refresh', {})).status(), 403);
  assert.equal(await owner.getByRole('button', { name: 'Generate operations briefing' }).isDisabled(), true);
  console.log('PASS protected role landing views, mutation origin checks and AI unavailable state');

  await open(owner, desk + '/queue');
  await owner.getByRole('button', { name: 'Refresh sources' }).click();
  await owner.getByRole('status').filter({ hasText: 'Source check complete.' }).waitFor();
  await screenshot(owner, 'exception-queue');
  const initial = pack.locator('.ops-pack').filter({ has: pack.getByRole('heading', { name: 'OPS-STAGE-PACK-101' }) });
  if (await pack.locator('.ops-pack').count()) await screenshot(pack, 'packing-queue');
  if (await initial.count()) {
    if (await initial.getByRole('button', { name: 'Record picking' }).count()) {
      await initial.getByLabel('Scan unit barcodes').fill('OPS-UNIT-02');
      await initial.getByRole('button', { name: 'Record picking' }).click();
    }
    await initial.getByRole('button', { name: 'Mark packed' }).click();
    await initial.waitFor({ state: 'detached' });
  }
  await open(owner, desk + '/queue?state=resolved');
  await owner.getByRole('link', { name: 'Open Awaiting packing OPS-STAGE-PACK-101' }).click();
  await owner.getByText('Packing recorded on order').waitFor();
  await screenshot(owner, 'packing-completed');
  console.log('PASS existing barcode pick and pack workflow with persisted queue resolution');

  await lookup(support, 'OPS-STAGE-DELIVERY-102');
  await support.getByText('Partial delivered', { exact: true }).waitFor();
  await screenshot(support, 'support-order-history');
  await open(support, desk + '/queue?state=resolved');
  const existingSupport = support.getByRole('link', { name: 'Open Customer request OPS-STAGE-DELIVERY-102' }).first();
  if (await existingSupport.count()) {
    await existingSupport.click();
    await support.getByRole('heading', { name: 'Saved editable draft' }).waitFor();
  } else {
    await lookup(support, 'OPS-STAGE-DELIVERY-102');
    await support.getByText('Record a customer request', { exact: true }).click();
    await support.getByLabel('Request details').fill('STAGING: customer reports that part of the shipment is missing.');
    const newIssue = support.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/operations/support'));
    await support.getByRole('button', { name: 'Create support request' }).click();
    const newRecord = await newIssue;
    assert.equal(newRecord.status(), 200);
    await open(support, desk + '/queue/' + (await newRecord.json()).data._id);
    const claim = support.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/operations/issues/'));
    await support.getByRole('button', { name: 'Claim issue' }).click();
    assert.equal((await claim).status(), 200);
    await support.getByRole('button', { name: 'Claim issue' }).waitFor({ state: 'detached' });
    await saveIssue(support, 'draft', 'STAGING: We will review the recorded tracking status and follow up.');
    await support.getByRole('heading', { name: 'Saved editable draft' }).waitFor();
    await saveIssue(support, 'resolve', 'Synthetic request reviewed and draft prepared.');
  }
  await support.getByText('Synthetic request reviewed and draft prepared.').first().waitFor();
  await screenshot(support, 'support-request');
  await lookup(support, 'OPS-STAGE-DELIVERY-102');
  await support.getByText('Partial delivered', { exact: true }).waitFor();
  console.log('PASS support lookup, claim, editable draft, and audited resolution without shipment change');

  await lookup(support, 'OPS-STAGE-PACK-108');
  const orderId = '00000000000000000000a108';
  const cancelled = support.getByRole('heading', { name: /OPS-STAGE-PACK-108/i }).filter({ hasText: /cancelled/i });
  if (await cancelled.count()) {
    await open(owner, desk + '/queue?state=resolved');
    await owner.getByRole('link', { name: 'Open Customer request OPS-STAGE-PACK-108' }).click();
    await owner.getByText('Completion evidence order:' + orderId + ':cancelled').waitFor();
  } else {
    const cancelRequest = await post(support, 'support', { order: orderId, category: 'cancellation',
      details: 'STAGING: customer asked to cancel the unpaid COD order.', request: randomUUID() });
    assert.equal(cancelRequest.status(), 200);
    const request = (await cancelRequest.json()).data;
    await open(owner, desk + '/queue/' + request._id);
    await heading(owner, 'Cancellation request');
    await saveIssue(owner, 'approve', 'Approved cancellation for the unpaid staging order.');
    await owner.getByText('Cancel eligible unpaid COD order', { exact: true }).click();
    await owner.getByRole('button', { name: 'Cancel order', exact: true }).click();
    await owner.getByRole('status').filter({ hasText: 'Cancellation recorded on the order.' }).waitFor();
    await saveIssue(owner, 'complete');
    await owner.getByText('Completion evidence order:' + orderId + ':cancelled').waitFor();
    await saveIssue(owner, 'resolve', 'Cancelled through the order service and confirmed in the order history.');
    await lookup(support, 'OPS-STAGE-PACK-108');
    await cancelled.waitFor();
  }
  await screenshot(owner, 'owner-cancellation');
  console.log('PASS separate support request, owner approval, existing order cancellation, and completion evidence');

  const bangladeshDay = new Date(Date.now() + 21600_000).toISOString().slice(0, 10);
  const now = new Date(bangladeshDay + 'T00:00:00+06:00');
  const batch = 'OPS-STAGE-BATCH-102';
  const checkBatch = owner.getByRole('link', { name: 'OPS-STAGE-SET-102', exact: true });
  await open(owner, desk + '/cod');
  const alreadyRecorded = await checkBatch.count();
  const source = { courier: 'STEADFAST', batch, currency: 'BDT', occurredAt: now.toISOString(), status: 'verified' };
  const collection = { ...source, kind: 'collection', order: '00000000000000000000a102',
    reference: 'OPS-STAGE-COL-102', amount: 60000, evidence: 'OPS-STAGE-COURIER-102' };
  const fee = { ...source, kind: 'fee', reference: 'OPS-STAGE-FEE-102', amount: 6000, evidence: 'OPS-STAGE-COURIER-102' };
  const settlement = { ...source, kind: 'settlement', reference: 'OPS-STAGE-SET-102',
    amount: 42000, evidence: 'OPS-STAGE-RECEIPT-102', status: 'received' };
  for (const row of alreadyRecorded ? [] : [collection, fee, settlement]) {
    const result = await post(owner, 'cod', row);
    assert.equal(result.status(), 200, (await result.json()).message);
    const repeat = await post(owner, 'cod', row);
    assert.equal(repeat.status(), 200);
    assert.equal((await repeat.json()).data._id, (await result.json()).data._id);
  }
  await open(owner, desk + '/cod');
  await heading(owner, 'COD reconciliation');
  await owner.getByText('BDT 120.00', { exact: true }).waitFor();
  await screenshot(owner, 'cod-reconciliation');
  const from = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
  await open(owner, desk + '?from=' + from + '&to=' + bangladeshDay);
  await owner.getByText('BDT 420.00', { exact: true }).waitFor();
  await owner.getByText('BDT 600.00', { exact: true }).waitFor();
  await screenshot(owner, 'financial-overview');
  const start = from;
  const today = new Date().toISOString().slice(0, 10);
  await open(owner, desk + '?region=INTERNATIONAL&from=' + start + '&to=' + today);
  await owner.getByText('USD 27.35', { exact: true }).first().waitFor();
  await screenshot(owner, 'financial-overview-usd');
  console.log('PASS BDT 600 collected, BDT 60 fees, BDT 420 received, BDT 120 unmatched, duplicate replay and separate USD');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    storageState: await support.context().storageState() });
  const mobilePage = await mobile.newPage();
  await open(mobilePage, desk + '/support');
  await heading(mobilePage, 'Customer support');
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await screenshot(mobilePage, 'support-mobile');
  console.log('PASS mobile support viewport');
} finally {
  await browser.close();
}
