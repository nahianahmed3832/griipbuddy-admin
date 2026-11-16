// Compare the preserved original admin and a candidate using isolated fixture accounts.
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, isAbsolute, resolve, sep } from 'node:path';

const require = createRequire(process.env.GRIIP_ADMIN_PARITY_PACKAGE ?? import.meta.url);
const { chromium, request } = require('@playwright/test');
const sharp = require('sharp');

const reportIds = [
  'sales-summary', 'sales-by-product', 'order-status', 'pending-fulfilment', 'returns-rts',
  'stock-valuation', 'low-stock', 'stock-movements', 'inventory-aging', 'data-health',
];
const fixtureId = number => number.toString(16).padStart(24, '0');
const knownRecords = {
  '/dashboard/business-location/edit/[id]': fixtureId(7),
  '/dashboard/order-details/[id]': fixtureId(10),
  '/dashboard/orders/edit/[id]': fixtureId(10),
  '/dashboard/password-change-customer/[id]': fixtureId(15),
  '/dashboard/product-details/[id]': fixtureId(3),
  '/dashboard/update-category/[slug]': 'fixture-category',
  '/dashboard/update-country/[id]': fixtureId(19),
  '/dashboard/update-product/[slug]': fixtureId(3),
  '/dashboard/update-role/[slug]': fixtureId(17),
  '/dashboard/update-staff/[slug]': fixtureId(14),
  '/dashboard/update-sub-category/[slug]': 'fixture-subcategory',
};
const defaultRoles = {
  owner: '01000000001', warehouse: '01000000004', finance: '01000000005',
  'customer-service': '01000000006',
};
const rolePaths = [
  '/dashboard/overview', '/dashboard/orders', '/dashboard/pre-orders', '/dashboard/products',
  '/dashboard/check-outlet-stocks', '/dashboard/barcodes', '/dashboard/expenses',
  '/dashboard/purchase/all', '/dashboard/staffs', '/dashboard/role',
  '/dashboard/reports/sales-summary', '/dashboard/reports/stock-valuation', '/dashboard/reports/order-status',
];
const actions = [
  {
    name: 'order tracking search', route: '/dashboard/orders',
    act: page => search(page, 'Order id, phone, tracking code', 'FIXTURE-TRACKING'),
  },
  {
    name: 'product SKU filter', route: '/dashboard/products',
    act: page => search(page, 'Search by sku', 'FIXTURE-BD'),
  },
  {
    name: 'barcode history lookup', route: '/dashboard/barcodes/logs',
    act: page => search(page, 'Scan or type barcode', 'FIXTURE-UNIT-01', () => page.getByRole('button', { name: 'Load', exact: true }).click()),
  },
  {
    name: 'sales summary CSV export', route: '/dashboard/reports/sales-summary',
    act: async page => {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout }),
        page.getByRole('button', { name: 'CSV', exact: true }).click(),
      ]);
      const filename = download.suggestedFilename();
      const csv = await readFile(await download.path());
      if (!filename.endsWith('.csv') || csv.length === 0) throw new Error('The original CSV export did not download.');
      return `${filename}:${createHash('sha256').update(normalizeReportCsv(csv)).digest('hex')}`;
    },
  },
  {
    name: 'international product scope', route: '/dashboard/products',
    act: async page => {
      await page.getByRole('combobox').first().click();
      await page.getByRole('option', { name: /International/ }).click();
      await page.getByText('Fixture international case', { exact: true }).first().waitFor();
      if (await page.getByText('Fixture domestic case', { exact: true }).first().isVisible()) {
        throw new Error('A Bangladesh product appeared in the international view.');
      }
    },
  },
  {
    name: 'sidebar toggle', route: '/dashboard/overview',
    act: page => page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).first().click(),
  },
  {
    name: 'sign out', route: '/dashboard/overview',
    act: async page => {
      await page.getByRole('button', { name: 'Logout', exact: true }).click();
      await page.getByRole('heading', { name: 'Login', exact: true }).waitFor();
    },
  },
];
const viewportFilter = process.env.GRIIP_ADMIN_PARITY_VIEWPORT;
const viewports = [
  { name: 'desktop', viewport: { width: 1440, height: 960 } },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
].filter(viewport => !viewportFilter || viewport.name === viewportFilter);
if (!viewports.length) throw new Error('The parity viewport must be desktop or mobile.');
const fixedTime = new Date(Math.floor(Date.now() / 60_000) * 60_000);
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const loginApi = /\/(?:api\/v1\/user\/admin\/login|api\/auth\/[^/]+|api\/session)$/;
const timeout = 30_000;
const staticMime = {
  '.css': 'text/css', '.js': 'application/javascript', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};

