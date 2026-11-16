import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const staging = process.env.GRIIP_PILOT_HOSTINGER === '1';
function ssh(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
      '-o', 'ConnectTimeout=8', 'root@72.60.107.88', ...args], { timeout: 18_000 });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.stdin.on('error', reject);
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `Hostinger command exited with ${code}`)));
    child.stdin.end(input);
  });
}
const store = staging ? 'https://dev.griipbuddy.com/pilot-shop' : 'http://127.0.0.1:3103';
const storeOrigin = new URL(store).origin;
const admin = staging ? 'https://dev.griipbuddy.com/pilot-operations' : 'http://127.0.0.1:4319/operations-preview';
const desk = admin + '/desk/operations';
const adminApi = admin + '/api/operations';
const api = 'http://127.0.0.1:38185';
const output = process.env.GRIIP_PILOT_EVIDENCE;
const password = process.env.GRIIP_PILOT_PASSWORD;
const credentials = staging ? JSON.parse(await readFile(process.env.GRIIP_PILOT_CREDENTIALS, 'utf8')) : null;
if (staging) {
  for (const role of ['owner', 'pack', 'support']) assert.match(credentials[role], /^[a-f0-9]{48}$/);
  assert.match(credentials.shopPassword, /^[a-f0-9]{64}$/);
  assert.match(credentials.revision, /^[a-f0-9]{40}$/);
} else assert.match(password ?? '', /^[a-f0-9]{48}$/);
const basic = staging ? { username: 'reviewer', password: credentials.shopPassword, origin: storeOrigin } : undefined;
const checkoutHeaders = { Origin: storeOrigin, ...(basic && { Authorization: 'Basic ' +
  Buffer.from(basic.username + ':' + basic.password).toString('base64') }) };
assert.ok(output && process.env.GRIIP_BRAVE_EXECUTABLE);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.GRIIP_BRAVE_EXECUTABLE, headless: true });
const variant = '00000000000000000000f102';
const supplier = '00000000000000000000f103';
const sku = 'OPS-TEST-RECEIVE-BLACK';
const eventAt = () => new Date().toISOString();
const button = (page, name) => page.getByRole('button', { name, exact: true });
const heading = (page, name) => page.getByRole('heading', { name, exact: true });
const shot = (page, name) => page.screenshot({ path: join(output, name + '.png'), animations: 'disabled' });
const statusSteps = [];
let purchase, orderA, orderB;

async function insidePilot(path, body, { token, status, method, guest }) {
  const reader = `let raw = "";
process.stdin.setEncoding("utf8").on("data", chunk => raw += chunk).on("end", async () => {
  const { path, init } = JSON.parse(raw);
  if (process.env.GRIIP_HOSTINGER_PILOT !== "1" || !/^[-a-z0-9/?=&%]+$/i.test(path)) throw new Error("Invalid pilot target or route");
  const response = await fetch("http://127.0.0.1:38100/api/v1/" + path, init);
  console.log(JSON.stringify({ status: response.status, data: await response.json() }));
});`;
  const input = JSON.stringify({ path, init: { method, headers: { ...(token && { authorization: 'Bearer ' + token }),
    ...(guest && { 'x-cart-token': guest }), ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body) } });
  const stdout = await ssh(['docker', 'exec', '-i', 'griipbuddy-pilot-stage-api-1', 'node', '-e', "'" + reader + "'"], input);
  const { status: code, data: result } = JSON.parse(stdout);
  if (status) assert.equal(code, status, path + ' ' + result.message);
  else assert.ok(code < 300 && result.success === true, path + ' ' + result.message);
  return result.data;
}

