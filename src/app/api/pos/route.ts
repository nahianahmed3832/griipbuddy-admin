import { ApiError, obj, sameOrigin, session, str } from '@/lib/api';
import { changePosSale, posRegisterFilters, posReturnDetails, readPosSale, searchPosCustomers, searchPosItems } from '@/lib/production-pos';
import { posRegisterExport } from '@/lib/pos-export';
import { has } from '@/lib/sections';
import { counterPrivate, downloadCounterReceipt, readCounterPos, writeCounterPos } from '@/lib/counter-pos';
import type { CounterReceipt } from '@/lib/counter-pos-contract';

const noStore = { 'Cache-Control': 'private, no-store' };
const failure = (error: unknown, headers = noStore) => error instanceof ApiError
  ? new Response(error.status >= 500 ? 'The sales service did not confirm the request.' : error.message, { status: error.status, headers })
  : new Response('Invalid sale request.', { status: 400, headers });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const action = q.get('action');
  const counter = action?.startsWith('counter-');
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status: 401, headers: counter ? counterPrivate : noStore });
  const search = q.get('q')?.trim() ?? '';
  try {
    if (action && counter) {
      const result = await readCounterPos(auth, action, q);
      return action === 'counter-receipt-download'
        ? downloadCounterReceipt(result as CounterReceipt) : Response.json(result, { headers: counterPrivate });
    }
    if ((action === 'products' || action === 'scan') && search.length >= 2 && search.length <= 100) {
      return Response.json(await searchPosItems(q.get('location') || '', search, auth, action === 'scan'), { headers: noStore });
    }
    if (action === 'customers') return Response.json(await searchPosCustomers(search, auth), { headers: noStore });
    if (action === 'return' && has(auth.staff, 'pos.update')) {
      return Response.json(posReturnDetails(await readPosSale(q.get('id') || '', auth)), { headers: noStore });
    }
    if (action !== 'xlsx' && action !== 'pdf') return new Response('Unknown sale action.', { status: 404 });
    return await posRegisterExport(action, await posRegisterFilters(Object.fromEntries(q), auth), auth);
  } catch (error) { return failure(error, counter ? counterPrivate : noStore); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Origin denied', { status: 403, headers: noStore });
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status: 401 });
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 16384) {
    return new Response('Invalid sale request.', { status: 400 });
  }
  const body = await request.text();
  if (body.length > 16384) return new Response('Invalid sale request.', { status: 400 });
  try {
    const input = obj(JSON.parse(body));
    const action = str(input.action);
    if (action.startsWith('counter-')) {
      try {
        return Response.json(await writeCounterPos(auth, action, obj(input.values)), { headers: counterPrivate });
      } catch (error) { return failure(error, counterPrivate); }
    }
    await changePosSale(str(input.id), input.action, obj(input.values), auth);
    return Response.json({ saved: true });
  } catch (error) { return failure(error); }
}
