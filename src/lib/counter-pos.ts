import 'server-only';
import { ApiError, mongoId, obj, requestApi, str, workspaceWritesEnabled, type RecordData, type Session } from '@/lib/api';
import { counterDate, counterMoney, type CounterReceipt, type CounterScope } from '@/lib/counter-pos-contract';
import { has } from '@/lib/sections';

const apiRoot = '/pos/counter';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const counterPrivate = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export function counterPosEnabled() {
  return process.env.GRIIP_ADMIN_TARGET === 'fixture' && process.env.GRIIP_ADMIN_POS_COUNTER === '1' && workspaceWritesEnabled();
}

export function canOpenCounter(auth: Session, write = false) {
  return counterPosEnabled() && has(auth.staff, 'pos.view') && (!write || has(auth.staff, 'pos.create'));
}

function requireCounter(auth: Session) {
  if (!counterPosEnabled()) throw new ApiError(404, 'Counter workspace is unavailable.');
  if (!has(auth.staff, 'pos.view')) throw new ApiError(403, 'Point-of-sale access is required.');
}

function scopeFrom(value: { location?: unknown; market?: unknown; currency?: unknown }, auth: Session): CounterScope {
  const location = str(value.location);
  const { market, currency } = value;
  if (!mongoId(location) || !((market === 'BD' && currency === 'BDT') || (market === 'US' && currency === 'USD'))) {
    throw new ApiError(400, 'Choose an outlet, market, and matching currency.');
  }
  if (market === 'US' && !has(auth.staff, 'international.access')) throw new ApiError(403, 'Market access is required.');
  return { location, market, currency };
}

async function forward(auth: Session, path: string, method?: string, body?: RecordData) {
  const response = await requestApi(apiRoot + path, auth.token, method ? { method, body: JSON.stringify(body) } : undefined);
  const envelope = obj(await response.json().catch(() => null));
  if (!response.ok) {
    throw new ApiError(response.status, response.status < 500 && typeof envelope.message === 'string'
      ? envelope.message.slice(0, 350) : 'The counter service could not confirm the request.');
  }
  if (envelope.success !== true || !Object.hasOwn(envelope, 'data')) throw new ApiError(502);
  return envelope.data;
}

function recordId(value: string | null | undefined) {
  if (!value || !mongoId(value)) throw new ApiError(400, 'Choose a valid sale reference.');
  return value;
}

function operationId(value: string | null | undefined) {
  if (!value || !uuid.test(value)) throw new ApiError(400, 'Enter a valid sale operation reference.');
  return value;
}

export async function readCounterPos(auth: Session, action: string, input: URLSearchParams) {
  requireCounter(auth);
  if (Array.from(new Set(input.keys())).some(key => input.getAll(key).length !== 1)) throw new ApiError(400, 'Invalid duplicate request field.');
  if (action === 'counter-context') return forward(auth, '/context');
  const scope = scopeFrom(Object.fromEntries(input), auth);
  const query = new URLSearchParams(scope);
  if (action === 'counter-catalog') {
    const term = input.get('q')?.trim() ?? '';
    const mode = input.get('mode');
    if (term.length > 100 || (mode !== 'scan' && mode !== 'search')) throw new ApiError(400, 'Use a valid search value.');
    query.set('q', term);
    query.set('mode', mode);
    return forward(auth, '/catalog?' + query);
  }
  if (action === 'counter-customers') {
    if (!has(auth.staff, 'user.view')) throw new ApiError(403, 'Customer lookup permission is required.');
    const phone = input.get('phone')?.trim() ?? '';
    if (!/^[+\d ()-]{3,22}$/.test(phone)) throw new ApiError(400, 'Enter the customer’s complete phone number.');
    query.set('phone', phone);
    return forward(auth, '/customers?' + query);
  }
  if (action === 'counter-recovery') return forward(auth, '/operations/' + operationId(input.get('operationId')) + '?' + query);
  if (action === 'counter-receipt' || action === 'counter-receipt-download') {
    return forward(auth, '/sale/' + recordId(input.get('id')) + '/receipt?' + query);
  }
  if (action === 'counter-history') {
    const cursor = input.get('cursor');
    if (cursor) query.set('cursor', recordId(cursor));
    return forward(auth, '/sales?' + query);
  }
  if (action === 'counter-shifts') return forward(auth, '/shifts?' + query);
  if (action === 'counter-returns') return forward(auth, '/sales/' + recordId(input.get('id')) + '/returns?' + query);
  throw new ApiError(404, 'Unknown counter action.');
}

