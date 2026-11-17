import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { request } from '@playwright/test';

const require = createRequire(import.meta.url);

function fixtureEndpoint(value, label) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/admin' || url.search || url.hash || url.username || url.password) {
    throw new Error(label + ' must use a local fixture server mounted at /admin.');
  }
  return url.origin;
}

const source = fixtureEndpoint(process.env.GRIIP_ADMIN_ROUTE_SOURCE ?? 'http://127.0.0.1:4430/admin', 'Source');
const reference = fixtureEndpoint(process.env.GRIIP_ADMIN_ROUTE_REFERENCE ?? 'http://127.0.0.1:4431/admin', 'Reference');
const fixtureFile = process.env.GRIIP_ADMIN_ROUTE_FIXTURE;
if (!fixtureFile || !isAbsolute(fixtureFile)) throw new Error('Set GRIIP_ADMIN_ROUTE_FIXTURE to the isolated backend fixture module.');
const { login, ids } = require(fixtureFile);
if (!/^010000\d{5}$/.test(login?.phone_number)) throw new Error('A synthetic operator account is required.');

const manifest = (await readFile(new URL('../evidence/legacy-routes.txt', import.meta.url), 'utf8'))
  .split(/\r?\n/).filter(line => line.startsWith('/'));
if (manifest.length !== 102 || new Set(manifest).size !== 102) throw new Error('The production manifest must contain 102 route patterns.');

const reportIds = ['sales-summary', 'sales-by-product', 'order-status', 'pending-fulfilment', 'returns-rts', 'stock-valuation',
  'low-stock', 'stock-movements', 'inventory-aging', 'data-health'];
const fixtureIds = {
  '/dashboard/business-location/edit/[id]': String(ids.location),
  '/dashboard/order-details/[id]': String(ids.order),
  '/dashboard/orders/edit/[id]': String(ids.order),
  '/dashboard/password-change-customer/[id]': String(ids.customer),
  '/dashboard/product-details/[id]': String(ids.bdProduct),
  '/dashboard/product-faqs/[slug]': 'fixture-bd',
  '/dashboard/update-category/[slug]': 'fixture-category',
  '/dashboard/update-country/[id]': String(ids.country),
  '/dashboard/update-product/[slug]': 'fixture-bd',
  '/dashboard/update-role/[slug]': String(ids.adminRole),
  '/dashboard/update-staff/[slug]': String(ids.limitedStaff),
  '/dashboard/update-sub-category/[slug]': 'fixture-subcategory',
  ...JSON.parse(process.env.GRIIP_ADMIN_ROUTE_RECORDS ?? '{}'),
};

const cases = manifest.flatMap(pattern => {
  if (pattern.includes('[reportId]')) return reportIds.map(report => ({ pattern, path: pattern.replace('[reportId]', report) }));
  const marker = pattern.match(/\[(id|slug)\]/)?.[0];
  if (!marker) return [{ pattern, path: pattern }];
  const id = fixtureIds[pattern];
  if (id !== undefined && (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id))) throw new Error('Invalid fixture value for ' + pattern);
  return [{ pattern, path: pattern.replace(marker, id ?? (marker === '[id]' ? '0'.repeat(24) : 'missing-parity-record')), missingFixture: !id }];
});

const [editable, original] = await Promise.all([request.newContext({baseURL: source}), request.newContext({baseURL: reference})]);
const rows = [];
async function probe(client, path) {
  const response = await client.get('/admin' + (path === '/' ? '' : path), { maxRedirects: 0, timeout: 45_000 });
  const location = response.headers().location;
  const body = response.headers()['content-type']?.startsWith('text/html') ? await response.text() : '';
  const result = { status: response.status() };
  if (location) result.redirect = new URL(location, response.url()).pathname;
  if (/Access restricted|Your account does not have access to this view/.test(body)) result.restricted = true;
  if (/Data temporarily unavailable/.test(body)) result.unavailable = true;
  await response.dispose();
  return result;
}
let cursor = 0;
async function worker(referenceRequest) {
  while (cursor < cases.length) {
    const { pattern, path, missingFixture } = cases[cursor++];
    try {
      const [source, reference] = await Promise.all([probe(editable, path), probe(referenceRequest, path)]);
      rows.push({ pattern, path, ...(missingFixture ? { missingFixture } : {}), source, reference });
    } catch {
      rows.push({ pattern, path, ...(missingFixture ? { missingFixture } : {}), probeFailed: true });
    }
  }
}

try {
  const guestIndex = cases.findIndex(test => test.path === '/');
  if (guestIndex >= 0) {
    const guest = cases.splice(guestIndex, 1)[0];
    const [source, reference] = await Promise.all([probe(editable, guest.path), probe(original, guest.path)]);
    rows.push({ ...guest, source, reference });
  }
  const loggedIn = await editable.post('/admin/api/session', {
    timeout: 90_000, maxRedirects: 0, headers: { Origin: source }, form: { phone: login.phone_number, password: login.password },
  });
  if (loggedIn.status() !== 303 || !loggedIn.headers().location?.includes('/dashboard/overview')) throw new Error('The editable fixture login failed.');
  const originalLogin = await original.post('/admin/api/v1/user/admin/login', {
    timeout: 45_000, headers: { Origin: reference }, data: { phone_number: login.phone_number, password: login.password },
  });
  if (!originalLogin.ok()) throw new Error('The original fixture login failed.');
  const payload = await originalLogin.json();
  const token = payload.data?.access_token;
  if (typeof token !== 'string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new Error('No original fixture session was issued.');
  const originalState = await original.storageState();
  const referenceRequest = await request.newContext({ baseURL: reference, storageState: {
    ...originalState, cookies: [...originalState.cookies, { name: 'accessToken', value: token, domain: '127.0.0.1', path: '/admin',
      expires: -1, httpOnly: false, secure: false, sameSite: 'Strict' }],
  } });
  try {
    await Promise.all(Array.from({ length: 3 }, () => worker(referenceRequest)));
  } finally {
    await referenceRequest.dispose();
  }
} finally {
  await Promise.all([editable.dispose(), original.dispose()]);
}

rows.sort((a, b) => a.path.localeCompare(b.path));
const summary = {
  manifestPatterns: new Set(rows.map(row => row.pattern)).size,
  concreteRequests: rows.length,
  missingRecordFixtures: rows.filter(row => row.missingFixture).length,
  sourceDashboard200: rows.filter(row => row.path.startsWith('/dashboard/') && row.source?.status === 200 && !row.source.restricted && !row.source.unavailable).length,
  statusDifferences: rows.filter(row => row.source && row.source.status !== row.reference.status).length,
  failures: rows.filter(row => row.probeFailed || row.source?.unavailable || (row.source?.status ?? 0) >= 500).length,
};
console.log(JSON.stringify({ summary, routes: rows }, null, 2));
if (summary.failures) process.exitCode = 1;
