import { NextRequest } from 'next/server';
import { ApiError, arr, getRegion, mongoId, obj, requestApi, sameOrigin, session, str, url, type RecordData } from '@/lib/api';
import { findVariantBySku, locationInRegion } from '@/lib/operations';
import { canEditPurchase, purchaseRecord, purchaseStatuses, suppliers } from '@/lib/purchases';
import { barcodeVariants } from '@/lib/smart-inventory';

const headers = { 'Cache-Control': 'private, no-store' };
const deny = (status: number, message: string) => new Response(message, { status, headers });
const reference = (value: unknown) => str(obj(value)._id) || str(value);
const fail = (message: string): never => { throw new ApiError(400, message); };

function text(input: RecordData, key: string, max: number) {
  const value = str(input[key]).trim();
  if (value.length > max) fail('A purchase field is too long.');
  return value;
}

function money(input: RecordData, key: string) {
  const value = text(input, key, 11);
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value)) fail('Enter valid amounts with up to two decimal places.');
  return Number(value);
}

export async function GET(req: NextRequest) {
  const auth = await session();
  if (!auth) return deny(401, 'Sign in required.');
  if (!canEditPurchase(auth.staff)) return deny(403, 'Access restricted.');
  const query = req.nextUrl.searchParams;
  const term = (query.get('q') ?? '').trim();
  if (term.length < 2 || term.length > 100) return Response.json([], { headers });
  try {
    const region = getRegion(query.get('region') ?? undefined, auth.staff);
    const current = await purchaseRecord(auth, region, query.get('id') ?? '');
    if (current.inventory_ordered === true) return deny(409, 'Use the purchase order workspace to edit a managed purchase.');
    return Response.json(await barcodeVariants(term, auth, region), { headers });
  } catch (error) {
    if (error instanceof ApiError) return deny(error.status, error.status < 500 ? error.message : 'Product search is unavailable.');
    throw error;
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return deny(403, 'Origin denied.');
  const auth = await session();
  if (!auth) return deny(401, 'Sign in required.');
  if (!canEditPurchase(auth.staff)) return deny(403, 'Access restricted.');
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!mongoId(id) || !req.headers.get('content-type')?.startsWith('application/json') || Number(req.headers.get('content-length')) > 25000) {
    return deny(400, 'Invalid purchase details.');
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 25000) return deny(413, 'Purchase details are too large.');
  let body: RecordData;
  try { body = obj(JSON.parse(raw)); } catch { return deny(400, 'Invalid purchase details.'); }
  try {
    const region = getRegion(req.nextUrl.searchParams.get('region') ?? undefined, auth.staff);
    const current = await purchaseRecord(auth, region, id);
    if (current.inventory_ordered === true) return deny(409, 'Use the purchase order workspace to edit a managed purchase.');
    if (!str(body.revision) || body.revision !== current.updatedAt) return deny(409, 'This purchase changed. Reload it before editing.');
    const date = text(body, 'date', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      fail('Enter a valid purchase date.');
    }
    const status = str(body.status);
    if (!purchaseStatuses.includes(status) || (status !== current.status && [status, current.status].includes('received'))) {
      fail('Receipt status changes must be recorded through receiving.');
    }
    const supplier = str(body.supplier);
    const location = str(body.location);
    if (supplier !== reference(current.supplier) && !(await suppliers(auth)).some(row => row.value === supplier)) fail('Choose an active supplier.');
    if (location !== reference(current.business_location)) await locationInRegion(location, region, auth);

    const before = new Map(arr(current.items).map(obj).map(line => [reference(line.variant), line]));
    const inputs = arr(body.lines).map(obj);
    if (!inputs.length || inputs.length > 50) fail('Add between one and 50 purchase lines.');
    const seen = new Set<string>();
    const items = [];
    for (const input of inputs) {
      const previous = before.get(str(input.variant));
      const sku = text(input, 'sku', 100);
      const selected = previous ? obj(previous.variant) : await findVariantBySku(sku, region, auth);
      const variant = previous ? reference(previous.variant) : reference(selected);
      const product = previous ? reference(previous.product) : reference(selected.product);
      const qty = Number(text(input, 'quantity', 8));
      const unit_cost = money(input, 'cost');
      const discount = money(input, 'discount');
      const tax = money(input, 'tax');
      if (!mongoId(variant) || !mongoId(product) || seen.has(variant)) fail('Choose each valid SKU only once.');
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > 100000 || discount > qty * unit_cost) fail('Check quantity and discount on every line.');
      seen.add(variant);
      items.push({ ...previous, variant, product, qty, unit_cost, discount, tax });
    }
    const extras = arr(body.expenses).map(obj);
    if (extras.length > 20) fail('Enter up to 20 applied expenses.');
    const expenses_applied = extras.map(input => {
      const type = text(input, 'type', 100);
      if (!type) fail('Enter an applied expense name.');
      return { type, amount: money(input, 'amount'), note: text(input, 'note', 500) };
    });
    const existingLinks = arr(current.attachments).map(str);
    const attachments = text(body, 'attachments', 5000).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (attachments.length > 10 || attachments.some(item => !existingLinks.includes(item) && !/^https:\/\/[^\s]+$/i.test(item))) fail('Enter up to ten HTTPS attachment links.');

    const response = await requestApi(url('/purchase/' + id, { region }), auth.token, { method: 'PUT', body: JSON.stringify({
      expected_updated_at: body.revision, supplier, business_location: location, status, items, expenses_applied,
      purchase_date: date + 'T00:00:00+06:00', additional_notes: text(body, 'note', 1000), attachments,
    }) });
    const result = obj(await response.json());
    if (!response.ok || result.success !== true) {
      return deny(response.status >= 400 ? response.status : 502, response.status < 500 && str(result.message)
        ? str(result.message).slice(0, 300) : 'The purchase service could not confirm the change.');
    }
    return Response.json({ id }, { headers });
  } catch (error) {
    if (error instanceof ApiError) return deny(error.status, error.message);
    throw error;
  }
}