function environment(label) {
  const key = `GRIIP_ADMIN_PARITY_${label}_`;
  const url = new URL(process.env[key + 'URL'] ?? '');
  const mount = url.pathname.replace(/\/$/, '');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const dev = label === 'TARGET' && ['https://devadmin.griipbuddy.com', 'https://dev.griipbuddy.com'].includes(url.origin) && mount === '/admin';
  if ((!local && !dev) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${key}URL must be an isolated loopback origin or the protected dev /admin URL.`);
  }
  const username = process.env[key + 'HTTP_USER'];
  const basicPassword = process.env[key + 'HTTP_PASSWORD'];
  const assetDirectory = process.env[key + 'STATIC_DIR'];
  if (assetDirectory && !isAbsolute(assetDirectory)) throw new Error(`${key}STATIC_DIR must be absolute.`);
  const httpCredentials = username && basicPassword ? { username, password: basicPassword, origin: url.origin } : undefined;
  return { label, origin: url.origin, mount, httpCredentials, assetDirectory: assetDirectory && resolve(assetDirectory),
    urlFor: path => url.origin + mount + path };
}

const reference = environment('REFERENCE');
const target = environment('TARGET');
const pattern = process.env.GRIIP_ADMIN_PARITY_PATTERN ? new RegExp(process.env.GRIIP_ADMIN_PARITY_PATTERN) : null;
const shardSpec = process.env.GRIIP_ADMIN_PARITY_SHARD ?? '1/1';
if (!/^[1-8]\/[1-8]$/.test(shardSpec)) throw new Error('Set a parity shard as index/count, both between 1 and 8.');
const [shardIndex, shardCount] = shardSpec.split('/').map(Number);
if (shardIndex > shardCount) throw new Error('The parity shard index exceeds the count.');
const mountPattern = /^(?:\/[A-Za-z0-9_-]+)*$/;
if (![reference.mount, target.mount].every(mount => mountPattern.test(mount))) throw new Error('Invalid parity mount path.');

const records = { ...knownRecords, ...JSON.parse(process.env.GRIIP_ADMIN_PARITY_RECORDS ?? '{}') };
const roles = JSON.parse(process.env.GRIIP_ADMIN_PARITY_ROLES ?? JSON.stringify(defaultRoles));
const endpoints = [reference, target];
const manifest = (await readFile(new URL('../evidence/legacy-routes.txt', import.meta.url), 'utf8'))
  .split(/\r?\n/).filter(line => line.startsWith('/'));
if (manifest.length !== 102 || manifest.filter(path => path.startsWith('/dashboard/')).length !== 98) {
  throw new Error('The parity test requires the original 102-entry build manifest.');
}

function casesFor(route) {
  const make = (name, left, right = left) => ({ name, route, paths: [left, right] });
  if (route.includes('[reportId]')) return reportIds.map(id => make(route.replace('[reportId]', id), route.replace('[reportId]', id)));
  if (route.includes('[')) {
    const value = records[route];
    if (value === undefined) {
      const id = route.includes('[slug]') ? 'missing-parity-record' : fixtureId(0);
      return [{ ...make(route, route.replace(/\[[^\]]+\]/, id)), missingFixture: true }];
    }
    const values = Array.isArray(value) ? value : [value];
    return values.map((record, index) => {
      const ids = typeof record === 'string' ? [record, record] : [record.reference, record.target];
      if (!ids.every(id => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id))) throw new Error(`Invalid fixture ID for ${route}`);
      return { ...make(`${route} fixture ${index + 1}`, ...ids.map(id => route.replace(/\[[^\]]+\]/, id))), ids };
    });
  }
  if (route === '/dashboard/overview') {
    return [make(route, route), make(`${route}?view=classic`, `${route}?view=classic`)];
  }
  return [make(route, route)];
}

const cases = manifest.flatMap(casesFor)
  .filter((test, index) => index % shardCount === shardIndex - 1 && (!pattern || pattern.test(test.name)));
if (!cases.length || !roles.owner) throw new Error('The parity test needs matching routes and a synthetic owner role.');
const dashboard = cases.filter(test => test.route.startsWith('/dashboard/'));
const guestScreens = cases.filter(test => ['/', '/_not-found'].includes(test.route));
const responses = cases.filter(test => ['/api/fraud-check', '/favicon.ico'].includes(test.route));
const different = [];
const missing = dashboard.filter(test => test.missingFixture).map(test => test.route);
const assetChecks = new Map();
const localAssets = new Map();

function localAsset(endpoint, pathname) {
  const prefix = `${endpoint.mount}/_next/static/`;
  if (!endpoint.assetDirectory || !pathname.startsWith(prefix)) return null;
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return null;
  }
  const file = resolve(endpoint.assetDirectory, relative);
  const mimeType = staticMime[extname(file)];
  if (!mimeType || !file.startsWith(`${endpoint.assetDirectory}${sep}`)) return null;
  if (!localAssets.has(file)) {
    localAssets.set(file, readFile(file).then(body => ({
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: mimeType }, { name: 'Cache-Control', value: 'private, max-age=600' }],
      body: body.toString('base64'),
    })).catch(() => null));
  }
  return localAssets.get(file);
}

async function sessions(browser, viewport) {
  return Promise.all(endpoints.map(async endpoint => {
    const context = await browser.newContext({
      viewport: viewport.viewport, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch,
      timezoneId: 'Asia/Dhaka', locale: 'en-US', reducedMotion: 'reduce',
      serviceWorkers: 'block', httpCredentials: endpoint.httpCredentials,
    });
    let signingIn = false;
    const blocked = new Set();
    const page = await context.newPage();
    // Guard API calls without replacing ordinary browser loading and caching of the preserved assets.
    const protocol = await context.newCDPSession(page);
    const patterns = [{ urlPattern: '*/api/*', requestStage: 'Request' }];
    if (endpoint.assetDirectory) patterns.push({ urlPattern: `${endpoint.urlFor('/_next/static/')}*`, requestStage: 'Request' });
    await protocol.send('Fetch.enable', { patterns });
    protocol.on('Fetch.requestPaused', async ({ request, requestId }) => {
      const { method } = request;
      const url = new URL(request.url);
      const sameOrigin = endpoint.origin === url.origin;
      const login = signingIn && method === 'POST' && loginApi.test(url.pathname);
      if (sameOrigin && (safeMethods.has(method) || login)) {
        const fixture = method === 'GET' ? await localAsset(endpoint, url.pathname) : null;
        if (fixture) await protocol.send('Fetch.fulfillRequest', { requestId, ...fixture }).catch(() => {});
        else await protocol.send('Fetch.continueRequest', { requestId }).catch(() => {});
        return;
      }
      blocked.add(sameOrigin ? `${method} ${url.pathname}` : `API request to ${url.origin}`);
      void protocol.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    });
    const api = new Set();
    const documentOf = new WeakMap();
    let navigation = 0;
    let document = 0;
    page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigation++;
      documentOf.set(request, document);
    });
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame() && document !== navigation) {
        document = navigation;
        api.clear();
      }
    });
    page.on('response', response => {
      if (documentOf.get(response.request()) !== document) return;
      const url = new URL(response.url());
      const path = relativePath(url, endpoint).split('?')[0];
      if (url.origin === endpoint.origin && path.startsWith('/api/v1/')) {
        const status = response.status() === 304 ? 200 : response.status();
        api.add(`${response.request().method()} ${path} (${status})`);
      }
    });
    await page.clock.setFixedTime(fixedTime);
    page.setDefaultTimeout(timeout);
    return { endpoint, context, page, api, blocked, signedIn: false, documentId: () => document,
      current: request => documentOf.get(request) === document,
      setSigningIn: enabled => { signingIn = enabled; } };
  }));
}

async function go(session, path) {
  const formerDocument = session.documentId();
  const profile = session.signedIn && path.startsWith('/dashboard/') ? session.page.waitForResponse(response => {
    const url = new URL(response.url());
    return session.documentId() !== formerDocument && session.current(response.request()) && url.origin === session.endpoint.origin &&
      relativePath(url, session.endpoint).split('?')[0] === '/api/v1/user';
  }, { timeout }).catch(() => null) : null;
  const response = await session.page.goto(session.endpoint.urlFor(path), { waitUntil: 'domcontentloaded', timeout });
  if (!response) throw new Error('Navigation returned no response.');
  if (profile) {
    const verified = await profile;
    if (!verified?.ok() && verified?.status() !== 304) {
      await settled(session.page).catch(() => {});
      throw new Error(`Profile request on ${session.endpoint.label} ${verified ? `returned HTTP ${verified.status()}` : 'timed out'}.`);
    }
  }
  await settled(session.page);
  return response;
}

async function settled(page) {
  await page.waitForLoadState('load', { timeout });
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
}

async function search(page, label, value, submit) {
  const results = page.waitForResponse(response => response.request().method() === 'GET' &&
    response.url().includes('/api/v1/') && response.url().includes(value), { timeout });
  const action = async () => {
    await page.getByPlaceholder(label, { exact: true }).fill(value);
    if (submit) await submit();
  };
  const [response] = await Promise.all([results, action()]);
  if (!response.ok()) throw new Error('The original search request did not succeed.');
  await response.finished();
}

function normalizeReportCsv(csv) {
  const generated = /^Generated,\d{4}-\d{2}-\d{2} \d{2}:\d{2}( \([^)]+\))$/m;
  const text = csv.toString('utf8');
  if (!generated.test(text)) throw new Error('The original export lacks its Generated timestamp.');
  return text.replace(generated, 'Generated,<timestamp>$1');
}

async function waitForOriginalControls(page, route, ids) {
  if (route === '/dashboard/update-product/[slug]' && ids) {
    await page.getByText('Product Name', { exact: true }).first().waitFor();
  }
  if (route === '/dashboard/reports') {
    await page.getByRole('heading', { name: /^Sales summary$/i }).first().waitFor();
  }
}

async function signIn(session, role) {
  const { page, endpoint } = session;
  const root = endpoint.mount === '/admin' ? '/sign-in' : '/';
  if (page.url() === endpoint.urlFor(root)) await settled(page);
  else await go(session, root);
  const user = roles[role];
  const phone = typeof user === 'string' ? user : user[endpoint.label.toLowerCase()];
  if (!/^010000\d{5}$/.test(phone)) throw new Error(`Expected a synthetic number for ${role}.`);
  const password = (typeof user === 'object' && process.env[user[`${endpoint.label.toLowerCase()}PasswordEnv`]]) ||
    process.env[`GRIIP_ADMIN_PARITY_${endpoint.label}_PASSWORD`] || 'fixture-only-password';
  const form = page.locator('form').filter({ has: page.locator('input[type="password"]') });
  const field = form.locator('input:not([type="hidden"]):not([type="password"])').first();
  await field.fill(phone);
  await form.locator('input[type="password"]').fill(password);
  session.setSigningIn(true);
  try {
    const [response] = await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST' && loginApi.test(new URL(response.url()).pathname), { timeout }),
      form.getByRole('button', { name: /sign\s*in|log\s*in|continue|submit/i }).first().click(),
    ]);
    if (!response.ok()) throw new Error(`Sign-in returned HTTP ${response.status()}.`);
    await page.waitForURL(url => url.origin === endpoint.origin && /\/dashboard(?:\/|$)/.test(url.pathname),
      { waitUntil: 'domcontentloaded', timeout });
    await settled(page);
    session.signedIn = true;
  } finally {
    session.setSigningIn(false);
  }
}

function normalize(text, endpoint) {
  return text.replaceAll(endpoint.origin, '').replaceAll(`${endpoint.mount}/_next/`, '/_next/')
    .replaceAll(`${endpoint.mount}/dashboard/`, '/dashboard/').replace(/\s+/g, ' ').trim();
}

function accessibilityDifference(first, second) {
  const a = first.split(' - ');
  const b = second.split(' - ');
  const index = a.findIndex((entry, index) => entry !== b[index]);
  const indexOrEnd = index < 0 ? a.length : index;
  const control = entry => entry?.replace(/\b(?:\d{4,}|[\da-f]{24})\b/gi, '[fixture]')
    .replace(/\b[\w-]+\.[\w-]+\.[\w-]+\b/g, '[token]').slice(0, 120);
  return { index: indexOrEnd, reference: control(a[indexOrEnd]), target: control(b[indexOrEnd]) };
}

function relativePath(url, endpoint) {
  const { pathname, search } = url;
  const { mount } = endpoint;
  if (mount && (pathname === mount || pathname.startsWith(`${mount}/`))) {
    const path = pathname.slice(mount.length);
    return (!path || path === '/sign-in' ? '/' : path) + search;
  }
  return pathname + search;
}

async function snapshot(session, screenshot, documentResponse) {
  const { page, endpoint } = session;
  const title = await page.title();
  const body = normalize(await page.locator('body').ariaSnapshot(), endpoint);
  const html = await documentResponse.text();
  const assets = [...html.matchAll(/(?:href|src)="([^"]*\/_next\/static\/[^"?]+\.(?:css|js|woff2))(?:\?[^" ]*)?"/g)]
    .map(([, path]) => new URL(path, endpoint.origin).pathname);
  const byName = new Map(assets.map(path => [path.slice(path.indexOf('/_next/static/')), path]));
  const paths = [...byName.keys()].sort().map(name => ({ name, path: byName.get(name) }));
  const route = relativePath(new URL(page.url()), endpoint);
  if (screenshot) await page.mouse.move(0, 0);
  const image = screenshot ? await page.screenshot({ animations: 'disabled', caret: 'hide' }) : null;
  const api = [...session.api].sort();
  return { title, body, paths, route, image, api };
}

function fingerprint(session, asset) {
  const url = session.endpoint.origin + asset.path;
  function hash(body) {
    if (asset.name.endsWith('.css') && session.endpoint.mount) {
      body = body.toString('utf8').replaceAll(`${session.endpoint.mount}/_next/`, '/_next/');
    }
    return createHash('sha256').update(body).digest('hex');
  }
  if (!assetChecks.has(url)) {
    assetChecks.set(url, (async () => {
      const response = await session.endpoint.assets.get(url, { maxRedirects: 0, timeout });
      if (response.status() !== 200) return `HTTP ${response.status()}`;
      return hash(await response.body());
    })());
  }
  return assetChecks.get(url);
}

async function diffPixels(left, right) {
  if (left.equals(right)) return 0;
  const [a, b] = await Promise.all([left, right].map(image => sharp(image).ensureAlpha().raw().toBuffer()));
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let count = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a.readUInt32LE(i) !== b.readUInt32LE(i)) count++;
  }
  return count;
}

async function compareScreens(pair, test, label, screenshot) {
  const prefix = `${label} ${test.name}`;
  try {
    const results = await Promise.all(pair.map(async (session, index) => {
      const response = await go(session, test.paths[index]);
      if (label.startsWith('owner')) await waitForOriginalControls(session.page, test.route, test.ids);
      let interaction;
      if (test.act) {
        interaction = await test.act(session.page);
        await settled(session.page);
      }
      return { ...await snapshot(session, screenshot, response), status: response.status(), interaction };
    }));
    const [a, b] = results;
    const issues = [];
    if (a.status !== b.status || a.status >= 500 || b.status >= 500) issues.push(`HTTP ${a.status}/${b.status}`);
    if (a.interaction !== b.interaction) issues.push('interaction output differs');
    if (test.ids && results.some((result, index) => {
      return result.status === 404 || result.api.some(request => {
        const [, path, status] = request.split(' ');
        return path.split('/').includes(test.ids[index]) && ['(400)', '(404)', '(410)'].includes(status);
      }) || /heading "(?:[^"\n]*(?:not found|does not exist))"/i.test(result.body);
    })) issues.push('fixture record did not load');
    for (const key of ['title', 'body']) if (a[key] !== b[key]) issues.push(`${key} differs`);
    if (a.body !== b.body && process.env.GRIIP_ADMIN_PARITY_PROGRESS === 'structure') {
      console.log(`${prefix} accessibility difference`, accessibilityDifference(a.body, b.body));
    }
    if (a.route !== b.route) issues.push(`route differs (${a.route.split('?')[0]}/${b.route.split('?')[0]})`);
    if (!test.act && test.route.startsWith('/dashboard/') && !a.route.startsWith('/dashboard/') && label.startsWith('owner')) {
      issues.push('owner did not reach the original dashboard');
    }
    const names = result => result.paths.map(asset => asset.name);
    if (JSON.stringify(names(a)) !== JSON.stringify(names(b))) {
      const left = names(a).filter(path => !names(b).includes(path));
      const right = names(b).filter(path => !names(a).includes(path));
      issues.push(`original static asset names differ (${left.length} reference-only, ${right.length} target-only)`);
    }
    if (JSON.stringify(a.api) !== JSON.stringify(b.api)) {
      const failures = result => result.api.filter(request => /\([45]\d\d\)$/.test(request)).length;
      issues.push(`original API requests or outcomes differ (${failures(a)} reference errors, ${failures(b)} target errors)`);
      if (process.env.GRIIP_ADMIN_PARITY_PROGRESS === 'api') {
        const sanitize = request => request.replace(/\b[\da-f]{24}\b/gi, '[record]').replace(/\b[\w-]+\.[\w-]+\.[\w-]+\b/g, '[token]');
        const only = (left, right) => left.api.filter(request => !right.api.includes(request)).map(sanitize);
        console.log(`${prefix} API difference`, { reference: only(a, b), target: only(b, a) });
      }
    }
    if (screenshot) {
      const styledAssets = result => result.paths.filter(asset => /\.(css|woff2)$/.test(asset.name));
      const designs = await Promise.all(results.map((result, index) => Promise.all(styledAssets(result)
        .map(async asset => [asset.name, await fingerprint(pair[index], asset)]))));
      if (JSON.stringify(designs[0]) !== JSON.stringify(designs[1]) || designs.flat().some(([, hash]) => hash.startsWith('HTTP'))) {
        issues.push('original CSS or font bytes differ');
      }
    }
    if (screenshot) {
      const pixels = await diffPixels(a.image, b.image);
      if (pixels) issues.push(`${pixels} viewport pixels differ`);
    }
    if (issues.length) different.push(`${prefix}: ${issues.join(', ')}`);
    if (process.env.GRIIP_ADMIN_PARITY_PROGRESS) console.log(`${prefix}: ${issues.length ? issues.join(', ') : 'matched'}`);
  } catch (error) {
    const problem = /^(Profile request |Sign-in returned )/.test(error.message) ? error.message : `${error.name} during navigation or capture`;
    different.push(`${prefix}: ${problem}`);
    if (process.env.GRIIP_ADMIN_PARITY_PROGRESS) console.log(`${prefix}: ${problem}`);
  }
}

async function restoreSessions(pair, role, label) {
  await Promise.all(pair.map(async session => {
    const cookies = await session.context.cookies(session.endpoint.urlFor('/dashboard/overview'));
    if (session.signedIn && !cookies.some(cookie => cookie.name === 'accessToken')) {
      different.push(`${label} ${session.endpoint.label}: unexpectedly lost the staff session.`);
      await signIn(session, role);
    }
  }));
}

function sameBytes(a, b) {
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

async function compareResponses(pair) {
  for (const test of responses) {
    const results = await Promise.all(pair.map(async session => {
      const response = await session.context.request.get(session.endpoint.urlFor(test.route), { maxRedirects: 0, timeout });
      return { status: response.status(), type: response.headers()['content-type']?.split(';', 1)[0], body: await response.body() };
    }));
    const [a, b] = results;
    if (a.status !== b.status || b.status >= 500 || a.type !== b.type || !sameBytes(a.body, b.body)) {
      different.push(`${test.route}: support response differs (${a.status}/${b.status})`);
    }
  }
}

async function withPair(browser, viewport, label, verify) {
  const pair = await sessions(browser, viewport);
  try {
    await verify(pair);
  } catch (error) {
    const problem = /^(Profile request |Sign-in returned )/.test(error.message) ? error.message : `${error.name} building or using comparison session`;
    different.push(`${label}: ${problem}`);
    if (process.env.GRIIP_ADMIN_PARITY_PROGRESS) console.log(`${label}: ${problem}`);
  } finally {
    for (const { endpoint, context, blocked } of pair) {
      if (blocked.size) different.push(`${label} ${endpoint.label} blocked requests: ${[...blocked].sort().join(', ')}`);
      await context.close();
    }
  }
}

const allowedHosts = Array.from(new Set(endpoints.map(endpoint => new URL(endpoint.origin).hostname)));
const hostRules = ['MAP * ~NOTFOUND', ...allowedHosts.map(host => `EXCLUDE ${host}`)].join(', ');
const browser = await chromium.launch({
  args: [`--host-resolver-rules=${hostRules}`], executablePath: process.env.GRIIP_ADMIN_PARITY_CHROMIUM || undefined,
});
try {
  for (const endpoint of endpoints) endpoint.assets = await request.newContext({ httpCredentials: endpoint.httpCredentials });
  // Run viewports in order so the SSH fixture and its API checks share fewer connections.
  for (const viewport of viewports) await withPair(browser, viewport, `owner ${viewport.name}`, async pair => {
    for (const test of guestScreens) await compareScreens(pair, test, `guest ${viewport.name}`, true);
    if (dashboard.length) {
      await Promise.all(pair.map(async session => {
        await go(session, '/dashboard/overview');
        const route = relativePath(new URL(session.page.url()), session.endpoint);
        if (route !== '/' || !await session.page.getByRole('heading', { name: 'Login' }).isVisible()) {
          different.push(`${session.endpoint.label}: anonymous dashboard did not return to the original sign-in screen`);
        }
      }));
      await Promise.all(pair.map(session => signIn(session, 'owner')));
      for (const test of dashboard) {
        await restoreSessions(pair, 'owner', `owner ${viewport.name}`);
        await compareScreens(pair, test, `owner ${viewport.name}`, true);
      }
    }
    if (viewport.name === 'desktop') {
      await compareResponses(pair);
      if (dashboard.length && shardIndex === 1) for (const { route, name, act } of actions) {
        if (pattern && !pattern.test(route)) continue;
        await compareScreens(pair, { name, route, act, paths: [route, route] }, 'owner interaction', true);
      }
    }
  });

  for (const role of Object.keys(roles).filter(role => role !== 'owner' && shardIndex === 1)) {
    const selected = rolePaths.filter(route => !pattern || pattern.test(route));
    if (!selected.length) continue;
    await withPair(browser, viewports[0], role, async pair => {
      await Promise.all(pair.map(session => signIn(session, role)));
      for (const route of selected) await compareScreens(pair, { name: route, route, paths: [route, route] }, role, false);
    });
  }
} finally {
  await browser.close();
  for (const endpoint of endpoints) await endpoint.assets?.dispose();
}

console.log(`${cases.length} original URL cases selected from ${manifest.length} manifest entries.`);
for (const issue of different) console.error(issue);
if (shardCount > 1) console.log(`Shard ${shardSpec}. Run each shard to cover the manifest.`);
if (pattern) console.log('The route pattern limited this run.');
if (viewportFilter) console.log(`This run checked only the ${viewportFilter} viewport.`);
if (endpoints.some(endpoint => endpoint.assetDirectory)) {
  console.log('Browser static assets used the captured running builds. Declared assets, CSS and fonts were also checked over HTTP.');
}
if (missing.length) {
  console.log(`These record screens were checked with a missing record. Seed valid records and set GRIIP_ADMIN_PARITY_RECORDS: ${missing.join(', ')}`);
}
console.log('This check compares routes, asset identities and screenshots. Submitted forms and provider side effects require separate fixture acceptance.');
if (different.length || (!pattern && missing.length)) process.exitCode = 1;