async function request(path, body, options = {}) {
  const { token, status, method = body === undefined ? 'GET' : 'POST', trial = false, guest } = options;
  if (staging && trial) {
    if (path === 'pause') {
      const mode = body.paused ? 'paused' : 'open';
      const script = '/opt/griipbuddy-pilot-stage/releases/' + credentials.revision + '/backend/recovery/hostinger/pilot-intake.sh';
      const stdout = await ssh(['bash', script, mode]);
      assert.ok(stdout.startsWith(mode + ' '), stdout);
      return body;
    }
    assert.equal(path, 'evidence');
    for (const id of [body.purchase, ...body.orders].filter(Boolean)) assert.match(id, /^[a-f0-9]{24}$/);
    const stdout = await ssh(['docker', 'exec', 'griipbuddy-pilot-stage-api-1', 'node',
      'recovery/hostinger/pilot-stage.cjs', 'readback', body.purchase ?? '-', ...body.orders]);
    return JSON.parse(stdout);
  }
  if (staging) return insidePilot(path, body, { token, status, method, guest });
  const response = await fetch(api + (trial ? '/pilot/' : '/api/v1/') + path, {
    method, headers: { ...(token && { authorization: 'Bearer ' + token }), ...(trial && { 'x-pilot-key': password }),
      ...(guest && { 'x-cart-token': guest }), ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  if (status) assert.equal(response.status, status, path + ' ' + result.message);
  else assert.ok(response.ok && (trial || result.success === true), path + ' ' + result.message);
  return trial ? result : result.data;
}

const phones = { owner: '01000000001', pack: '01000000011', support: '01000000012' };

async function token(role) {
  return (await request('user/admin/login', { phone_number: phones[role], password: credentials?.[role] ?? password })).access_token;
}

async function checkpoint(name, sellable, onHand, reserved) {
  const row = await request('evidence', { purchase, orders: [orderA?.id, orderB?.id].filter(Boolean) }, { trial: true });
  assert.deepEqual([row.position.sellable, row.position.onHand, row.position.reserved], [sellable, onHand, reserved], name);
  statusSteps.push({ name, ...row.position });
  return row;
}

async function staff(role, mobile = false) {
  const page = await (await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
    ...(mobile && { isMobile: true, hasTouch: true }) })).newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(admin + '/sign-in');
  await page.getByLabel('Staff email or phone number').fill(phones[role]);
  await page.getByLabel('Password', { exact: true }).fill(credentials?.[role] ?? password);
  await button(page, 'Sign in').click();
  await page.waitForURL(url => url.href.startsWith(admin + '/desk/'), { waitUntil: 'domcontentloaded' });
  return page;
}

async function action(page, name, path) {
  const response = page.waitForResponse(value => value.url().startsWith(adminApi + path) && value.request().method() === 'POST');
  await button(page, name).click();
  const saved = await response;
  const body = await saved.json();
  assert.equal(saved.status(), 200, body.message);
  return { value: body.data, body: saved.request().postDataJSON() };
}

async function storefrontCheckout(page, quantity, review = true) {
  await page.goto(store + '/search?q=Pilot%20camera%20cover');
  await page.getByRole('link', { name: /Pilot camera cover/i }).first().click();
  await expect(heading(page, 'Pilot camera cover')).toBeVisible();
  await expect(page.locator('.product-options')).toContainText('Black');
  for (let unit = 1; unit < quantity; unit++) await button(page, 'Increase quantity').click();
  await button(page, 'Add to cart').click();
  await page.getByRole('link', { name: 'View cart', exact: true }).click();
  await page.getByRole('link', { name: 'Guest checkout', exact: true }).click();
  await page.getByRole('textbox', { name: 'Full name' }).fill('Synthetic Pilot Shopper');
  await page.getByRole('textbox', { name: 'Phone number' }).fill('01700000000');
  await page.getByRole('textbox', { name: 'Email (optional)' }).fill('pilot@example.test');
  await page.getByRole('combobox', { name: 'District' }).selectOption('dhaka');
  await page.getByRole('textbox', { name: 'Area / Upazila' }).fill('Dhanmondi');
  await page.getByRole('textbox', { name: 'Street address' }).fill('10 Synthetic Test Road');
  await page.getByRole('textbox', { name: 'Postal code (optional)' }).fill('1209');
  if (!review) return;
  await button(page, 'Review order').click();
  await expect(heading(page, 'Review your order')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('region', { name: 'Order summary' })).toContainText(quantity === 2 ? '৳1,100' : '৳600');
}

async function place(page) {
  const response = page.waitForResponse(value => value.url() === store + '/api/checkout' &&
    value.request().postDataJSON()?.action === 'submit');
  await button(page, 'Place COD order').click();
  const saved = await response;
  const result = await saved.json();
  assert.equal(result.kind, 'placed', result.message);
  await page.waitForURL(store + '/orders/' + result.orderId);
  await expect(heading(page, 'Order confirmed')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Payment and status' })).toContainText('Awaiting collection');
  const reference = await page.locator('.commerce-intro strong').innerText();
  const replay = await page.request.post(store + '/api/checkout', { headers: checkoutHeaders, data: saved.request().postDataJSON() });
  assert.deepEqual(await replay.json(), result);
  await page.reload();
  assert.equal(await page.locator('.commerce-intro strong').innerText(), reference);
  return { reference, url: page.url(), payload: saved.request().postDataJSON(), browserOrder: result.orderId };
}

const copy = {};
let guestConfirmed = false;
try {
  const statePath = staging && process.env.GRIIP_PILOT_BROWSER_STATE;
  if (staging) {
    const visitor = await (await browser.newContext()).newPage();
    assert.equal((await visitor.request.get(store + '/api/health')).status(), 401);
    await visitor.goto(desk);
    await visitor.waitForURL(admin + '/sign-in');
    const app = await (await browser.newContext({ httpCredentials: basic })).newPage();
    const health = await app.goto(store + '/api/health');
    assert.equal(health.status(), 200);
    assert.equal((await health.json()).revision, credentials.revision);
    assert.match(await health.headerValue('x-robots-tag'), /noindex/);
    await visitor.context().close();
    await app.context().close();
    console.log('PASS Hostinger revision, existing preview authentication and anonymous staff redirect');
  }
  const owner = await staff('owner');
  const packer = await staff('pack', true);
  const support = await staff('support');
  const ownerToken = await token('owner');
  const supportToken = await token('support');
  const packToken = await token('pack');
  const ownerAuth = { token: ownerToken };
  const reuseReceipt = staging && process.env.GRIIP_PILOT_RECEIPT_CHECKPOINT === '1';
  assert.ok(!reuseReceipt || statePath);
  const previous = reuseReceipt ? JSON.parse(await readFile(join(output, 'checkpoints.json'), 'utf8')) : null;
  const savedBrowser = previous?.orderA ? JSON.parse(await readFile(statePath, 'utf8')) : null;
  let readBefore;
  let receiptBody;
  if (reuseReceipt) {
    assert.match(previous.purchase, /^[a-f0-9]{24}$/);
    assert.deepEqual(previous.statusSteps.slice(0, 2).map(row => row.name), ['zero stock', 'receipt and duplicate']);
    purchase = previous.purchase;
    statusSteps.push(previous.statusSteps[0]);
    console.log('PASS prior Brave purchase and receipt readback retained for this release');
  } else {
    readBefore = await checkpoint('zero stock', 0, 0, 0);
    await owner.goto(desk + '/purchases/new?region=BD');
    await owner.locator('select[name="supplier"]').selectOption(supplier);
    await owner.getByLabel('Find internal SKU').fill(sku);
    await button(owner, 'Add variant').click();
    await owner.getByLabel('Order quantity', { exact: true }).fill('10');
    await owner.getByLabel('Supplier SKU', { exact: true }).fill('TEST-SUP-BLACK');
    await owner.getByLabel('Quoted unit price in minor units').fill('12550');
    for (const name of ['Freight', 'Tax', 'Other charges']) await owner.getByLabel(name, { exact: true }).fill('0');
    await owner.getByLabel('Quote or source reference').fill('TEST-PILOT-QUOTE');
    await owner.getByLabel('Delivery terms', { exact: true }).fill('Synthetic warehouse delivery');
    await owner.getByLabel('Payment terms', { exact: true }).fill('Synthetic evidence only');
    const draft = await action(owner, 'Save purchase draft', '/purchases');
    purchase = draft.value.order;
    await owner.waitForURL(desk + '/purchases/' + purchase + '?region=BD');
    await owner.getByLabel('I checked the supplier, quantity, total and terms shown above.').check();
    await action(owner, 'Approve this version', '/purchases/' + purchase);
    const communication = owner.locator('details').filter({ has: owner.getByText('Record supplier communication', { exact: true }) });
    await communication.getByLabel('Reported stage').selectOption('confirmed');
    await communication.getByLabel('Evidence reference', { exact: true }).fill('TEST-PILOT-CONFIRM');
    await communication.getByLabel('I am recording a supplier action that already occurred.').check();
    await action(owner, 'Record supplier update', '/purchases/' + purchase);
    await packer.goto(desk + '/purchases/' + purchase + '?region=BD');
    await expect(heading(packer, 'Record a physical receipt')).toBeVisible();
    await expect(heading(packer, 'Supplier invoices and payments')).toHaveCount(0);
    await packer.getByLabel('Supplier delivery reference').fill('TEST-PILOT-DELIVERY');
    await packer.getByLabel('Supporting evidence reference').fill('TEST-PILOT-COUNT');
    await packer.getByLabel('Physically received ' + sku, { exact: true }).fill('6');
    await packer.getByLabel('Accepted for sale ' + sku, { exact: true }).fill('5');
    await packer.getByLabel('Held for inspection ' + sku, { exact: true }).fill('1');
    await packer.getByLabel('I physically counted these stock units at this warehouse.').check();
    const receipt = await action(packer, 'Finalize physical receipt', '/purchases/' + purchase);
    receiptBody = receipt.body;
    const replayReceipt = await request('operations/purchases/' + purchase + '?region=BD', receipt.body, { token: packToken });
    assert.equal(receipt.value.id, replayReceipt.id);
    await owner.reload();
    await expect(heading(owner, 'Receiving balances')).toBeVisible();
    await owner.getByRole('region', { name: 'Receiving balances' }).scrollIntoViewIfNeeded();
    await shot(owner, 'receiving-balances');
  }
  const afterReceipt = savedBrowser ? await request('evidence', { purchase, orders: [] }, { trial: true })
    : await checkpoint('receipt and duplicate', 5, 5, 0);
  assert.deepEqual(afterReceipt.receipts.map(row => [row.seen, row.posted, row.held]), [[6, 5, 1]]);
  assert.equal(afterReceipt.movements.length, 1);
  console.log('PASS zero-stock purchasing fixture, six counted, five sellable, one held, four undelivered, same receipt replay');

  if (staging && !savedBrowser) await request('pause', { paused: false }, { trial: true });
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, httpCredentials: basic,
    storageState: savedBrowser?.state });
  const aPage = await guestContext.newPage();
  const bPage = await guestContext.newPage();
  let a, b;
  if (savedBrowser) {
    assert.deepEqual(previous.statusSteps.slice(0, 4).map(row => row.name), ['zero stock', 'receipt and duplicate', 'Order A and duplicate', 'Order B and duplicate']);
    const cancellation = previous.statusSteps.find(row => row.name === 'Order B cancellation and duplicate');
    if (cancellation) assert.equal(cancellation.sellable, 3);
    statusSteps.splice(0, statusSteps.length, ...previous.statusSteps.slice(0, 4));
    ({ a, b } = savedBrowser);
    for (const [page, order] of [[aPage, a], [bPage, b]]) {
      assert.ok(order.url.startsWith(store + '/orders/'));
      await page.goto(order.url);
      assert.equal(await page.locator('.commerce-intro strong').innerText(), order.reference);
    }
    orderA = await request('operations/lookup?region=BD&q=' + a.reference, undefined, ownerAuth);
    orderB = await request('operations/lookup?region=BD&q=' + b.reference, undefined, ownerAuth);
    assert.equal(orderA.id, previous.orderA);
    assert.equal(orderB.id, previous.orderB);
    if (orderB.status !== 'CANCELLED') await checkpoint('saved guest orders recovered', 2, 5, 3);
  } else {
    await storefrontCheckout(aPage, 2);
    await shot(aPage, 'order-a-review');
    a = await place(aPage);
    orderA = await request('operations/lookup?region=BD&q=' + a.reference, undefined, ownerAuth);
    await checkpoint('Order A and duplicate', 3, 5, 2);
    await storefrontCheckout(bPage, 1);
    b = await place(bPage);
    orderB = await request('operations/lookup?region=BD&q=' + b.reference, undefined, ownerAuth);
    await checkpoint('Order B and duplicate', 2, 5, 3);
    if (statePath) await writeFile(statePath, JSON.stringify({ a, b, state: await guestContext.storageState() }), { mode: 0o600 });
  }
  guestConfirmed = true;
  const stranger = await (await browser.newContext({ httpCredentials: basic })).newPage();
  await stranger.goto(a.url);
  await expect(stranger.getByRole('heading', { name: /not found/i })).toBeVisible();
  await expect(stranger.getByText('10 Synthetic Test Road')).toHaveCount(0);
  await request('operations/packing?region=BD', undefined, { token: supportToken, status: 403 });
  await request('operations/cod?region=BD', undefined, { token: packToken, status: 403 });
  if (receiptBody) await request('operations/purchases/' + purchase + '?region=BD', receiptBody, { token: supportToken, status: 403 });
  else await request('operations/purchases/' + purchase + '?region=BD', undefined, { token: supportToken, status: 403 });
  console.log('PASS storefront guest orders A and B, exact BDT totals, independent holds, idempotent replay and role boundaries');

  let issueId;
  if (orderB.status === 'CANCELLED' && savedBrowser) {
    const queue = await request('operations/issues?region=BD&role=support', undefined, ownerAuth);
    const issue = queue.items.find(row => row.order === orderB.id && row.request?.category === 'cancellation');
    assert.equal(issue?.request.stage, 'confirmed-complete');
    issueId = issue._id;
    console.log('PASS previously completed Brave cancellation verified against the same support issue and order');
  } else {
    await support.goto(desk + '/support?region=BD&q=' + b.reference);
    await expect(support.getByText('Awaiting collection', { exact: false }).first()).toBeVisible();
    await support.getByText('Record a customer request', { exact: true }).click();
    await support.getByLabel('Request category').selectOption('cancellation');
    await support.getByLabel('Request details').fill('Isolated trial customer requests cancellation before any warehouse handling.');
    const issue = await action(support, 'Create support request', '/support');
    issueId = issue.value._id;
    await request('operations/issues/' + issueId + '/cancel-order?region=BD', { revision: 1 }, { token: supportToken, status: 403 });
    await owner.goto(desk + '/queue/' + issueId + '?region=BD');
    await owner.getByLabel('Issue action').selectOption('approve');
    await owner.getByLabel('Note or reason').fill('Approved before packing with no COD payment.');
    await action(owner, 'Save issue', '/issues/' + issueId);
    await owner.getByText('Cancel eligible unpaid COD order', { exact: true }).click();
    const cancel = await action(owner, 'Cancel order', '/issues/' + issueId + '/cancel-order');
    await request('operations/issues/' + issueId + '/cancel-order?region=BD', cancel.body, ownerAuth);
    await owner.getByLabel('Issue action').selectOption('complete');
    await action(owner, 'Save issue', '/issues/' + issueId);
  }
  await bPage.reload();
  await expect(heading(bPage, 'Order cancelled')).toBeVisible();
  await checkpoint('Order B cancellation and duplicate', 3, 5, 2);
  console.log('PASS support escalation, owner cancellation, single release, and cancelled order remains in guest history');

  const address = { country: 'BD', name: 'Test pause', phone: '01700000000', street: 'Synthetic Road', city: 'Dhanmondi', region: 'Dhaka' };
  let pausedPage, pausedGuest, pendingSubmission;
  if (staging) {
    await request('pause', { paused: false }, { trial: true });
    pausedPage = await (await browser.newContext({ httpCredentials: basic })).newPage();
    await storefrontCheckout(pausedPage, 1);
    const cart = await request('checkout/cart', { market: 'BD' });
    const detail = await request('checkout/cart', { cartId: cart.cart.id, revision: cart.cart.revision, market: 'BD', coupons: [],
      lines: [{ product: '00000000000000000000f101', variant, quantity: 1 }] }, { method: 'PUT', guest: cart.token });
    pausedGuest = { token: cart.token, cart: detail.cart };
    const quote = await request('checkout/quote', { cartId: pausedGuest.cart.id, revision: pausedGuest.cart.revision, delivery: address },
      { guest: pausedGuest.token });
    pendingSubmission = { cartId: pausedGuest.cart.id, revision: pausedGuest.cart.revision, delivery: address,
      key: randomUUID(), quoteRevision: quote.quoteRevision };
  }
  await request('pause', { paused: true }, { trial: true });
  const existingReplay = await aPage.request.post(store + '/api/checkout', { headers: checkoutHeaders, data: a.payload });
  assert.equal((await existingReplay.json()).kind, 'placed');
  if (!pausedGuest) pausedGuest = await request('checkout/cart', { market: 'BD' });
  await request('checkout/quote', { cartId: pausedGuest.cart.id, revision: pausedGuest.cart.revision,
    delivery: address }, { guest: pausedGuest.token, status: 503 });
  let shipment;
  if (staging) {
    const blocked = await request('checkout/cod-orders', pendingSubmission, { guest: pausedGuest.token, status: 503 });
    assert.equal(blocked, undefined);
    await request('checkout/cod-orders/attempts/' + pendingSubmission.key, undefined, { guest: pausedGuest.token, status: 404 });
    const direct = pausedPage.waitForResponse(response => response.url() === store + '/api/checkout' && response.request().method() === 'POST');
    await button(pausedPage, 'Place COD order').click();
    const denied = await direct;
    assert.equal(denied.status(), 422);
    assert.match((await denied.json()).message, /New orders are paused/);
    await expect(pausedPage.getByRole('main').getByRole('alert')).toContainText('New orders are paused');
    await shot(pausedPage, 'intake-paused');
    await pausedPage.getByRole('contentinfo').getByRole('link', { name: 'Your cart' }).click();
    await expect(heading(pausedPage, '1 item in your cart')).toBeVisible();
    await checkpoint('new checkout blocked at API and in Brave', 3, 5, 2);
    await support.goto(desk + '/support?region=BD&q=' + a.reference);
    await expect(support.getByText('Plan packing', { exact: true })).toHaveCount(0);
    await request('operations/fulfillment/' + orderA.id + '?region=BD', { action: 'plan' }, { token: supportToken, status: 403 });
    await owner.goto(desk + '/support?region=BD&q=' + a.reference);
    await owner.getByText('Plan packing', { exact: true }).click();
    await owner.getByLabel('Parcel weight (g)').fill('100');
    await owner.getByLabel('Parcel length (cm)').fill('10');
    await owner.getByLabel('Parcel width (cm)').fill('10');
    await owner.getByLabel('Parcel height (cm)').fill('5');
    const planned = await action(owner, 'Send to packing', '/fulfillment/' + orderA.id);
    shipment = { _id: planned.value.id };
    assert.equal(planned.value.state, 'planned');
    assert.equal((await request('operations/fulfillment/' + orderA.id + '?region=BD', planned.body, ownerAuth)).id, shipment._id);
  } else {
    const planOrder = await request('operations/lookup?region=BD&q=' + a.reference, undefined, ownerAuth);
    const lines = (await request('evidence', { purchase, orders: [orderA.id] }, { trial: true })).orders[0].original.lines;
    shipment = await request('global/admin/shipments', { order: planOrder.id, key: randomUUID(), warehouse: readBefore.warehouse,
      service: 'pilot-manual', parcels: [{ grams: 100, length: 10, width: 10, height: 5 }],
      lines: [{ id: lines[0].id, quantity: 2 }] }, ownerAuth);
  }
  const labels = await request('operations/purchases/' + purchase + '/labels/' + afterReceipt.postings[0]._id + '?region=BD', undefined, { token: packToken });
  await packer.goto(desk + '/packing?region=BD');
  const card = packer.locator('article').filter({ has: heading(packer, a.reference) });
  await expect(card).toContainText(sku);
  await expect(card).toContainText('Dhanmondi, Dhaka, BD');
  await card.getByLabel('Scan unit barcodes').fill(labels.slice(0, 2).map(row => row.barcode).join('\n'));
  await card.getByRole('button', { name: 'Record picking' }).click();
  await expect(card.getByRole('button', { name: 'Mark packed' })).toBeVisible();
  await checkpoint('Order A barcode picking while paused', 3, 3, 0);
  await card.getByRole('button', { name: 'Mark packed' }).click();
  await expect(card.getByRole('button', { name: 'Record dispatch' })).toBeVisible();
  await card.getByLabel('Tracking reference').fill('TEST-PILOT-TRACKING-A');
  await card.getByLabel('Handoff evidence reference').fill('TEST-PILOT-HANDOFF-A');
  await card.scrollIntoViewIfNeeded();
  await shot(packer, 'packer-handoff');
  const sent = packer.waitForResponse(value => value.request().method() === 'POST' && value.url().includes('/packing/' + orderA.id));
  await card.getByRole('button', { name: 'Record dispatch' }).click();
  assert.equal((await sent).status(), 200);
  await request('operations/packing/' + orderA.id + '?region=BD', { action: 'dispatch', shipment: shipment._id,
    tracking: 'TEST-PILOT-TRACKING-A', evidence: 'TEST-PILOT-HANDOFF-A' }, { token: packToken });
  await checkpoint('Order A dispatch and duplicate', 3, 3, 0);
  if (staging) {
    await owner.goto(desk + '/support?region=BD&q=' + a.reference);
    await owner.getByText('Record delivery', { exact: true }).click();
    await owner.getByLabel('Delivery evidence reference').fill('TEST-PILOT-DELIVERY-PROOF-A');
    const delivered = await action(owner, 'Confirm delivery', '/fulfillment/' + orderA.id);
    assert.equal(delivered.value.state, 'delivered');
    assert.equal((await request('operations/fulfillment/' + orderA.id + '?region=BD', delivered.body, ownerAuth)).state, 'delivered');
  } else {
    const delivered = { id: 'TEST-PILOT-DELIVERY-A', at: eventAt(), code: 'delivered', evidence: 'TEST-PILOT-DELIVERY-PROOF-A' };
    await request('global/admin/shipments/' + shipment._id + '/tracking', delivered, ownerAuth);
    await request('global/admin/shipments/' + shipment._id + '/tracking', delivered, ownerAuth);
  }
  const awaiting = await checkpoint('Order A delivered, unpaid', 3, 3, 0);
  assert.equal(awaiting.transactions.length, 0);
  await aPage.reload();
  await expect(aPage.getByRole('region', { name: 'Payment and status' })).toContainText('Delivered');
  await expect(aPage.getByRole('region', { name: 'Payment and status' })).toContainText('Awaiting collection');
  console.log('PASS intake pause rejects new checkout, existing replay and staff packing, dispatch and delivery continue');

  const collection = { reference: 'TEST-PILOT-COLLECTION-A', amount: 110000 };
  await request('operations/cod/orders/' + orderA.id + '/collect?region=BD', { ...collection, amount: 109900 }, { ...ownerAuth, status: 422 });
  await owner.goto(desk + '/cod?region=BD');
  await owner.getByText('Record collection on a delivered COD order', { exact: true }).click();
  await owner.getByLabel('Managed order ID').fill(orderA.id);
  await owner.getByLabel('Documented collection in minor units').fill('110000');
  await owner.getByLabel('Collection evidence reference').fill(collection.reference);
  const { value: collected } = await action(owner, 'Record collection on order', '/cod/orders/' + orderA.id + '/collect');
  assert.equal(collected.captured, 110000);
  assert.equal((await request('operations/cod/orders/' + orderA.id + '/collect?region=BD', collection, ownerAuth)).id, collected.id);
  const codPath = 'operations/cod?region=BD';
  const date = eventAt();
  const amounts = [
    { kind: 'collection', reference: 'TEST-PILOT-COLLECTION-A', amount: 110000, status: 'reported', order: orderA.id },
    { kind: 'fee', reference: 'TEST-PILOT-COURIER-FEE-A', amount: 5000, status: 'reported' },
    { kind: 'settlement', reference: 'TEST-PILOT-SETTLEMENT-A', amount: 105000, status: 'received' },
  ];
  let beforeSettlement;
  for (const row of amounts) {
    if (row.kind === 'settlement') beforeSettlement = await checkpoint('collection recorded, settlement absent', 3, 3, 0);
    const input = { ...row, batch: 'TEST-PILOT-BATCH', courier: 'TEST-PILOT-COURIER', currency: 'BDT', occurredAt: date,
      evidence: row.reference + '-MANUAL' };
    let first;
    if (staging) {
      const form = owner.locator('form').filter({ has: owner.getByLabel('Batch reference', { exact: true }) });
      await form.getByLabel('Entry type').selectOption(row.kind);
      await form.getByLabel('Courier', { exact: true }).fill(input.courier);
      await form.getByLabel('Source row reference').fill(row.reference);
      await form.getByLabel('Batch reference').fill(input.batch);
      if (row.order) await form.getByLabel('Order ID, if known').fill(row.order);
      await form.getByLabel('Amount', { exact: true }).fill(String(row.amount / 100));
      await form.getByLabel('Source timestamp').fill(input.occurredAt);
      await form.getByLabel('Verification status').selectOption(row.status);
      await form.getByLabel('Evidence reference', { exact: true }).fill(input.evidence);
      const posted = await action(owner, 'Record entry', '/cod');
      first = posted.value;
      Object.assign(input, posted.body);
    } else first = await request(codPath, input, ownerAuth);
    assert.equal((await request(codPath, input, ownerAuth))._id, first._id);
  }
  assert.equal(beforeSettlement.cod.filter(row => row.kind === 'settlement').length, 0);
  await owner.goto(desk + '/cod?region=BD');
  await expect(owner.getByText('TEST-PILOT-BATCH', { exact: false }).first()).toBeVisible();
  await shot(owner, 'cod-reconciliation');
  await support.goto(desk + '/support?region=BD&q=' + a.reference);
  await expect(support.getByText('Collection recorded', { exact: false }).first()).toBeVisible();
  await shot(support, 'support-order-a');
  await support.goto(desk + '/support?region=BD&q=' + b.reference);
  await expect(support.getByText('Cancelled unpaid', { exact: false }).first()).toBeVisible();
  await shot(support, 'support-order-b');
  const final = await checkpoint('final', 3, 3, 0);
  assert.equal(final.receipts[0].held, 1);
  assert.equal(final.purchase.balances[0].ordered - final.purchase.balances[0].delivered, 4);
  assert.equal(final.shipments[0].lines[0].quantity, 2);
  assert.equal(final.barcodes.filter(row => row.status === 'SOLD').length, 2);
  assert.equal(final.transactions.length, 1);
  assert.equal(final.refunds, 0);
  assert.deepEqual(final.orders.filter(row => row.id === orderB.id).map(row => [row.status, row.paid, row.cod]), [['CANCELLED', 0, 0]]);
  if (!staging) assert.equal(final.externalCalls, 0);
  const events = await request('operations/business-events?region=BD', undefined, ownerAuth);
  const again = await request('operations/business-events?region=BD', undefined, ownerAuth);
  assert.deepEqual(again.events, events.events);
  const relevant = events.events.filter(event => final.orders.some(row => event.id === row.acceptedEvent || event.id === row.cancelledEvent) ||
    ['COD_COLLECTED', 'SETTLEMENT_RECEIVED'].includes(event.kind) && [110000, 105000].includes(event.amountMinor));
  assert.deepEqual(relevant.filter(row => row.kind === 'ORDER_ACCEPTED').map(row => row.amountMinor).sort((a, b) => a - b), [60000, 110000]);
  assert.equal(relevant.find(row => row.kind === 'ORDER_CANCELLED').amountMinor, 60000);
  assert.ok(relevant.every(row => row.test));
  assert.equal(relevant.filter(row => row.kind === 'COD_COLLECTED').length, 1);
  assert.equal(relevant.filter(row => row.kind === 'SETTLEMENT_RECEIVED').length, 1);
  if (staging) {
    await request('operations/work?region=BD', undefined, { ...ownerAuth, status: 404 });
    await request('pause', { paused: false }, { trial: true });
    const resumed = await request('checkout/quote', { cartId: pausedGuest.cart.id, revision: pausedGuest.cart.revision,
      delivery: address }, { guest: pausedGuest.token });
    assert.equal(resumed.review.total, 60000);
    await request('pause', { paused: true }, { trial: true });
    console.log('PASS intake reopens with the same cart, then returns to paused without a third test order');
  } else {
    const task = { issue: issueId };
    const first = await request('operations/work/queue?region=BD', task, { token: supportToken });
    const againTask = await request('operations/work/queue?region=BD', task, { token: supportToken });
    assert.equal(first._id, againTask._id);
    const ai = await request('operations/work?region=BD', undefined, ownerAuth);
    assert.equal(ai.provider.available, false);
    let unavailable;
    for (let wait = 0; wait < 20; wait++) {
      unavailable = await request('operations/work/' + first._id + '?region=BD', undefined, { token: supportToken });
      if (unavailable.state === 'blocked') break;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    assert.equal(unavailable.state, 'blocked');
    assert.equal(unavailable.reason, 'provider-unconfigured');
    assert.equal(unavailable.outcome, undefined);
    copy.task = { ...first, state: unavailable.state, reason: unavailable.reason, review: unavailable.reviewState, providerAvailable: false };
  }
  Object.assign(copy, { final, statusSteps, businessEvents: relevant, supportIssue: issueId });
  await writeFile(join(output, 'trial.json'), JSON.stringify(copy, null, 2) + '\n');
  console.log('PASS one COD collection, one deduction and one settlement with manual evidence, two accepted events and one cancellation');
} finally {
  await request('pause', { paused: staging }, { trial: true }).catch(() => {});
  if (!staging || guestConfirmed || !orderA && statusSteps.length === 2) {
    await writeFile(join(output, 'checkpoints.json'), JSON.stringify({ purchase, orderA: orderA?.id, orderB: orderB?.id, statusSteps }, null, 2) + '\n');
  }
  await browser.close();
}
