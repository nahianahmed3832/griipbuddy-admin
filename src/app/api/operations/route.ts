import { ApiError, getRegion, obj, sameOrigin, session, str } from '@/lib/api';
import { executeOperation, operationId } from '@/lib/operations';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Origin denied', { status: 403 });
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status: 401 });
  if (Number(request.headers.get('content-length')) > 8192 || !request.headers.get('content-type')?.startsWith('application/json')) {
    return new Response('Invalid request', { status: 400 });
  }
  const raw = await request.text();
  if (raw.length > 8192) return new Response('Invalid request', { status: 400 });
  let body;
  try { body = obj(JSON.parse(raw)); }
  catch { return new Response('Invalid request', { status: 400 }); }
  const action = str(body.action);
  const region = str(body.region);
  if (!operationId(action) || !['BD', 'INTERNATIONAL'].includes(region)) return new Response('Invalid action', { status: 400 });
  try {
    const result = await executeOperation(action, str(body.recordId), obj(body.values), getRegion(region, auth.staff), auth);
    return Response.json({ saved: true, ...result });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const message = error.status >= 500 ? 'The recovery API did not confirm the change. Check the record before retrying.' : error.message;
    return new Response(message, { status: error.status });
  }
}
