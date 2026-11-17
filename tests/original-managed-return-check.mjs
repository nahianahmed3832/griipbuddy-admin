import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { ManagedShipment } from '../deploy/original-admin/managed-shipment.mjs';

const require = createRequire(import.meta.url);
const api = '/admin/api/v1';
const global = api + '/global/admin';
const orderId = '507f1f77bcf86cd799439011';
const trackedId = '507f1f77bcf86cd799439012';
const fifoId = '507f1f77bcf86cd799439013';

function fixtureScript() {
  const packages = [
    ['react', 'react', 'react'],
    ['react-dom', 'react-dom', 'react-dom'],
    ['react-dom/client', 'react-dom', 'react-dom-client'],
    ['scheduler', 'scheduler', 'scheduler'],
  ];
  const modules = packages.map(([name, pkg, entry]) => {
    const source = readFileSync(join(dirname(require.resolve(pkg + '/package.json')), 'cjs', entry + '.production.js'), 'utf8');
    return JSON.stringify(name) + ': function(module, exports, require) {\n' + source + '\n}';
  });
  return [
    'const modules = {' + modules.join(',\n') + '};',
    'const cache = {};',
    'function require(name) {',
    '  if (cache[name]) return cache[name].exports;',
    '  const module = cache[name] = { exports: {} };',
    '  modules[name](module, module.exports, require);',
    '  return module.exports;',
    '}',
    ManagedShipment.toString(),
    "const hooks = require('react');",
    'const element = (tag, props, key) => hooks.createElement(tag, { ...props, key });',
    "require('react-dom/client').createRoot(document.getElementById('fixture')).render(",
    '  element(ManagedShipment, { order: ' + JSON.stringify({ _id: orderId, region: 'BD' }) + ', hooks, element })',
    ');',
  ].join('\n');
}

