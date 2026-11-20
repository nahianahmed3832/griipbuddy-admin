import { ApiError, mongoId, obj, requestApi, sameOrigin, session, str } from '@/lib/api';
import { requireWrite } from '@/lib/advanced';

const endpoint = '/cms/admin/top-bar-messages';
const headers = { 'Cache-Control': 'private, no-store' };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('Origin denied.', 403);
  const auth = await session();
  if (!auth) return fail('Sign in required.', 401);
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 2048) {
    return fail('Invalid message.', 400);
  }
  try {
    const raw = await request.text();
    if (raw.length > 2048) return fail('Invalid message.', 400);
    const input = obj(JSON.parse(raw));
    const action = str(input.action);
    const id = str(input.id);
    if (!['create', 'edit', 'delete', 'toggle'].includes(action) || (action !== 'create' && !mongoId(id))) {
      return fail('Invalid message action.', 400);
    }
    requireWrite(auth, 'cms.view', action === 'create' ? 'cms.create' : action === 'delete' ? 'cms.delete' : 'cms.update');
    const content = action === 'create' || action === 'edit';
    const message = str(input.message).trim();
    if (content && (!message || message.length > 200 || typeof input.enabled !== 'boolean')) return fail('Enter up to 200 characters.', 400);
    const path = action === 'create' ? endpoint : endpoint + '/' + id + (action === 'toggle' ? '/toggle' : '');
    const response = await requestApi(path, auth.token, {
      method: action === 'create' ? 'POST' : action === 'delete' ? 'DELETE' : 'PATCH',
      ...(content && { body: JSON.stringify({ message, enabled: input.enabled }) }),
    });
    const result = obj(await response.json());
    if (!response.ok || result.success !== true) {
      return fail(response.status < 500 && str(result.message) || 'Could not save the message.', response.ok ? 502 : response.status);
    }
    return Response.json({ message: str(result.message) }, { headers });
  } catch (error) {
    return fail('Could not save the message.', error instanceof ApiError ? error.status : error instanceof SyntaxError ? 400 : 503);
  }
}
