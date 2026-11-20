import { NextRequest } from 'next/server';
import { api, ApiError, arr, canWrite, getRegion, mongoId, obj, requestApi, sameOrigin, session, str, url } from '@/lib/api';
import { readProduct } from '@/lib/catalog-admin';
import { locationsEndpoint } from '@/lib/locations';
import { canAccessStockChanges, stockChangeApi, stockChangeModes, type StockChangeMode } from '@/lib/stock-changes';

const headers = { 'Cache-Control': 'private, no-store' };
const reject = (message: string, status: number) => new Response(message, { status, headers });
const getMode = (value: string | null) => stockChangeModes.find(mode => mode === value);
const maximumBody = 60_000;

export async function GET(request: NextRequest) {
  const auth = await session();
  if (!auth) return reject('Sign in required.', 401);
  const q = request.nextUrl.searchParams;
  const mode = getMode(q.get('mode'));
  if (!mode) return reject('Choose a stock action.', 400);
  if (!canWrite(auth.staff) || !canAccessStockChanges(auth.staff, mode)) return reject('Access denied.', 403);
  const location = q.get('location') || '';
  const term = q.get('q')?.trim().slice(0, 100);
  const product = q.get('product');
  if (!mongoId(location) || (!term && !product) || (product && !mongoId(product))) return reject('Choose a location and enter a product name or SKU.', 400);
  try {
    const region = getRegion(q.get('region') ?? undefined, auth.staff);
    if (product && (mode === 'outlet-update' || mode === 'adjustment')) {
      const [source, item] = await Promise.all([api(url(locationsEndpoint + '/' + location, { region }), auth.token).then(obj), readProduct(product, auth, region)]);
      if (mode === 'outlet-update' && (str(source.type) || str(source.business_location_type)) !== 'WAREHOUSE') return reject('Choose a warehouse.', 404);
      const [variants, inventory] = await Promise.all([
        api('/product/variant/' + product, auth.token),
        api(url('/business-location/inventories/' + location, { productId: product, limit: '200' }), auth.token).then(obj),
      ]);
      const records = arr(inventory.data).map(obj);
      const available = new Map(records.map(row => [str(obj(row.variant)._id) || str(row.variant), Number(row.available_quantity) || 0]));
      return Response.json(arr(variants).map(obj).flatMap(row => {
        const id = str(row._id);
        return mongoId(id) ? [{ product, variant: id, sku: str(row.sku), name: str(item.name), available: available.get(id) ?? 0,
          regularPrice: typeof row.regular_price === 'number' ? row.regular_price : undefined }] : [];
      }), { headers });
    }
    if (!term) return reject('Enter a product name or SKU.', 400);
    const products = await api(url(stockChangeApi + '/products', { mode, region, location, q: term }), auth.token);
    return Response.json(products, { headers });
  } catch (err) {
    return reject('Could not find products at this location.', err instanceof ApiError ? err.status : 503);
  }
}

async function update(mode: StockChangeMode, request: NextRequest) {
  const auth = await session();
  if (!auth) return reject('Sign in required.', 401);
  if (!canWrite(auth.staff) || !canAccessStockChanges(auth.staff, mode)) return reject('Access denied.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > maximumBody) {
    return reject('Invalid stock change request.', 400);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > maximumBody) return reject('Stock change request is too large.', 413);
  try { JSON.parse(raw); } catch { return reject('Invalid stock change request.', 400); }
  try {
    const region = getRegion(request.nextUrl.searchParams.get('region') ?? undefined, auth.staff);
    const response = await requestApi(url(stockChangeApi + '/' + mode, { region }), auth.token, { method: 'POST', body: raw });
    const data = obj(await response.json().catch(() => ({})));
    if (!response.ok) return reject(response.status >= 500 ? 'The inventory service did not confirm this change. Retry the same details or check the history.'
      : str(data.message).slice(0, 400) || 'Review the stock change details.', response.status);
    return Response.json(data.data, { status: response.status, headers });
  } catch (err) {
    return reject('Could not confirm the stock change. Retry the same details or check the history.', err instanceof ApiError ? err.status : 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject('Origin denied.', 403);
  const mode = getMode(request.nextUrl.searchParams.get('mode'));
  if (!mode) return reject('Choose a stock action.', 400);
  return update(mode, request);
}
