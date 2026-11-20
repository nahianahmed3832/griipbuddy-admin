import { NextRequest } from 'next/server';
import { api, ApiError, canWrite, mongoId, obj, sameOrigin, session } from '@/lib/api';
import { marketList } from '@/components/connected-catalog-product/markets';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new Response('Origin denied', { status: 403 });
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status: 401 });
  if (!canWrite(auth.staff)) return new Response('Market changes require a staging administrator', { status: 403 });
  if (Number(req.headers.get('content-length')) > 4096 || !req.headers.get('content-type')?.startsWith('application/json')) return new Response('Invalid payload', { status: 400 });
  const raw = await req.text();
  if (raw.length > 4096) return new Response('Invalid payload', { status: 400 });
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body.id !== 'string' || !mongoId(body.id) || typeof body.isActive !== 'boolean'
      || !['BDT','USD','EUR','AUD'].includes(body.currency)) return new Response('Invalid country settings', { status: 400 });
    const path = '/country/' + body.id;
    const country = obj(await api(path, auth.token));
    if (typeof country.code !== 'string' || !/^[A-Z]{2}$/.test(country.code)) throw new ApiError(404);
    const market = marketList.find(entry => entry.countryCode === country.code);
    if (market && market.currency !== body.currency) {
      return new Response('The currency does not match this operating market.', { status: 422 });
    }
    await api(path, auth.token, { method: 'PATCH', body: JSON.stringify({ is_active: body.isActive, currency: body.currency }) });
    return Response.json({ saved: true });
  } catch (error) {
    return new Response('Could not save market settings', { status: error instanceof ApiError ? error.status : 400 });
  }
}
