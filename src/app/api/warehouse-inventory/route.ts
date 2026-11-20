import { type NextRequest } from 'next/server';
import { ApiError, canWrite, getRegion, mongoId, obj, requestApi, sameOrigin, session, str, url } from '@/lib/api';
import { canAccessStockChanges } from '@/lib/stock-changes';

const path = '/stocks/workspace/warehouse-inventory';
const headers = { 'Cache-Control': 'private, no-store' };
const reject = (message: string, status: number) => Response.json({ message }, { status, headers });

async function inventory(request: NextRequest, write: boolean) {
  if (write && !sameOrigin(request)) return reject('Origin denied.', 403);
  const auth = await session();
  if (!auth) return reject('Sign in required.', 401);
  if (!canWrite(auth.staff) || !canAccessStockChanges(auth.staff, 'warehouse-update')) return reject('Access denied.', 403);

  const query = request.nextUrl.searchParams;
  const term = query.get('q')?.trim();
  const product = query.get('product') || '';
  const warehouse = query.get('warehouse') || '';
  if (term && (write || term.length < 2 || term.length > 100) || !term && !(mongoId(product) && mongoId(warehouse))) {
    return reject('Choose a product and warehouse.', 400);
  }
  let body: string | undefined;
  if (write) {
    if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 60_000) {
      return reject('Invalid inventory request.', 400);
    }
    body = await request.text();
    if (Buffer.byteLength(body) > 60_000) return reject('The inventory request is too large.', 413);
  }
  try {
    const region = getRegion(query.get('region') ?? undefined, auth.staff);
    const target = term ? url(path + '/products', { region, q: term }) : url(path, { region, product, warehouse });
    const response = await requestApi(target, auth.token, write ? { method: 'PUT', body } : undefined);
    const result = obj(await response.json());
    if (!response.ok || result.success !== true) {
      return reject(response.status < 500 && str(result.message).slice(0, 250) || 'Could not load or save the warehouse inventory.', response.ok ? 502 : response.status);
    }
    return Response.json(result.data, { headers });
  } catch (error) {
    return reject('Could not load or save the warehouse inventory.', error instanceof ApiError ? error.status : 503);
  }
}

export const GET = (request: NextRequest) => inventory(request, false);
export const PUT = (request: NextRequest) => inventory(request, true);