async function withFixture(run) {
  const script = fixtureScript();
  const server = createServer((request, response) => {
    if (request.url === '/fixture.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(script);
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><div id="fixture"></div><script src="/fixture.js"></script>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.GRIIP_ADMIN_TEST_CHROMIUM_EXECUTABLE });
    const page = await browser.newPage();
    await run(page, 'http://127.0.0.1:' + server.address().port);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

test('records a partial shipment and receives damaged and sellable stock from a split order', () =>
  withFixture(async (page, url) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const outbounds = [
      { _id: 'outbound-tracked', direction: 'outbound', state: 'delivered', tracking: 'OUT-TRACKED',
        returnableLines: [{ id: trackedId, sku: 'TRACKED', quantity: 3, tracked: true }] },
      { _id: 'outbound-fifo', direction: 'outbound', state: 'delivered', tracking: 'OUT-FIFO',
        returnableLines: [{ id: fifoId, sku: 'FIFO', quantity: 1, tracked: false }] },
    ];
    const returns = [];
    const posts = [];
    let status = 'RETURN_REQUESTED';
    await page.route('**/admin/api/v1/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const reply = data => route.fulfill({ json: { success: true, data } });
      if (path === api + '/order/' + orderId) return reply({ status });
      if (path === global + '/orders/' + orderId) return reply({ shipments: [...outbounds, ...returns], payments: [] });
      const parts = path.match(/\/shipments\/([^/]+)\/(return|receive)$/);
      if (!parts) return route.fulfill({ status: 404, json: {} });
      const [, id, action] = parts;
      const body = request.postDataJSON();
      posts.push({ id, action, body });
      if (action === 'return') {
        const outbound = outbounds.find(row => row._id === id);
        const lines = body.lines.map(({ id, quantity }) => {
          const line = outbound.returnableLines.find(row => row.id === id);
          line.quantity -= quantity;
          return { ...line, quantity, barcodes: line.tracked ? ['UNIT-001', 'UNIT-002', 'UNIT-003'] : [] };
        });
        returns.push({ _id: 'return-' + id, direction: 'return', parent: id, state: 'dispatched', tracking: body.tracking, lines });
      } else {
        const row = returns.find(row => row._id === id);
        Object.assign(row, { state: 'returned', receivedAt: new Date().toISOString(), receiptLines: body.lines });
        status = 'PARTIAL';
      }
      return reply({});
    });
    await page.goto(url);
    await page.getByText('Shipment', { exact: true }).click();
    const createForms = page.getByRole('form', { name: 'Record return shipment' });
    const trackedForm = createForms.filter({ has: page.getByLabel('Return quantity for TRACKED (3 available)') });
    await trackedForm.getByLabel('Return tracking number').fill('RETURN-TRACKED');
    await trackedForm.getByLabel('Verified return handoff reference').fill('HANDOFF-TRACKED');
    await trackedForm.getByRole('button').click();
    await expect(page.getByRole('status')).toHaveText('Enter the quantity to return for each applicable product.');
    assert.equal(posts.length, 0);
    await trackedForm.getByLabel('Return quantity for TRACKED (3 available)').fill('2');
    await trackedForm.getByRole('button').click();
    const receipt = page.getByRole('form', { name: 'Receive return' });
    await expect(receipt.getByRole('group', { name: 'TRACKED (2 returned)' })).toBeVisible();
    const { key, ...allocation } = posts[0].body;
    assert.match(key, /^[0-9a-f-]{36}$/);
    assert.deepEqual(allocation, {
      tracking: 'RETURN-TRACKED', evidence: 'HANDOFF-TRACKED', lines: [{ id: trackedId, quantity: 2 }],
    });
    await expect(createForms).toHaveCount(2);
    await expect(page.getByLabel('Return quantity for TRACKED (1 available)')).toBeVisible();

    await receipt.getByLabel('Verified warehouse receipt reference').fill('WAREHOUSE-TRACKED');
    await receipt.getByLabel('Sellable quantity').fill('1');
    await receipt.getByRole('button').click();
    await expect(page.getByRole('status')).toHaveText('Enter the warehouse receipt reference and classify all returned units as sellable or damaged.');
    await receipt.getByLabel('Damaged quantity').fill('1');
    await receipt.getByLabel('Sellable unit barcodes').fill('UNIT-001');
    await receipt.getByLabel('Damaged unit barcodes').fill('UNIT-001');
    await receipt.getByRole('button').click();
    await expect(page.getByRole('status')).toHaveText('Scan each tracked unit once in its matching sellable or damaged field.');
    assert.equal(posts.length, 1);
    await receipt.getByLabel('Damaged unit barcodes').fill('UNIT-002');
    await receipt.getByRole('button').click();
    await expect(page.getByText('TRACKED: 1 sellable, 1 damaged')).toBeVisible();
    await expect(receipt).toHaveCount(0);
    assert.deepEqual(posts[1], {
      id: 'return-outbound-tracked', action: 'receive',
      body: { evidence: 'WAREHOUSE-TRACKED', lines: [
        { id: trackedId, sellable: 1, damaged: 1, sellableBarcodes: ['UNIT-001'], damagedBarcodes: ['UNIT-002'] },
      ] },
    });

    const fifoForm = createForms.filter({ has: page.getByLabel('Return quantity for FIFO (1 available)') });
    await fifoForm.getByLabel('Return tracking number').fill('RETURN-FIFO');
    await fifoForm.getByLabel('Verified return handoff reference').fill('HANDOFF-FIFO');
    await fifoForm.getByLabel('Return quantity for FIFO (1 available)').fill('1');
    await fifoForm.getByRole('button').click();
    await expect(receipt.getByRole('group', { name: 'FIFO (1 returned)' })).toBeVisible();
    await expect(receipt.getByLabel(/unit barcodes/)).toHaveCount(0);
    await expect(receipt.getByLabel('Warehouse review reason')).toHaveCount(0);
    await receipt.getByLabel('Verified warehouse receipt reference').fill('WAREHOUSE-FIFO');
    await receipt.getByLabel('Damaged quantity').fill('1');
    await receipt.getByRole('button').click();
    await expect(page.getByText('FIFO: 0 sellable, 1 damaged')).toBeVisible();
    assert.deepEqual(posts[3], {
      id: 'return-outbound-fifo', action: 'receive',
      body: { evidence: 'WAREHOUSE-FIFO', lines: [{ id: fifoId, sellable: 0, damaged: 1 }] },
    });
    assert.deepEqual(errors, []);
  }));

