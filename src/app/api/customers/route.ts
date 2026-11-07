import { NextRequest } from 'next/server';
import { ApiError, arr, canWrite, mongoId, obj, requestApi, sameOrigin, session, str, url } from '@/lib/api';
import { customerFilters } from '@/lib/customers';
import { has } from '@/lib/sections';

const root = '/customer-workspace';
const headers = { 'Cache-Control': 'private, no-store' };
const reject = (message: string, status: number) => new Response(message, { status, headers });

export async function GET(request: NextRequest) {
  try {
    const auth = await session();
    if (!auth) return reject('Sign in required.', 401);
    if (!['user.view', 'manage-permissions'].every(key => has(auth.staff, key))) return reject('Export permission required.', 403);
    const query = Object.fromEntries(customerFilters.map(key => [key, request.nextUrl.searchParams.get(key)?.slice(0, 100)]));
    const response = await requestApi(url(root + '/export', query), auth.token);
    if (!response.ok) {
      return reject(response.status === 422 ? 'Narrow the filters to export up to 10,000 accounts.' : 'Customer export is unavailable.', response.status);
    }
    return new Response(response.body, { headers: {
      ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="customers.xlsx"', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    return reject('Customer export is unavailable.', error instanceof ApiError ? error.status : 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject('Origin denied.', 403);
  try {
    const auth = await session();
    if (!auth) return reject('Sign in required.', 401);
    if (!canWrite(auth.staff) || !has(auth.staff, 'user.view')) return reject('Customer updates are restricted.', 403);
    const id = request.nextUrl.searchParams.get('id');
    if (id !== null && !mongoId(id)) return reject('Customer not found.', 404);
    if (!has(auth.staff, id ? 'user.update' : 'user.create')) return reject('Customer update permission required.', 403);
    const limit = 8000;
    if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > limit) {
      return reject('Invalid customer request.', 400);
    }
    const body = await request.text();
    if (Buffer.byteLength(body) > limit) return reject('Customer request is too large.', 413);
    try { JSON.parse(body); } catch { return reject('Invalid customer request.', 400); }
    const response = await requestApi(id ? root + '/' + id : root, auth.token, { method: id ? 'PATCH' : 'POST', body });
    const payload = obj(await response.json());
    if (!response.ok) {
      const validation = str(obj(arr(payload.errorMessages)[0]).message);
      return reject(response.status >= 500 ? 'The service did not confirm the change. Refresh the record before retrying.'
        : (response.status === 400 ? validation : str(payload.message)).slice(0, 300) || 'Check the customer information and try again.', response.status);
    }
    if (payload.success !== true) return reject('The service did not confirm the change.', 502);
    return Response.json(payload.data, { status: response.status, headers });
  } catch (error) {
    return reject('The service did not confirm the change. Refresh the record before retrying.', error instanceof ApiError ? error.status : 503);
  }
}