export async function writeCounterPos(auth: Session, action: string, values: RecordData) {
  requireCounter(auth);
  scopeFrom(values, auth);
  if (action === 'counter-return') {
    if (!has(auth.staff, 'pos.update')) throw new ApiError(403, 'Point-of-sale return permission is required.');
    const { saleId, ...rest } = values;
    return forward(auth, '/sales/' + recordId(str(saleId)) + '/returns', 'POST', rest);
  }
  if (action === 'counter-shift') {
    if (!has(auth.staff, 'pos.update')) throw new ApiError(403, 'Register update permission is required.');
    return forward(auth, '/shifts', 'POST', values);
  }
  if (!has(auth.staff, 'pos.create')) throw new ApiError(403, 'Point-of-sale creation permission is required.');
  if (action === 'counter-quote') return forward(auth, '/quote', 'POST', values);
  if (action === 'counter-sale') return forward(auth, '/sale', 'POST', values);
  if (action === 'counter-seal') {
    const { operationId: requestId, ...scope } = values;
    return forward(auth, '/operations/' + operationId(str(requestId)) + '/seal', 'POST', scope);
  }
  if (action === 'counter-customer') {
    if (!has(auth.staff, 'user.view') || !has(auth.staff, 'user.create')) throw new ApiError(403, 'Customer creation permission is required.');
    return forward(auth, '/customers', 'POST', values);
  }
  throw new ApiError(404, 'Unknown counter action.');
}

function escape(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? '');
}

export function downloadCounterReceipt(receipt: CounterReceipt) {
  const context = receipt.context;
  const { currency } = receipt.totals;
  const money = (value: number) => escape(counterMoney(value, currency));
  const title = 'Receipt ' + receipt.invoice;
  const rows = receipt.lines.map(line => '<tr><td>' + escape(line.name) + ' <small>' + escape(line.sku) + '</small></td><td>' +
    escape(line.quantity) + '</td><td class="number">' + money(line.totalMinor) + '</td></tr>').join('');
  const totals = [['Subtotal', receipt.totals.subtotalMinor], ['Discount', receipt.totals.discountMinor], ['Tax', receipt.totals.taxMinor],
    ['Total', receipt.totals.totalMinor], ['Cash received', receipt.tender.receivedMinor], ['Cash applied', receipt.tender.appliedMinor],
    ['Change', receipt.tender.changeMinor]] as const;
  const detail = [
    context.outletName, context.market + ' · ' + currency, 'Operator ' + context.operatorName, context.registerLabel,
    counterDate(receipt.at, context.market), receipt.customer?.name,
  ].filter(Boolean).map(value => '<p>' + escape(value) + '</p>').join('');
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + escape(title) + '</title><style>body{font:14px system-ui,sans-serif;color:#171717;margin:24px auto;max-width:420px;padding:0 16px}' +
    'p{margin:.3em 0}table{border-collapse:collapse;width:100%;margin:18px 0}td,th{padding:6px;border-bottom:1px solid #ccc;text-align:left}' +
    'td.number{text-align:right;white-space:nowrap}small{display:block;color:#555}dl div{display:flex;justify-content:space-between;gap:16px}' +
    '@media print{body{margin:0;max-width:none}table tr{break-inside:avoid}}</style></head><body><h1>' + escape(context.businessName) +
    '</h1><h2>' + escape(title) + '</h2>' + detail +
    '<table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>' + rows +
    '</tbody></table><dl>' + totals.map(([label, value]) => '<div><dt>' + label + '</dt><dd>' + money(value) + '</dd></div>').join('') +
    '</dl></body></html>';
  const file = (receipt.invoice || receipt.id).replace(/[^a-z0-9-]/gi, '-').slice(0, 80);
  return new Response(html, { headers: { ...counterPrivate, 'Content-Type': 'text/html; charset=utf-8',
    'Content-Disposition': 'attachment; filename="pos-receipt-' + file + '.html"',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
}
