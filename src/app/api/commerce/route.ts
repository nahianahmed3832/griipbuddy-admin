import { NextRequest } from 'next/server';
import { ApiError, canWrite, integratedCheckoutEnabled, requestApi, sameOrigin, session } from '@/lib/api';
import { superAdmin } from '@/lib/sections';

const orderId = /^[0-9a-f]{24}$/;
const marketCode = /^[A-Z]{2}$/;
const headers = { 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' };

async function access(write = false) {
  if (!integratedCheckoutEnabled()) throw new ApiError(404);
  const auth = await session();
  if (!auth || !superAdmin(auth.staff)) throw new ApiError(auth ? 403 : 401);
  if (write && !canWrite(auth.staff)) throw new ApiError(403);
  return auth.token;
}

async function forward(res: Response) {
  if (res.ok && res.headers.get('content-type') === 'image/jpeg') {
    return new Response(res.body, { headers:{ ...headers, 'Content-Type':'image/jpeg',
      'Content-Disposition':'attachment; filename="receipt.jpg"', 'Content-Security-Policy':"default-src 'none'; sandbox" } });
  }
  const payload = await res.json().catch(() => null);
  return Response.json(res.ok ? payload : { error:typeof payload?.message === 'string' ? payload.message : 'Commerce request failed.' },
    { status:res.status, headers });
}

export async function GET(req: NextRequest) {
  try {
    const token = await access();
    const id = req.nextUrl.searchParams.get('receipt') ?? '';
    if (!orderId.test(id)) throw new ApiError(404);
    const format = req.nextUrl.searchParams.get('format') === 'metadata' ? '?format=metadata' : '';
    return forward(await requestApi('/commerce/admin/receipts/' + id + format, token));
  } catch (error) { return new Response('Receipt unavailable', { status:error instanceof ApiError ? error.status : 503, headers }); }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new Response('Origin denied', { status:403, headers });
  try {
    const token = await access(true);
    if (Number(req.headers.get('content-length')) > 3000 || !req.headers.get('content-type')?.startsWith('application/json')) {
      throw new ApiError(400);
    }
    const raw = await req.text();
    if (raw.length > 3000) throw new ApiError(400);
    const body = JSON.parse(raw);
    const path = body.kind === 'market' && marketCode.test(body.id) ? '/markets/' + body.id
      : body.kind === 'receipt' && orderId.test(body.id) ? '/receipts/' + body.id : null;
    if (!path) throw new ApiError(400);
    return forward(await requestApi('/commerce/admin' + path, token, { method:'PATCH', body:JSON.stringify(body.values) }));
  } catch (error) {
    return Response.json({ error:'Commerce change could not be completed.' },
      { status:error instanceof ApiError ? error.status : error instanceof SyntaxError ? 400 : 503, headers });
  }
}
