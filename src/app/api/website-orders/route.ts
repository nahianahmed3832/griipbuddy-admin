import { NextRequest } from 'next/server';
import { ApiError, canWrite, getRegion, mongoId, obj, requestApi, sameOrigin, session, str, url } from '@/lib/api';
import { has } from '@/lib/sections';
import { orderFilterKeys } from '@/lib/website-orders';

const root = '/order/workspace';
const reads = ['history', 'status', 'tracking', 'payment', 'proof'];
const actions: Record<string, { path: string; method: string }> = {
  called: { path: '/called', method: 'PATCH' },
  edit: { path: '/details', method: 'PATCH' },
  note: { path: '/note', method: 'PUT' },
  sms: { path: '/sms', method: 'POST' },
  'update-status': { path: '/status', method: 'PATCH' },
  fraud: { path: '/fraud', method: 'POST' },
  'return-untracked': { path: '/return', method: 'POST' },
};
const reject = (message: string, status: number) => new Response(message, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function forward(path: string, token: string, init?: RequestInit, attachment?: string) {
  const response = await requestApi(root + path, token, init);
  if (!response.ok) {
    const data = obj(await response.json().catch(() => ({})));
    const error = str(data.message);
    return reject(response.status >= 500
      ? (path.includes('/fraud?') ? 'Courier fraud check is unavailable.' : 'The order service did not confirm the request. Check the order before retrying.')
      : error.slice(0, 320) || 'The order service could not complete this request.', response.status);
  }
  if (attachment || response.headers.get('content-type')?.startsWith('image/png')) {
    return new Response(response.body, { headers: {
      'Content-Type': attachment ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'image/png',
      ...(attachment && { 'Content-Disposition': 'attachment; filename="website-orders.xlsx"' }),
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  }
  return Response.json(obj(await response.json()).data, { status: response.status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: NextRequest) {
  const auth = await session();
  if (!auth) return reject('Sign in required.', 401);
  const q = request.nextUrl.searchParams;
  const action = q.get('action') || '';
  const id = q.get('id') || '';
  try {
    const region = getRegion(q.get('region') || undefined, auth.staff);
    if (action === 'products') {
      if (!canWrite(auth.staff) || !has(auth.staff, 'order.create') || !has(auth.staff, 'product.view')) return reject('Access denied.', 403);
      return await forward(url('/products', { region, page: q.get('page') || undefined, q: q.get('q')?.slice(0, 100),
        barcode: q.get('barcode')?.slice(0, 64) }), auth.token);
    }
    if (!has(auth.staff, 'order.view')) return reject('Access denied.', 403);
    if (action === 'export') return await forward(url('/export', { region,
      ...Object.fromEntries(orderFilterKeys.map(key => [key, q.get(key)?.slice(0, 100)])) }), auth.token, undefined, 'xlsx');
    if (!reads.includes(action) || !mongoId(id)) return reject('Order request not found.', 404);
    return await forward(url('/orders/' + id + '/' + action, { region, page: q.get('page') || undefined }), auth.token);
  } catch (error) {
    return reject('The order request could not be completed.', error instanceof ApiError ? error.status : 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject('Origin denied.', 403);
  const auth = await session();
  if (!auth) return reject('Sign in required.', 401);
  if (!canWrite(auth.staff)) return reject('This workspace is read-only.', 403);
  const q = request.nextUrl.searchParams;
  const action = q.get('action') || '';
  const id = q.get('id') || '';
  const limit = action === 'create' ? 2_150_000 : 15_000;
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > limit) {
    return reject('Invalid order request.', 400);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > limit) return reject('Order request is too large.', 413);
  let body: Record<string, unknown>;
  try { body = obj(JSON.parse(raw)); } catch { return reject('Invalid order request.', 400); }
  try {
    const region = getRegion(q.get('region') || undefined, auth.staff);
    let path: string;
    let method = 'POST';
    if (action === 'create') {
      if (!has(auth.staff, 'order.create') || !has(auth.staff, 'product.view')) return reject('Access denied.', 403);
      path = '/orders';
    } else {
      const permission = action === 'fraud' ? 'order.view' : 'order.update';
      if (!has(auth.staff, 'order.view') || !has(auth.staff, permission)
        || action === 'return-untracked' && !has(auth.staff, 'order.return')) return reject('Access denied.', 403);
      if (action === 'sync') path = '/sync';
      else {
        if (!mongoId(id) || !Object.hasOwn(actions, action)) return reject('Order action not found.', 404);
        path = '/orders/' + id + actions[action].path;
        method = actions[action].method;
      }
    }
    return await forward(url(path, { region }), auth.token, { method, body: JSON.stringify(body) });
  } catch (error) {
    return reject(error instanceof ApiError && error.status === 403 ? 'Access denied.'
      : 'The connection was interrupted. Check the order before retrying.', error instanceof ApiError ? error.status : 503);
  }
}
