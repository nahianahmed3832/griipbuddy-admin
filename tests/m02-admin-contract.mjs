import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const bridgePath = '/api/internal/main-admin-catalog';
const ownerId = '100000000000000000000001';
const staffId = '100000000000000000000002';
const orderId = '200000000000000000000001';
const paymentId = '300000000000000000000001';
const countryId = '400000000000000000000001';
const roleId = '500000000000000000000001';
const owner = 'fixture.owner.session';
const staff = 'fixture.staff.session';
const guest = 'fixture.guest.session';
const alias = 'fixture.alias.session';
const sessions = new Map([
  [owner, { _id: ownerId, role: 'SUPER_ADMIN', permissions: ['manage-permissions', 'international.access',
    'product.view', 'order.view', 'order.update', 'cms.view', 'role.create', 'role.view', 'user.view'] }],
  [staff, { _id: staffId, role: 'Market staff', permissions: ['product.view', 'product.update', 'order.view'] }],
  [guest, { _id: staffId, role: 'GUEST', permissions: ['manage-permissions', 'product.view'] }],
  [alias, { _id: staffId, role: 'Super Admin', permissions: ['manage-permissions', 'product.view'] }],
]);

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
}

async function server(handler, port = 0) {
  const service = createServer(handler).listen(port, '127.0.0.1');
  await once(service, 'listening');
  return service;
}

function close(service) {
  return new Promise(resolve => {
    service.close(resolve);
    service.closeAllConnections();
  });
}

