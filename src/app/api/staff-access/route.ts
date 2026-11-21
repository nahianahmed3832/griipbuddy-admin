import { NextResponse } from 'next/server';
import { api, ApiError, canWrite, hosted, mongoId, obj, requestApi, sameOrigin, session, sessionCookie, staffEnrollmentAvailable, staffProfileAvailable, str, workspaceWritesEnabled } from '@/lib/api';
import { prefix } from '@/lib/paths';
import { endpoint } from '@/lib/staff-access';
import { has, superAdmin } from '@/lib/sections';

const send = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const actions = {
  accept: ['POST', '/accept', false, null],
  'staff-create': ['POST', '/directory', false, 'user.create'],
  'staff-edit': ['PUT', '/directory/:id', true, 'user.update'],
  suspend: ['POST', '/directory/:id/suspend', true, 'user.update'],
  reactivate: ['POST', '/directory/:id/reactivate', true, 'user.update'],
  cancel: ['POST', '/directory/:id/cancel', true, 'user.update'],
  revoke: ['POST', '/directory/:id/revoke', true, 'user.update'],
  'staff-password': ['POST', '/directory/:id/password', true, 'user.update'],
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
  if (req.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return send({ message: 'Invalid request.' }, 400);
  if (Number(req.headers.get('content-length')) > 15000) return send({ message: 'Request is too large.' }, 413);
  const raw = await req.text();
  if (raw.length > 15000) return send({ message: 'Request is too large.' }, 413);
  try {
    const body = obj(JSON.parse(raw));
    const action = str(body.action);
    if (Object.keys(body).some(key => !['action', 'id', 'values'].includes(key))) return send({ message: 'Invalid request.' }, 400);
    if (['staff-create', 'accept'].includes(action) && !staffEnrollmentAvailable()) {
      return send({ message: 'Staff enrollment is unavailable in this workspace.' }, 403);
    }
    const id = str(body.id);
    if (id && !mongoId(id)) return send({ message: 'Invalid account or role ID.' }, 400);
    if (action === 'profile-edit' || action === 'profile-password') {
      if (id) return send({ message: 'Invalid account target.' }, 400);
      const auth = await session();
      if (!auth) return send({ message: 'Sign in to continue.' }, 401);
      if (!staffProfileAvailable() || !workspaceWritesEnabled()) {
        return send({ message: 'Staff profile changes are unavailable in this workspace.' }, 403);
      }
      const changePassword = action === 'profile-password';
      if (auth.staff.passwordRotationRequired && !changePassword) {
        return send({ message: 'Change your password before editing your profile.' }, 403);
      }
      const result = await requestApi(endpoint + (changePassword ? '/profile/password' : '/profile'), auth.token, {
        method: changePassword ? 'POST' : 'PUT', body: JSON.stringify(obj(body.values)),
      });
      const payload = obj(await result.json());
      if (!result.ok) return send({ message: result.status < 500 && str(payload.message) || 'The staff API could not save the profile.' }, result.status);
      if (payload.success !== true) return send({ message: 'The staff API returned an unexpected response.' }, 502);
      const response = send({ success: true }, result.status);
      if (changePassword) response.cookies.set(sessionCookie, '', {
        secure: hosted(), httpOnly: true, sameSite: 'strict', path: prefix || '/', maxAge: 0,
      });
      return response;
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
    if (action === 'staff-password' && auth && !superAdmin(auth.staff)) {
      return send({ message: 'Only a platform administrator can set another staff password.' }, 403);
    }
    const result = await requestApi(endpoint + path.replace(':id', id), auth?.token, {
      method, ...(method !== 'DELETE' && { body: JSON.stringify(obj(body.values)) }),
    });
    const payload = obj(await result.json());
    if (!result.ok) return send({ message: result.status < 500 && str(payload.message) || 'The staff API could not complete this action.' }, result.status);
    if (payload.success !== true) return send({ message: 'The staff API returned an unexpected response.' }, 502);
    // Staff credentials and setup tokens are write-only on management routes.
    return send({ success: true }, result.status);
  } catch (error) {
    if (error instanceof SyntaxError) return send({ message: 'Invalid request.' }, 400);
    if (error instanceof ApiError && error.status < 500) return send({ message: error.message }, error.status);
    return send({ message: 'The staff API is unavailable. Try again.' }, error instanceof ApiError && error.status >= 500 ? error.status : 503);
  }
}
