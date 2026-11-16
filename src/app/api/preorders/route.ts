import { NextRequest } from 'next/server';
import { api, ApiError, getRegion, mongoId, obj, requestApi, sameOrigin, session, str, url } from '@/lib/api';
import { preOrderApiParams, preOrderQuery } from '@/lib/preorders';
import { preOrderAccess, preOrderProducts } from '@/lib/preorders-server';

const root = '/pre-order';
const workbook = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const writes: Record<string, { path: string; method: string }> = {
  edit: { path: '', method: 'PUT' },
  advance: { path: '/advance-received', method: 'PATCH' },
  called: { path: '/mark-called', method: 'PATCH' },
  quote: { path: '/quote', method: 'PATCH' },
  status: { path: '/status', method: 'PATCH' },
  dispatch: { path: '/send-to-courier', method: 'POST' },
  sms: { path: '/send-sms', method: 'POST' },
  remove: { path: '', method: 'DELETE' },
};
const bulk: Record<string, { path: string; method: string }> = {
  'bulk-status': { path: '/bulk/status', method: 'PATCH' },
  'bulk-batch': { path: '/bulk/batch', method: 'PATCH' },
  'bulk-dispatch': { path: '/bulk/send-to-courier', method: 'POST' },
};
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const reject = (message: string, status: number) => new Response(message, { status, headers });

async function forward(path: string, token: string, init?: RequestInit, download?: string) {
  const response = await requestApi(path, token, init);
  if (!response.ok) {
    const result = obj(await response.json().catch(() => ({})));
    const message = response.status >= 500 ? 'The pre-order service did not confirm the request. Check the record before retrying.'
      : str(result.message).slice(0, 240) || 'Could not complete the pre-order request.';
    return reject(message, response.status);
  }
  if (download) {
    const isWorkbook = download === workbook;
    return new Response(response.body, { headers: { ...headers, 'Content-Type': download,
      'Content-Disposition': isWorkbook ? 'attachment; filename="pre-orders.xlsx"' : 'inline; filename="pre-order-receipt.png"' } });
  }
  const envelope = obj(await response.json());
  return Response.json(envelope.data, { status: response.status, headers });
}

export async function GET(request: NextRequest) {
  const auth = await session();
  if (!auth) return reject('Sign in required.', 401);
  const q = request.nextUrl.searchParams;
  const action = q.get('action');
  try {
    const access = preOrderAccess(auth, getRegion(q.get('region') ?? undefined, auth.staff));
    if (action === 'export') {
      return await forward(url(root + '/workspace/export', preOrderApiParams(preOrderQuery(q))), auth.token, undefined, workbook);
    }
    if (action === 'products') {
      if (!access.products || (!access.create && !access.update)) return reject('Access denied.', 403);
      const search = q.get('q')?.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!search) return Response.json([], { headers });
      const data = await api(url('/product/admin/variants', { region: 'BD', limit: '15', searchQuery: search }), auth.token);
      return Response.json(preOrderProducts(data), { headers });
    }
    const id = q.get('id') || '';
    const receipt = q.get('receipt') || '';
    if (action === 'receipt' && mongoId(id) && mongoId(receipt)) {
      return await forward(root + '/workspace/' + id + '/receipts/' + receipt, auth.token, undefined, 'image/png');
    }
    return reject('Pre-order request not found.', 404);
  } catch (error) {
    return reject('Could not load this pre-order request.', error instanceof ApiError ? error.status : 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject('Origin denied.', 403);
  const auth = await session();
  if (!auth) return reject('Sign in required.', 401);
  const q = request.nextUrl.searchParams;
  const action = q.get('action') || '';
  const id = q.get('id') || '';
  try {
    const access = preOrderAccess(auth, getRegion(q.get('region') ?? undefined, auth.staff));
    const permitted = ['create', 'reference-create'].includes(action) ? access.create : action === 'remove' ? access.remove : access.update;
    if (!permitted) return reject('Access denied.', 403);
    const maxSize = ['receipt', 'reference-create', 'reference-edit'].includes(action) ? 2_150_000 : 60_000;
    if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > maxSize) {
      return reject('Invalid pre-order request.', 400);
    }
    const raw = await request.text();
    if (Buffer.byteLength(raw) > maxSize) return reject('The pre-order request is too large.', 413);
    let body: Record<string, unknown>;
    try { body = obj(JSON.parse(raw)); } catch { return reject('Invalid pre-order request.', 400); }

    let path: string;
    let method = 'POST';
    if (action === 'create') {
      path = '/admin';
    } else if (action === 'reference-create' || action === 'reference-edit') {
      path = '/workspace/' + (action === 'reference-create' ? 'create' : 'edit') + '/reference-images';
    } else if (Object.hasOwn(bulk, action)) {
      const ids = body.ids;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 25 || ids.some(value => typeof value !== 'string' || !mongoId(value))) {
        return reject('Select up to 25 pre-orders.', 400);
      }
      body.ids = [...new Set(ids)];
      ({ path, method } = bulk[action]);
    } else if (mongoId(id) && (action === 'receipt' || action === 'note')) {
      path = '/workspace/' + id + (action === 'receipt' ? '/receipts' : '/notes');
    } else if (mongoId(id) && Object.hasOwn(writes, action)) {
      const item = writes[action];
      path = '/' + id + item.path;
      method = item.method;
    } else {
      return reject('Pre-order request not found.', 404);
    }

    if ((action === 'create' || action === 'edit') && (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30)) {
      return reject('Provide between 1 and 30 products.', 400);
    }
    if (action === 'sms' && str(body.message).trim().length > 600) return reject('SMS must be at most 600 characters.', 400);
    if (action === 'dispatch') {
      const result = await forward(root + path, auth.token, { method, body: '{}' });
      if (!result.ok) return result;
      const data = obj(await result.json());
      return Response.json({ updated: !!data.preOrder }, { headers });
    }
    return await forward(root + path, auth.token, { method, ...(method !== 'DELETE' && { body: JSON.stringify(body) }) });
  } catch (error) {
    return reject('Could not complete this pre-order request.', error instanceof ApiError ? error.status : 503);
  }
}
