import { NextRequest } from 'next/server';
import { ApiError, getRegion, obj, sameOrigin, session } from '@/lib/api';
import { hybridOrderId, saveHybridFulfillment } from '@/lib/hybrid-orders';

const headers = { 'Cache-Control': 'private, no-store' };
const reject = (message: string, status: number) => new Response(message, { status, headers });

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject('Origin denied.', 403);
  const auth = await session();
  if (!auth) return reject('Sign in required.', 401);
  const id = hybridOrderId(request.nextUrl.searchParams.get('id') ?? '');
  if (!id) return reject('Order not found.', 404);
  const limit = 14_000;
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > limit) {
    return reject('Invalid fulfillment request.', 400);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > limit) return reject('Fulfillment request is too large.', 413);
  let command;
  try { command = obj(JSON.parse(raw)); } catch { return reject('Invalid fulfillment request.', 400); }
  try {
    const region = getRegion(request.nextUrl.searchParams.get('region') ?? undefined, auth.staff);
    await saveHybridFulfillment(id, auth, region, command);
    return Response.json({ saved: true }, { headers });
  } catch (error) {
    return error instanceof ApiError ? reject(error.message, error.status)
      : reject('Could not confirm the fulfillment change. Refresh the order before retrying.', 503);
  }
}
