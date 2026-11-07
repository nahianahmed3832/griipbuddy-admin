import { NextRequest } from 'next/server';
import { api, ApiError, arr, getRegion, mongoId, obj, sameOrigin, session, str } from '@/lib/api';
import { canOperate } from '@/lib/operations';
import { maxRateLines, rateOptions, suppliers } from '@/lib/purchases';

const headers = { 'Cache-Control': 'private, no-store' };
const deny = (error: unknown) => {
  if (!(error instanceof ApiError)) throw error;
  return new Response(error.status < 500 ? error.message : 'The purchasing service did not confirm the request.', {
    status: error.status, headers,
  });
};

export async function GET(request: NextRequest) {
  const auth = await session();
  if (!auth) return new Response('Sign in required.', { status: 401, headers });
  const query = request.nextUrl.searchParams;
  try {
    const region = getRegion(query.get('region') ?? undefined, auth.staff);
    return Response.json(await rateOptions(auth, region, query.get('q') ?? ''), { headers });
  } catch (error) { return deny(error); }
}

function amount(value: unknown) {
  const text = str(value);
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) throw new ApiError(400, 'Enter amounts with up to two decimal places.');
  return Number(text);
}

export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return new Response('Origin denied.', { status: 403, headers });
  const auth = await session();
  if (!auth || !canOperate(auth.staff, 'purchase-rate')) return new Response('Access restricted.', { status: 403, headers });
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 10000) {
    return new Response('Invalid request.', { status: 400, headers });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 10000) return new Response('Request is too large.', { status: 413, headers });
  let body;
  try { body = obj(JSON.parse(raw)); } catch { return new Response('Invalid request.', { status: 400, headers }); }
  try {
    const region = getRegion(str(body.region), auth.staff);
    const supplier = str(body.supplier);
    const inputs = arr(body.lines).map(obj);
    const variants = inputs.map(line => str(line.id));
    if (!['BD', 'INTERNATIONAL'].includes(str(body.region)) || !mongoId(supplier) || !inputs.length
      || inputs.length > maxRateLines || variants.some(id => !mongoId(id)) || new Set(variants).size !== variants.length) {
      throw new ApiError(400, 'Choose a supplier and up to 30 distinct product variants.');
    }
    if (!(await suppliers(auth)).some(option => option.value === supplier)) throw new ApiError(400, 'Choose an active supplier.');
    const lines = [];
    for (const input of inputs) {
      const variant = str(input.id);
      const unit_cost = amount(input.cost);
      const discount = amount(input.discount);
      const tax = amount(input.tax);
      if (discount > unit_cost) throw new ApiError(400, 'A discount cannot exceed the unit cost.');
      const record = obj(await api('/product/variant/single/' + variant, auth.token));
      const product = str(obj(record.product)._id) || str(record.product);
      if (!mongoId(product)) throw new ApiError(404, 'A selected variant no longer exists.');
      const item = obj(await api('/product/admin/products/' + product, auth.token));
      if ((str(item.region) || 'BD') !== region || item.is_deleted === true) throw new ApiError(404, 'A selected product is unavailable in this region.');
      lines.push({ variant, product, supplier, unit_cost, discount, tax });
    }
    const result = obj(await api('/purchase/default', auth.token, { method: 'PUT', body: JSON.stringify(lines) }));
    return Response.json({
      saved: arr(result.successful).map(row => str(obj(row).variant)).filter(mongoId),
      failed: arr(result.failed).map(obj).map(row => ({ id: str(row.variant), message: str(row.message).slice(0, 240) })),
    }, { headers });
  } catch (error) { return deny(error); }
}
