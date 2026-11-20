import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createFraudProvider } from '../deploy/original-admin/fraud-provider.mjs';

const lookupPath = '/api/v1/fraud-checker/01000000002';

async function start(t, lookup) {
  const server = createFraudProvider(lookup).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return new URL(`http://127.0.0.1:${server.address().port}`);
}

test('preserves the original fraud response and each courier row', async t => {
  const payload = JSON.stringify({ data: {
    successRate: 85, statusTag: 'Safe', totalParcels: 20, totalDelivered: 17, totalCancel: 2,
    apis: [
      { courierKey: 'first', courierName: 'First courier', totalParcels: 12, totalOrders: 12, totalDelivered: 10, totalCancelled: 1 },
      { courierKey: 'second', courierName: 'Second courier', totalParcels: 8, totalOrders: 8, totalDelivered: 7, totalCancelled: 1, lastCourierSyncAt: '2026-11-15T00:00:00Z' },
    ],
  } });
  const origin = await start(t, (url, options) => {
    assert.equal(url.href, `https://efraudchecker.zephix.io${lookupPath}`);
    assert.equal(options.redirect, 'error');
    return new Response(payload, { status: 201 });
  });
  const response = await fetch(new URL(lookupPath, origin));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), payload);
});

test('rejects invalid requests and bounds large upstream responses', async t => {
  const lookup = t.mock.fn(() => new Response('x'.repeat(128 * 1024 + 1)));
  const origin = await start(t, lookup);
  const invalid = await fetch(new URL(`${lookupPath}?other=1`, origin));
  assert.equal(invalid.status, 404);
  assert.equal(lookup.mock.callCount(), 0);
  const large = await fetch(new URL(lookupPath, origin));
  assert.equal(large.status, 502);
  assert.equal(lookup.mock.callCount(), 1);
});
