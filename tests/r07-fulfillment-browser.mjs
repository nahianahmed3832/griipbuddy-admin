import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = process.env.GRIIP_R07_FULFILLMENT_ORIGIN;
const password = process.env.GRIIPBUDDY_TEST_FIXTURE_PASSWORD;
const output = process.env.GRIIP_R07_FULFILLMENT_EVIDENCE_DIR;
assert.match(origin ?? '', /^http:\/\/127\.0\.0\.1:\d{4,5}$/);
assert(password && output);
const prefix = '/admin';
const desk = prefix + '/desk/shipping/shipment-desk';
const queue = desk + '?region=BD&market=BD&state=packed&direction=outbound';
const orderPage = prefix + '/dashboard/order-details/';
const stamp = randomUUID().slice(0, 8);
const tracking = 'SYN-R07-' + stamp;
const handoff = 'R07-HANDOFF-' + stamp;
const event = { id: 'SYN-R07-TRANSIT-' + stamp, code: 'in_transit', evidence: 'R07-OBSERVATION-' + stamp };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.GRIIP_R07_CHROMIUM });

async function open(width) {
  const context = await browser.newContext({ baseURL: origin, viewport: { width, height: 900 }, timezoneId: 'UTC' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  const login = await page.request.post(prefix + '/api/session', {
    form: { phone: '01000000001', password }, headers: { Origin: origin }, maxRedirects: 0,
  });
  assert.equal(login.status(), 303);
  return page;
}

async function fit(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize().width);
}

function adapter(order) { return prefix + '/api/managed?order=' + order; }

async function update(page, order, shipment, step, values, expected = 200) {
  const response = await page.request.post(adapter(order), {
    headers: { Origin: origin }, data: { action: 'shipment-action', id: shipment, market: 'BD', step, values },
  });
  assert.equal(response.status(), expected, await response.text());
  if (expected === 200) return response.json();
}

async function showShipment(page, order, shipment) {
  await page.goto(orderPage + order);
  await expect(page.locator('.sidebar-foot')).toHaveText('Local fixture');
  const panel = page.getByRole('complementary', { name: 'Order operations' });
  await panel.locator('summary').filter({ hasText: /^Shipment$/ }).click();
  const parcel = panel.getByRole('region', { name: 'Shipment ' + shipment.slice(-8) });
  await expect(parcel.getByRole('list', { name: 'Parcel dimensions' })).toContainText('250 g · 20 × 14 × 6 cm');
  await expect(parcel.getByRole('list', { name: 'Allocated lines' })).toContainText('FIXTURE-ADMIN-ALLOY · 2 units');
  return parcel;
}

let order;
let shipment;
try {
  const desktop = await open(1440);
  try {
    await desktop.goto(queue);
    await expect(desktop.locator('.sidebar-foot')).toHaveText('Local fixture');
    const filters = desktop.getByRole('form', { name: 'Filter shipment queue' });
    const states = filters.getByRole('combobox', { name: 'Shipment state' });
    await expect(states).toHaveValue('packed');
    await expect(states.locator('option[value="customs"]')).toHaveText('Customs');
    await expect(states.locator('option[value="processing"]')).toHaveText('Processing');
    const records = desktop.getByRole('region', { name: 'Shipment queue table' }).getByRole('link');
    await expect(records.first()).toBeVisible();
    for (const link of await records.all()) {
      const href = await link.getAttribute('href');
      const selected = new URL(href, origin);
      const selectedOrder = selected.searchParams.get('order');
      const selectedShipment = selected.searchParams.get('record');
      const response = await desktop.request.get(adapter(selectedOrder));
      if (!response.ok()) continue;
      const data = await response.json();
      const row = data.shipments.find(parcel => parcel._id === selectedShipment && parcel.state === 'packed');
      if (!row?.lines.some(line => line.sku === 'FIXTURE-ADMIN-ALLOY' && line.quantity === 2) || row.parcels?.[0]?.grams !== 250) continue;
      assert.equal(selected.searchParams.get('state'), 'packed');
      assert.equal(selected.searchParams.get('direction'), 'outbound');
      order = selectedOrder;
      shipment = selectedShipment;
      await desktop.goto(href);
      break;
    }
    assert.match(order ?? '', /^[0-9a-f]{24}$/);
    assert.match(shipment ?? '', /^[0-9a-f]{24}$/);
    const wrongMarket = await desktop.request.get(adapter(order) + '&market=US');
    assert.equal(wrongMarket.status(), 409);
    await update(desktop, order, '07'.repeat(12), 'dispatch', { tracking, evidence: handoff }, 404);
    await expect(desktop.getByRole('region', { name: 'Order line allocation table' })).toContainText('FIXTURE-ADMIN-ALLOY');
    await expect(desktop.getByRole('columnheader', { name: 'Remaining' })).toBeVisible();
    await expect(desktop.getByRole('link', { name: 'Back to shipment queue' })).toHaveAttribute('href', queue);
    await fit(desktop);

    const parcel = await showShipment(desktop, order, shipment);
    await desktop.evaluate(() => { window.print = () => document.body.setAttribute('data-r07-invoice-print', 'yes'); });
    await desktop.getByRole('button', { name: 'Print Invoice', exact: true }).click();
    await expect(desktop.locator('body')).toHaveAttribute('data-r07-invoice-print', 'yes');
    await desktop.emulateMedia({ media: 'print' });
    await expect(desktop.getByRole('region', { name: 'Invoice', exact: true })).toBeVisible();
    await expect(parcel).toBeHidden();
    await desktop.emulateMedia({ media: 'screen' });

    await parcel.locator('summary').filter({ hasText: /^Record courier handoff$/ }).click();
    await parcel.getByLabel('Tracking number').fill(tracking);
    await parcel.getByLabel('Verified handoff reference').fill(handoff);
    const dispatch = desktop.waitForResponse(response => response.url().includes(adapter(order)) && response.request().method() === 'POST');
    await parcel.getByRole('button', { name: 'Record courier handoff', exact: true }).click();
    const dispatched = await dispatch;
    assert.equal(dispatched.status(), 200, await dispatched.text());
    await expect(parcel).toContainText(tracking);
    const replay = await update(desktop, order, shipment, 'dispatch', { tracking, evidence: handoff });
    assert.deepEqual([replay.id, replay.state], [shipment, 'dispatched']);

    await parcel.locator('summary').filter({ hasText: /^Record tracking event$/ }).click();
    await parcel.getByLabel('Courier event ID').fill(event.id);
    const observed = new Date(Date.now() + 90_000).toISOString().slice(0, 16);
    await parcel.getByLabel('Observed at').fill(observed);
    await parcel.getByLabel('Courier status').fill(event.code);
    await parcel.getByLabel('Verified tracking reference').fill(event.evidence);
    const updateResponse = desktop.waitForResponse(response => response.url().includes(adapter(order)) && response.request().method() === 'POST');
    await parcel.getByRole('button', { name: 'Record tracking event', exact: true }).click();
    const updated = await updateResponse;
    assert.equal(updated.status(), 200, await updated.text());
    const at = new Date(observed + 'Z').toISOString();
    assert.equal((await update(desktop, order, shipment, 'tracking', { ...event, at })).state, 'in-transit');
    assert.equal((await update(desktop, order, shipment, 'tracking', {
      id: 'SYN-R07-LATE-' + stamp, at: new Date(Date.now() - 60_000).toISOString(),
      code: 'delayed', evidence: 'R07-OLDER-EVENT-' + stamp,
    })).state, 'in-transit');
    await parcel.getByRole('link', { name: 'View shipment history' }).click();
    const events = desktop.getByRole('region', { name: 'Tracking history table' });
    await expect(events.getByRole('row').filter({ hasText: 'in_transit' })).toHaveCount(1);
    await expect(events.getByRole('row').filter({ hasText: 'handoff' })).toHaveCount(1);
    await expect(events.getByRole('row').filter({ hasText: 'delayed' })).toContainText('Audit only');
    await fit(desktop);
    await desktop.getByRole('region', { name: 'Tracking history', exact: true }).screenshot({ path: join(output, 'r07-shipment-history-1440.png') });
  } finally {
    await desktop.context().close();
  }

  const mobile = await open(390);
  try {
    const parcel = await showShipment(mobile, order, shipment);
    await expect(parcel).toContainText('in-transit');
    await expect(parcel).toContainText(tracking);
    await fit(mobile);
    await parcel.screenshot({ path: join(output, 'r07-shipment-detail-390.png') });
    await parcel.getByRole('link', { name: 'View shipment history' }).click();
    await expect(mobile.getByRole('region', { name: 'Tracking history table' })).toContainText('Audit only');
    await fit(mobile);
  } finally {
    await mobile.context().close();
  }

  const report = {
    status: 'PASS', synthetic: true, widths: [1440, 390],
    checks: ['scoped queue and state filters', 'persisted order and parcel binding', 'allocation and package details',
      'confirmed manual handoff and safe duplicate', 'one applied tracking effect', 'older event stays audit-only', 'single-order invoice print path', 'responsive history'],
  };
  await writeFile(join(output, 'R07_FULFILLMENT_BROWSER.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
