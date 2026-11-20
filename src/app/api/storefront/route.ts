import { NextRequest } from 'next/server';
import { ApiError, canWrite, connection, mongoId, obj, requestApi, sameOrigin, session, str } from '@/lib/api';
import { has } from '@/lib/sections';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

async function operator(kind: string) {
  const auth = await session();
  if (process.env.GRIIP_ADMIN_INTEGRATED !== '1') throw new ApiError(404);
  if (!auth || !canWrite(auth.staff) || !has(auth.staff, kind === 'product' ? 'product.update' : 'review.view')) {
    throw new ApiError(auth ? 403 : 401);
  }
  return auth.token;
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id') ?? '';
    const index = req.nextUrl.searchParams.get('index') ?? '';
    if (!mongoId(id) || !/^[0-3]$/.test(index)) throw new ApiError(404);
    const token = await operator('review');
    const range = req.headers.get('range');
    const res = await fetch(connection().origin + '/api/v1/storefront-reviews/admin/media/' + id + '/' + index, {
      headers: { Authorization: 'Bearer ' + token, ...(range ? { Range: range } : {}) },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    const result = new Headers(headers);
    for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-security-policy']) {
      const value = res.headers.get(key);
      if (value) result.set(key, value);
    }
    return new Response(res.body, { status: res.status, headers: result });
  } catch (error) {
    return new Response('Media unavailable', { status: error instanceof ApiError ? error.status : 503, headers });
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new Response('Origin denied', { status: 403, headers });
  try {
    const length = Number(req.headers.get('content-length'));
    if (length > 20_000 || !req.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(413);
    const raw = await req.text();
    if (raw.length > 20_000) throw new ApiError(413);
    const input = obj(JSON.parse(raw));
    const id = str(input.id);
    const kind = str(input.kind);
    if (!mongoId(id) || !['product', 'review'].includes(kind)) throw new ApiError(400);
    const token = await operator(kind);
    const path = kind === 'product' ? '/storefront/admin/product/' : '/storefront-reviews/admin/';
    const response = await requestApi(path + id, token, { method: 'PATCH', body: JSON.stringify(input.values) });
    const result = obj(await response.json());
    return Response.json(response.ok ? { ok: true } : { error: str(result.message) || 'Could not save changes.' },
      { status: response.status, headers });
  } catch (error) {
    return Response.json({ error: 'Could not save changes.' },
      { status: error instanceof ApiError ? error.status : error instanceof SyntaxError ? 400 : 503, headers });
  }
}
