import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const origin = process.env.GRIIP_EDITABLE_ORDER_UI ?? 'http://127.0.0.1:4358';
const backend = process.env.GRIIP_EDITABLE_ORDER_API ?? 'http://127.0.0.1:38565';
if (![origin, backend].every(value => /^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(value))) throw Error('Use an isolated loopback fixture.');
const credentials = { phone_number: '01000000001', password: 'fixture-only-password' };
const base = origin + '/admin';
const timeout = 60000;
const response = await fetch(backend + '/api/v1/user/admin/login', { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
const token = (await response.json()).data.access_token;
async function api(path, method = 'GET', body, expected = 200) {
  const result = await fetch(backend + '/api/v1' + path, { method, headers: { Authorization: 'Bearer ' + token,
    ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body) });
  const content = await result.json();
  assert.equal(result.status, expected, path + ' ' + JSON.stringify(content).slice(0, 300));
  return content.data;
}
async function sample(phone) {
  const results = await api('/order?searchQuery=' + phone);
  const order = results.data.find(item => item.customer_phone === phone);
  assert.match(order._id, /^[0-9a-f]{24}$/);
  return order;
}
const order = await sample('01000000623');
const receipt = await sample('01000000626');
await api('/global/admin/markets/BD', 'PUT', { revision: null,
  methods: { cod: { enabled: true, provider: 'cod' } },
  zones: [{ service: 'domestic', enabled: true, provider: 'steadfast', origin: 'BD', base: 800, perKg: 0 }] });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ bypassCSP: true });
  const login = await page.request.post(base + '/api/session', { headers: { Origin: origin },
    form: { phone: credentials.phone_number, password: credentials.password }, maxRedirects: 0 });
  assert.equal(new URL(login.headers().location, origin).pathname, '/admin/dashboard/overview');
  const path = id => base + '/api/managed?order=' + id;
  const context = async (id = order._id) => {
    const response = await page.request.get(path(id));
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  const expectNotice = text => expect(page.getByRole('status').filter({ hasText: text })).toBeVisible({ timeout });
  async function act(form, name, message, id = order._id) {
    const seen = page.waitForResponse(response => response.url() === path(id) && response.request().method() === 'POST', { timeout });
    await form.getByRole('button', { name, exact: true }).click();
    const response = await seen;
    assert.equal(response.status(), 200, await response.text());
    await expectNotice(message);
  }
  async function visit(id) {
    const response = await page.goto(base + '/dashboard/order-details/' + id, { waitUntil: 'domcontentloaded', timeout: 90000 });
    assert.equal(response?.status(), 200);
    await page.getByRole('heading', { name: /ORDER ID:/ }).waitFor({ timeout });
  }
  await visit(receipt._id);
  let pay = page.getByRole('region', { name: 'Payment Info' });
  await expect(pay.getByText('Transaction Id:', { exact: false })).toBeVisible({ timeout });
  await expect(pay.getByText('Receipt Reference: DEV-SAMPLE-ADVANCE-626')).toBeVisible({ timeout });
  const receiptDownload = await page.request.get(origin + await pay.getByRole('link', { name: 'Download receipt' }).getAttribute('href'));
  assert.equal(receiptDownload.headers()['content-type'], 'image/jpeg');
  await pay.getByLabel('Verified receipt reference').fill('DEV-SAMPLE-ADVANCE-626');
  await pay.getByLabel('Verified amount (BDT)').fill(String((await context(receipt._id)).payment.payment.amount / 100));
  await pay.getByLabel('Review note').fill('Verified isolated receipt');
  await act(pay, 'Approve payment', 'Payment approved.', receipt._id);

  await visit(order._id);
  await page.getByRole('region', { name: 'Payment Info' }).waitFor({ timeout });
  await page.getByRole('button', { name: 'Order Actions', exact: true }).click();
  const actionDialog = page.getByRole('dialog');
  await actionDialog.getByText('Edit Order', { exact: true }).click();
  await actionDialog.getByLabel('Customer name').fill('Reviewed editable fixture customer');
  await expect(actionDialog.getByLabel('District')).toHaveAttribute('readonly', '');
  await actionDialog.getByLabel('Delivery address').fill('Updated editable fixture street');
  const editResponse = page.waitForResponse(response => response.url().includes('/api/website-orders?action=edit-managed') &&
    response.request().method() === 'POST', { timeout });
  await actionDialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  const changed = await editResponse;
  assert.equal(changed.status(), 200, await changed.text());
  await expectNotice('Order details updated.');
  await expect(page.getByText('Name: Reviewed editable fixture customer').first()).toBeVisible({ timeout });
  await page.getByText('Shipment', { exact: true }).click();
  let plan = page.getByRole('form', { name: 'Plan shipment' });
  for (let attempt = 0; attempt < 2; attempt++) {
    await plan.getByLabel('Business location').selectOption({ index: 1 });
    await plan.getByLabel('Courier service').selectOption('domestic');
    for (const [name, size] of [['Weight (g)', '230'], ['Length (cm)', '16'], ['Width (cm)', '12'], ['Height (cm)', '8']]) {
      await plan.getByLabel(name, { exact: true }).fill(size);
    }
    await plan.getByLabel(/Quantity to ship/).fill('1');
    await act(plan, 'Plan shipment', 'Shipment planned.');
  }
  assert.equal((await context()).shipments.length, 2);
  assert((await context()).shipments.every(shipment => shipment.lines[0].quantity === 1));
  const assigned = await page.goto(base + '/dashboard/assigned-orders?q=' + order.order_serial_id, { timeout: 90000 });
  assert.equal(assigned?.status(), 200);
  await expect(page.getByRole('heading', { name: 'Assigned Orders (1)' })).toBeVisible({ timeout });
  await expect(page.getByRole('columnheader', { name: 'Courier Info' })).toBeVisible();
  await expect(page.getByLabel('Created By')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '#' + order.order_serial_id })).toHaveAttribute('href', /source=assigned/);
  const foreignMutation = await page.request.post(path(order._id), { headers: { Origin: origin }, data: {
    action: 'payment-action', id: (await context(receipt._id)).payment.payment.id, market: 'BD', step: 'collect', values: {},
  } });
  assert.equal(foreignMutation.status(), 404);

  await page.getByRole('link', { name: '#' + order.order_serial_id }).click();
  await page.getByText('Shipment', { exact: true }).click();
  for (const suffix of ['A', 'B']) {
    await act(page.getByRole('button', { name: 'Confirm pick', exact: true }).first().locator('..'), 'Confirm pick', 'Shipment picked.');
    await act(page.getByRole('button', { name: 'Mark packed' }).first().locator('..'), 'Mark packed', 'Shipment packed.');
    const handoff = page.getByText('Record courier handoff', { exact: true }).first();
    await handoff.click();
    const form = handoff.locator('..');
    await form.getByLabel('Tracking number').fill('EDITABLE-ORDER-' + suffix);
    await form.getByLabel('Verified handoff reference').fill('PROOF-HANDOFF-' + suffix);
    await act(form, 'Record courier handoff', 'Courier handoff recorded.');
    const tracking = page.getByText('Record tracking event', { exact: true }).first();
    await tracking.click();
    const observation = tracking.locator('..');
    await observation.getByLabel('Courier event ID').fill('OBSERVED-' + suffix);
    const localTime = await page.evaluate(() => {
      const now = new Date(Date.now() + 60_000);
      return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    });
    await observation.getByLabel('Observed at').fill(localTime);
    await observation.getByLabel('Courier status').fill('delivered');
    await observation.getByLabel('Verified tracking reference').fill('PROOF-DELIVERED-' + suffix);
    await act(observation, 'Record tracking event', 'Tracking event recorded.');
  }
  assert.equal((await context()).status, 'DELIVERED');

  pay = page.getByRole('region', { name: 'Payment Info' });
  await pay.locator('summary').filter({ hasText: 'Record collection' }).click();
  await pay.getByLabel('Verified amount (BDT)').fill(String((await context()).payment.collection.amount / 100));
  await pay.getByLabel('Verified collection reference').fill('EDITABLE-COD-RECEIVED');
  await act(pay, 'Record collection', 'Collection recorded.');
  await expect(pay.getByText('Transaction Id: EDITABLE-COD-RECEIVED')).toBeVisible({ timeout });
  await pay.locator('summary').filter({ hasText: 'Record refund' }).click();
  await pay.getByLabel('Verified amount (BDT)').fill('1');
  await pay.getByLabel('Refund reason').fill('Isolated workflow test');
  await pay.getByLabel('Verified refund reference').fill('EDITABLE-COD-REFUND');
  await act(pay, 'Record refund', 'Refund recorded.');
  assert.equal((await context()).payment.payment.status, 'captured');

  const requestReturn = page.getByRole('button', { name: 'Mark as Pending Return', exact: true });
  await act(requestReturn.locator('..'), 'Mark as Pending Return', 'Order marked as pending return.');
  const returning = page.getByRole('form', { name: 'Record return shipment' }).first();
  await returning.getByLabel('Return tracking number').fill('EDITABLE-REVERSE-1');
  await returning.getByLabel('Verified return handoff reference').fill('VERIFIED-RETURN-1');
  await returning.getByLabel(/Return quantity/).fill('1');
  await act(returning, 'Record return shipment', 'Return shipment recorded.');
  const receiving = page.getByRole('form', { name: 'Receive return' });
  await receiving.getByLabel('Verified warehouse receipt reference').fill('WAREHOUSE-RETURN-1');
  await receiving.getByLabel('Sellable quantity').fill('1');
  await act(receiving, 'Receive return', 'Return received.');
  const result = await context();
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.shipments.find(shipment => shipment.direction === 'return').receiptLines[0].sellable, 1);

  // Use the actual rendered page to check historical allocations without modifying the pick history of the fixture above.
  const line = result.lines[0];
  const reviewedReturn = '00000000000000000000e101';
  const oldLot = '00000000000000000000e111';
  const heldLot = '00000000000000000000e112';
  let observed;
  await page.route(path(order._id), async route => {
    if (route.request().method() === 'POST') {
      observed = route.request().postDataJSON();
      return route.fulfill({ json: { state: 'returned' } });
    }
    const sample = { _id: reviewedReturn, direction: 'return', state: 'dispatched', tracking: 'LEGACY-RETURN-REVIEW',
      lines: [{ ...line, quantity: 1 }], lotReview: [{ id: line.id, quantity: 1, lots: [
        { id: oldLot, lotNumber: 'Warehouse lot A', available: 1, sellableAvailable: 1 },
        { id: heldLot, lotNumber: 'Warehouse lot B', available: 1, sellableAvailable: 0 },
      ] }] };
    return route.fulfill({ json: { ...result, shipments: [...result.shipments, sample] } });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Shipment', { exact: true }).click();
  const review = page.getByRole('form', { name: 'Receive return' });
  await review.getByLabel('Verified warehouse receipt reference').fill('OLD-WAREHOUSE-RETURN');
  await expect(review.getByLabel('Sellable quantity for Warehouse lot B')).toHaveAttribute('max', '0');
  await review.getByLabel('Damaged quantity for Warehouse lot B').fill('1');
  await review.getByLabel('Reason', { exact: true }).fill('Verified warehouse packing slip');
  await act(review, 'Receive return', 'Return received.');
  assert.equal(observed.id, reviewedReturn);
  assert.equal(observed.values.lotEvidence, 'Verified warehouse packing slip');
  assert.deepEqual(observed.values.lines[0].lots, [{ id: heldLot, sellable: 0, damaged: 1 }]);
  console.log('PASS editable Assigned Orders and Order Details with original filters, contact edit, manual receipt, split planning, dispatch, tracking, collection, refund, partial return and the historical lot browser form.');
} finally {
  await browser.close();
}
