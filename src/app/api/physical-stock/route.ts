import { ApiError, getRegion, mongoId, obj, requestApi, sameOrigin, session, str, url, workspaceWritesEnabled } from '@/lib/api';
import { mayReadPhysicalStock, physicalStockFilters, recoveredStockPath } from '@/lib/physical-stock';
import { has } from '@/lib/sections';

const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const fail = (message: string, status: number) => Response.json({ message }, { status, headers });

async function run(request: Request, method: 'GET' | 'PUT' | 'POST') {
  if ((method !== 'GET' && !sameOrigin(request)) || request.headers.get('sec-fetch-site') === 'cross-site') return fail('Open the inventory workspace.', 403);
  try {
    const auth = await session();
    if (!auth) return fail('Sign in to view stock.', 401);
    if (!mayReadPhysicalStock(auth)) return fail('Stock access is restricted.', 403);
    const params = new URL(request.url).searchParams;
    const keys = [...params.keys()];
    if (keys.length !== new Set(keys).size || keys.some(key => !['region', 'market', 'location', 'q', 'status', 'id'].includes(key))) {
      return fail('Use one value for each stock filter.', 400);
    }
    const region = getRegion(params.get('region') ?? undefined, auth.staff);
    const filters = physicalStockFilters(name => params.get(name) ?? undefined, region);
    if (!filters.location || params.has('market') && !filters.market || params.has('status') && !filters.status) {
      return fail('Choose a valid warehouse, market and stock status.', 400);
    }
    if (method === 'GET') {
      const result = await requestApi(url(`${recoveredStockPath}/stocks/export`, filters), auth.token);
      return result.ok ? new Response(result.body, { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="warehouse-stock.csv"', 'X-Content-Type-Options': 'nosniff' } })
        : fail('The stock export is unavailable for that warehouse.', result.status);
    }
    const id = params.get('id') ?? '';
    if (!mongoId(id)) return fail('Choose a stock pool.', 400);
    if (!workspaceWritesEnabled() || !has(auth.staff, method === 'PUT' ? 'stock.update' : 'stock.create')) return fail('Stock editing is restricted.', 403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return fail('Send a stock command as JSON.', 415);
    const body = await request.text();
    if (Buffer.byteLength(body) > 20_000) return fail('The stock command is too large.', 413);
    const idempotency = request.headers.get('idempotency-key') ?? undefined;
    if (method === 'POST' && (!idempotency || !/^[a-zA-Z0-9._-]{8,80}$/.test(idempotency))) return fail('Include a unique operation key.', 400);
    const response = await requestApi(url(`${recoveredStockPath}/stocks/${id}/${method === 'PUT' ? 'threshold' : 'damage'}`,
      { region, market: filters.market, location: filters.location }), auth.token, { method, body }, idempotency);
    const result = obj(await response.json().catch(() => null));
    if (!response.ok || result.success !== true) return fail(response.status < 500 && str(result.message) || 'Could not post the stock command.', response.ok ? 502 : response.status);
    return Response.json(result.data, { status: response.status, headers });
  } catch (error) {
    return fail(error instanceof ApiError ? error.message : 'The inventory service could not complete this request.', error instanceof ApiError ? error.status : 503);
  }
}
export const GET = (request: Request) => run(request, 'GET');
export const POST = (request: Request) => run(request, 'POST');
export const PUT = (request: Request) => run(request, 'PUT');
