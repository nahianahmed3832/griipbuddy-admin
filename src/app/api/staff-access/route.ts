import { ApiError, canWrite, mongoId, obj, requestApi, sameOrigin, session, staffEnrollmentAvailable, str } from '@/lib/api';
import { endpoint } from '@/lib/staff-access';

const send = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return send({ message: 'Origin denied.' }, 403);
  if (!req.headers.get('content-type')?.startsWith('application/json')) return send({ message: 'Invalid request.' }, 400);
  if (Number(req.headers.get('content-length')) > 15000) return send({ message: 'Request is too large.' }, 413);
  const raw = await req.text();
  if (raw.length > 15000) return send({ message: 'Request is too large.' }, 413);
  try {
    const body = obj(JSON.parse(raw));
    const action = str(body.action);
    if (['invite', 'accept', 'reissue'].includes(action) && !staffEnrollmentAvailable()) {
      return send({ message: 'Staff enrollment is unavailable in this workspace.' }, 403);
    }
    const id = str(body.id);
    if (id && !mongoId(id)) return send({ message: 'Invalid account or role ID.' }, 400);
    const targets: Record<string, [string, string, boolean]> = {
      accept: ['POST', '/accept', false],
      invite: ['POST', '/directory', false],
      'staff-edit': ['PUT', '/directory/' + id, true],
      suspend: ['POST', '/directory/' + id + '/suspend', true],
      reactivate: ['POST', '/directory/' + id + '/reactivate', true],
      cancel: ['POST', '/directory/' + id + '/cancel', true],
      reissue: ['POST', '/directory/' + id + '/reissue', true],
      'role-create': ['POST', '/roles', false],
      'role-edit': ['PUT', '/roles/' + id, true],
      'role-delete': ['DELETE', '/roles/' + id, true],
    };
    if (!Object.hasOwn(targets, action)) return send({ message: 'Unknown action.' }, 400);
    const [method, path, needsId] = targets[action];
    if (needsId !== Boolean(id)) return send({ message: 'Invalid action target.' }, 400);
    const auth = action === 'accept' ? null : await session();
    if (action !== 'accept' && !auth) return send({ message: 'Sign in to continue.' }, 401);
    if (action !== 'accept' && !canWrite(auth!.staff)) return send({ message: 'Staff management is read-only in this workspace.' }, 403);
    const result = await requestApi(endpoint + path, auth?.token, {
      method, ...(method !== 'DELETE' && { body: JSON.stringify(obj(body.values)) }),
    });
    const payload = obj(await result.json());
    if (!result.ok) return send({ message: result.status < 500 && str(payload.message) || 'The staff API could not complete this action.' }, result.status);
    if (payload.success !== true) return send({ message: 'The staff API returned an unexpected response.' }, 502);
    return send(payload.data, result.status);
  } catch (error) {
    if (error instanceof SyntaxError) return send({ message: 'Invalid request.' }, 400);
    return send({ message: 'The staff API is unavailable. Try again.' }, error instanceof ApiError && error.status >= 500 ? error.status : 503);
  }
}
