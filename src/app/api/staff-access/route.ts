import { api, ApiError, canWrite, mongoId, obj, requestApi, sameOrigin, session, staffEnrollmentAvailable, str, workspaceWritesEnabled } from '@/lib/api';
import { endpoint } from '@/lib/staff-access';
import { has, superAdmin } from '@/lib/sections';

const send = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const actions = {
  accept: ['POST', '/accept', false, null],
  invite: ['POST', '/directory', false, 'user.create'],
  'staff-edit': ['PUT', '/directory/:id', true, 'user.update'],
  suspend: ['POST', '/directory/:id/suspend', true, 'user.update'],
  reactivate: ['POST', '/directory/:id/reactivate', true, 'user.update'],
  cancel: ['POST', '/directory/:id/cancel', true, 'user.update'],
  reissue: ['POST', '/directory/:id/reissue', true, 'user.update'],
  'role-create': ['POST', '/roles', false, 'role.create'],
  'role-edit': ['PUT', '/roles/:id', true, 'role.update'],
  'role-delete': ['DELETE', '/roles/:id', true, 'role.delete'],
} as const;

export async function GET(req: Request) {
  const auth = await session();
  if (!auth) return send({ message: 'Sign in to continue.' }, 401);
  if (!superAdmin(auth.staff) || !has(auth.staff, 'user.view') || !has(auth.staff, 'role.view')) {
    return send({ message: 'Access denied.' }, 403);
  }
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!mongoId(id)) return send({ message: 'Invalid account ID.' }, 400);
  try {
    const [staff, editor] = await Promise.all([
      api(endpoint + '/directory/' + id, auth.token).then(obj),
      api(endpoint + '/role-editor', auth.token).then(obj),
    ]);
    return send({ permissions: staff.permissions, catalog: editor.catalog });
  } catch (error) {
    return send({ message: 'Could not load staff permissions.' }, error instanceof ApiError ? error.status : 503);
  }
}

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
    if (action === 'staff-create' || action === 'staff-update') {
      const edit = action === 'staff-update';
      if (edit !== Boolean(id)) return send({ message: 'Invalid account target.' }, 400);
      const auth = await session();
      if (!auth) return send({ message: 'Sign in to continue.' }, 401);
      if (!workspaceWritesEnabled() || !has(auth.staff, 'user.view') ||
          !has(auth.staff, edit ? 'user.update' : 'user.create') || (!edit && !staffEnrollmentAvailable())) {
        return send({ message: 'Staff management is read-only in this workspace.' }, 403);
      }
      const values = obj(body.values);
      const password = str(values.password);
      if ((!edit || password) && ([...password].length < 15 || [...password].length > 128 || password !== values.confirmation)) {
        return send({ message: 'Enter matching passwords containing 15 to 128 characters.' }, 400);
      }
      const response = await requestApi(edit ? '/user/update/staff/' + id : '/user/recruit/staff', auth.token, {
        method: edit ? 'PUT' : 'POST',
        body: JSON.stringify({ full_name: str(values.full_name), email: str(values.email), phone_number: str(values.phone_number),
          gender: str(values.gender), role_ref: str(values.role_ref), business_location: values.business_location || null,
          ...(password && { password }) }),
      });
      const result = obj(await response.json());
      if (!response.ok) return send({ message: response.status < 500 && str(result.message) || 'The staff API could not save the account.' }, response.status);
      return result.success === true ? send({ success: true }, response.status) : send({ message: 'The staff API returned an unexpected response.' }, 502);
    }
    if (action === 'staff-permissions' || action === 'staff-delete') {
      const auth = await session();
      if (!auth) return send({ message: 'Sign in to continue.' }, 401);
      const remove = action === 'staff-delete';
      if (!canWrite(auth.staff) || !superAdmin(auth.staff) || !has(auth.staff, remove ? 'user.delete' : 'manage-permissions') ||
          !id || id === auth.staff.id) return send({ message: 'Staff action is restricted.' }, 403);
      // Only staff directory IDs can reach the guarded soft-delete route.
      const target = obj(await api(endpoint + '/directory/' + id, auth.token));
      if (target.protected === true) return send({ message: 'This staff account is protected.' }, 403);
      const response = await requestApi(remove ? '/user/delete/' + id : '/permissions', auth.token, {
        method: remove ? 'DELETE' : 'PATCH',
        ...(!remove && { body: JSON.stringify({ id, permissions: obj(body.values).permissions }) }),
      });
      const result = obj(await response.json());
      if (!response.ok || result.success !== true) {
        return send({ message: response.status < 500 && str(result.message) || 'The staff API could not complete this action.' },
          response.ok ? 502 : response.status);
      }
      return send({ success: true });
    }
    if (!Object.hasOwn(actions, action)) return send({ message: 'Unknown action.' }, 400);
    const [method, path, needsId, permission] = actions[action as keyof typeof actions];
    if (needsId !== Boolean(id)) return send({ message: 'Invalid action target.' }, 400);
    const auth = permission ? await session() : null;
    if (permission && !auth) return send({ message: 'Sign in to continue.' }, 401);
    if (permission && auth && (!workspaceWritesEnabled() || !has(auth.staff, permission))) {
      return send({ message: 'Staff action is restricted in this workspace.' }, 403);
    }
    const result = await requestApi(endpoint + path.replace(':id', id), auth?.token, {
      method, ...(method !== 'DELETE' && { body: JSON.stringify(obj(body.values)) }),
    });
    const payload = obj(await result.json());
    if (!result.ok) return send({ message: result.status < 500 && str(payload.message) || 'The staff API could not complete this action.' }, result.status);
    if (payload.success !== true) return send({ message: 'The staff API returned an unexpected response.' }, 502);
    return send(payload.data, result.status);
  } catch (error) {
    if (error instanceof SyntaxError) return send({ message: 'Invalid request.' }, 400);
    if (error instanceof ApiError && error.status < 500) return send({ message: error.message }, error.status);
    return send({ message: 'The staff API is unavailable. Try again.' }, error instanceof ApiError && error.status >= 500 ? error.status : 503);
  }
}