test('requires warehouse review of the original lots for an older ambiguous return', () =>
  withFixture(async (page, url) => {
    const row = {
      _id: 'return-fifo-old', direction: 'return', state: 'dispatched', tracking: 'RETURN-OLD',
      lines: [{ id: fifoId, sku: 'FIFO', quantity: 2, tracked: false }],
      lotReview: [{ id: fifoId, sku: 'FIFO', quantity: 2, lots: [
        { id: 'lot-a', lotNumber: 'FIFO-A', available: 1, sellable: true, sellableAvailable: 1 },
        { id: 'lot-b', lotNumber: 'FIFO-B', available: 2, sellable: false, sellableAvailable: 0 },
        { id: 'lot-c', lotNumber: 'FIFO-C', available: 1, sellable: true, sellableAvailable: 1 },
      ] }],
    };
    const posts = [];
    await page.route('**/admin/api/v1/**', async route => {
      if (route.request().method() === 'POST') {
        assert.equal(new URL(route.request().url()).pathname, global + '/shipments/return-fifo-old/receive');
        const body = route.request().postDataJSON();
        posts.push(body);
        Object.assign(row, { state: 'returned', receivedAt: new Date().toISOString(), receiptLines: body.lines });
        delete row.lotReview;
        return route.fulfill({ json: { success: true, data: {} } });
      }
      const data = route.request().url().includes('/global/admin/')
        ? { shipments: [row], payments: [] } : { status: 'RETURN_REQUESTED' };
      return route.fulfill({ json: { success: true, data } });
    });
    await page.goto(url);
    await page.getByText('Shipment', { exact: true }).click();
    const receipt = page.getByRole('form', { name: 'Receive return' });
    const reason = receipt.getByLabel('Warehouse review reason');
    const lotA = receipt.getByRole('group', { name: 'Lot FIFO-A (1 available)' });
    const lotB = receipt.getByRole('group', { name: 'Lot FIFO-B (2 available)' });
    await receipt.getByLabel('Verified warehouse receipt reference').fill('RECEIPT-FIFO');
    await reason.fill(' ');
    await lotA.getByLabel('Sellable quantity').fill('1');
    await lotB.getByLabel('Damaged quantity').fill('1');
    await expect(lotB.getByLabel('Sellable quantity')).toHaveAttribute('max', '0');
    const button = receipt.getByRole('button', { name: 'Receive return' });
    const reviewError = 'Enter the warehouse review reason and assign all reviewed units within the available original lot quantities.';
    await button.click();
    await expect(page.getByRole('status')).toHaveText(reviewError);
    assert.equal(posts.length, 0);

    await reason.fill('Checked original packing records');
    await lotA.getByLabel('Damaged quantity').fill('1');
    await lotB.getByLabel('Damaged quantity').fill('0');
    await button.click();
    await expect(page.getByRole('status')).toHaveText(reviewError);
    assert.equal(posts.length, 0);

    await lotA.getByLabel('Damaged quantity').fill('0');
    await lotB.getByLabel('Damaged quantity').fill('1');
    await button.click();
    await expect(page.getByText('FIFO: 1 sellable, 1 damaged')).toBeVisible();
    await expect(receipt).toHaveCount(0);
    assert.deepEqual(posts, [{
      evidence: 'RECEIPT-FIFO',
      lotEvidence: 'Checked original packing records',
      lines: [{ id: fifoId, sellable: 1, damaged: 1, lots: [
        { id: 'lot-a', sellable: 1, damaged: 0 },
        { id: 'lot-b', sellable: 0, damaged: 1 },
      ] }],
    }]);
  }));