async function startAdmin(t, recoveryPort, bridgePort, catalogSecret, homepageSecret) {
  const probe = await server();
  const port = probe.address().port;
  await close(probe);
  const origin = 'http://127.0.0.1:' + port;
  const bridge = 'http://127.0.0.1:' + bridgePort + bridgePath;
  const app = spawn(process.execPath,
    [fileURLToPath(import.meta.resolve('next/dist/bin/next')), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: new URL('..', import.meta.url),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        NEXT_TELEMETRY_DISABLED: '1',
        GRIIP_ADMIN_TARGET: 'fixture',
        GRIIP_ADMIN_MANAGED: '1',
        GRIIP_ADMIN_FIXTURE_PORT: String(recoveryPort),
        GRIIP_ADMIN_FIXTURE_WRITES: '1',
        GRIIP_MAIN_ADMIN_CATALOG_URL: bridge,
        GRIIP_MAIN_ADMIN_CATALOG_SECRET: catalogSecret,
        GRIIP_MAIN_ADMIN_CATALOG_INTERNATIONAL_MARKET: 'us',
        GRIIP_MAIN_ADMIN_HOMEPAGE_ENABLED: '1',
        GRIIP_MAIN_ADMIN_HOMEPAGE_URL: bridge,
        GRIIP_MAIN_ADMIN_HOMEPAGE_SECRET: homepageSecret,
        GRIIP_MAIN_ADMIN_HOMEPAGE_INTERNATIONAL_MARKET: 'us',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  let output = '';
  for (const stream of [app.stdout, app.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-6000); });
  t.after(async () => {
    if (app.exitCode !== null || app.signalCode !== null) return;
    app.kill('SIGTERM');
    const timer = setTimeout(() => app.kill('SIGKILL'), 5000);
    try { await once(app, 'exit'); }
    finally { clearTimeout(timer); }
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null || app.signalCode !== null) break;
    try {
      const result = await fetch(origin + '/api/connected-catalog', { signal: AbortSignal.timeout(4000) });
      if (result.status === 400) return origin;
    } catch { /* Next is still starting. */ }
    await delay(300);
  }
  throw new Error('The isolated editable admin failed to start.\n' + output);
}

test('editable admin authorizes actual market, actor and operation before relaying', { timeout: 120_000 }, async t => {
  const forwarded = [];
  const signed = [];
  const catalogSecret = randomBytes(32).toString('hex');
  const homepageSecret = randomBytes(32).toString('hex');
  const recovery = await server((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    const staffRecord = sessions.get(token);
    if (!staffRecord) return json(response, 401, { success: false });
    const reply = data => json(response, 200, { success: true, data });
    if (path === '/api/v1/user') return reply({ ...staffRecord, status: 'ACTIVE', role_ref: roleId });
    forwarded.push({ path, method: request.method, scope: request.headers['x-griip-market'],
      currency: request.headers['x-griip-currency'], token });
    if (path === '/api/v1/country/' + countryId) return reply({ _id: countryId, code: 'US', currency: 'USD' });
    if (path === '/api/v1/country/all') return reply([{ code: 'BD', currency: 'BDT' }, { code: 'US', currency: 'USD' }]);
    if (path === '/api/v1/staff-access/roles') return reply({ id: roleId });
    if (path === '/api/v1/order/' + orderId) {
      return reply({ _id: orderId, managed_checkout: true, managed_payment_id: paymentId, region: 'INTERNATIONAL', currency: 'USD' });
    }
    if (path === '/api/v1/global/admin/orders/' + orderId) {
      return reply({ market: 'US', currency: 'USD', payments: [{ id: paymentId }], shipments: [] });
    }
    if (path === '/api/v1/global/admin/payments/' + paymentId) return reply({ payment: { id: paymentId, currency: 'USD' } });
    if (path === '/api/v1/global/admin/payments/' + paymentId + '/review') {
      if (request.headers['x-griip-market'] !== 'us' || request.headers['x-griip-currency'] !== 'USD') {
        return json(response, 409, { success: false });
      }
      return reply({ _id: paymentId, state: 'approved' });
    }
    if (path === '/api/v1/analytics/reports/sales-summary/export') {
      response.writeHead(200, { 'Content-Type': 'text/csv' });
      return response.end('amount,currency\n550,USD\n');
    }
    return json(response, 404, { success: false });
  }, randomInt(38_600, 38_980));
  t.after(() => close(recovery));
  const bridge = await server(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const channel = request.headers['x-griip-admin-channel'];
    const signature = createHmac('sha256', channel === 'homepage' ? homepageSecret : catalogSecret)
      .update('griip-main-admin-catalog-v1\n').update(raw).digest('hex');
    if (request.url !== bridgePath || request.headers['x-griip-catalog-signature'] !== signature) {
      return json(response, 401, { error: 'Signature denied' });
    }
    signed.push({ envelope: JSON.parse(raw), channel });
    json(response, 200, { data: { verified: true } });
  });
  t.after(() => close(bridge));
  const origin = await startAdmin(t, recovery.address().port, bridge.address().port, catalogSecret, homepageSecret);
  async function request(path, token, body, headers = {}) {
    return fetch(origin + path, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body && { 'Content-Type': 'application/json', Origin: origin }),
        ...(token && { Cookie: 'griip_admin_step8=' + token }), ...headers },
      ...(body && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(18_000),
    });
  }
  const catalog = '/api/connected-catalog';
  const operation = { read: 'products' };
  assert.equal((await request(catalog, undefined, { region: 'BD', request: operation }, {
    'X-Griip-Catalog-Signature': 'f'.repeat(64), Authorization: 'Bearer ' + owner,
  })).status, 401);
  assert.equal((await request(catalog, guest, { region: 'BD', request: operation })).status, 401);
  assert.equal((await request(catalog, staff, { region: 'BD', request: operation, legacyId: ownerId, central: true })).status, 400);
  assert.equal((await request(catalog, staff, { region: 'INTERNATIONAL', request: { read: 'orders' } })).status, 403);
  assert.equal((await request(catalog, staff, { region: 'BD', request: { read: 'products', offerMarketId: 'us' } })).status, 403);
  assert.equal((await request(catalog, staff, { region: 'BD', request: { action: 'offer.configure', input: { marketId: 'us' } } })).status, 409);
  assert.equal((await request(catalog, staff, { region: 'BD', request: { action: 'offer.configure',
    input: { marketId: 'bd', currency: 'USD' } } })).status, 422);
  assert.equal((await request(catalog, staff, { region: 'CA', request: operation })).status, 400);
  assert.equal(signed.length, 0);

  const allowed = await request(catalog, staff, { region: 'BD', request: operation });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { data: { verified: true } });
  assert.equal(signed[0].envelope.legacyId, staffId);
  assert.equal(signed[0].envelope.central, false);
  assert.equal(signed[0].envelope.marketId, 'bd');
  assert.equal((await request(catalog, alias, { region: 'BD', request: operation })).status, 200);
  assert.equal(signed.at(-1).envelope.central, false);
  assert.equal((await request(catalog, owner, { region: 'INTERNATIONAL', request: { read: 'homepage-scopes' } })).status, 200);
  assert.equal(signed.at(-1).envelope.marketId, 'us');
  assert.equal(signed.at(-1).envelope.legacyId, ownerId);
  assert.equal(signed.at(-1).envelope.central, true);
  assert.equal(signed.at(-1).channel, 'homepage');

  const download = '/api/download?id=sales-summary&format=csv';
  assert.equal((await request(download + '&region=US', owner)).status, 400);
  assert.equal((await request(download + '&region=BD&currency=USD', owner)).status, 400);
  assert.equal((await request(download + '&region=BD&region=INTERNATIONAL', owner)).status, 400);
  assert.equal((await request(download + '&region=INTERNATIONAL', staff)).status, 403);
  assert.equal(forwarded.filter(call => call.path.endsWith('/export')).length, 0);
  const file = await request(download + '&region=INTERNATIONAL&currency=USD', owner);
  assert.equal(file.status, 200);
  assert.equal(await file.text(), 'amount,currency\n550,USD\n');

  const roleAction = { action: 'role-create', values: { name: 'Synthetic agent', permissions: ['product.view'] } };
  assert.equal((await request('/api/staff-access', staff, roleAction)).status, 403);
  assert.equal((await request('/api/staff-access', owner, roleAction)).status, 200);
  assert.equal(forwarded.filter(call => call.path === '/api/v1/staff-access/roles').length, 1);

  const countryUpdate = { id: countryId, currency: 'BDT', isActive: true };
  assert.equal((await request('/api/market', owner, countryUpdate)).status, 422);
  assert.equal((await request('/api/market', owner, { ...countryUpdate, currency: 'USD' })).status, 200);
  assert.equal(forwarded.filter(call => call.path.endsWith('/' + countryId) && call.method === 'PATCH').length, 1);

  const payment = { action: 'payment-action', id: paymentId, step: 'review', values: { decision: 'approve' } };
  const managed = '/api/managed?order=' + orderId;
  assert.equal((await request(managed + '&market=BD', owner)).status, 409);
  assert.equal((await request(managed + '&market=US', owner)).status, 200);
  assert.equal((await request(managed, owner, { ...payment, market: 'BD' })).status, 409);
  assert.equal(forwarded.filter(call => call.path.endsWith('/review')).length, 0);
  const paid = await request(managed, owner, { ...payment, market: 'US' }, { 'X-Griip-Market': 'bd', 'X-Griip-Currency': 'BDT' });
  assert.equal(paid.status, 200);
  assert.deepEqual(await paid.json(), { id: paymentId, state: 'approved' });
  assert.equal(forwarded.at(-1).scope, 'us');
  assert.equal(forwarded.at(-1).currency, 'USD');
  assert.equal(forwarded.at(-1).token, owner);
  assert.equal((await request('/api/managed', owner, { ...payment, market: 'ZZ' })).status, 400);
  assert.equal((await request('/api/managed', owner, { ...payment, market: 'BD' })).status, 409);
  assert.equal((await request('/api/managed', owner, { ...payment, market: 'US' })).status, 200);
});
