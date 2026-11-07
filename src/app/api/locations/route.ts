import { ApiError, canWrite, getRegion, mongoId, obj, requestApi, sameOrigin, session, str, url } from '@/lib/api';
import { locationsEndpoint } from '@/lib/locations';
import { has } from '@/lib/sections';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Origin denied.', { status: 403 });
  const auth = await session();
  if (!auth) return new Response('Sign in required.', { status: 401 });
  const query = new URL(request.url).searchParams;
  const region = query.get('region');
  const id = query.get('id');
  if ((region !== 'BD' && region !== 'INTERNATIONAL') || (id !== null && !mongoId(id))) {
    return new Response('Invalid location request.', { status: 400 });
  }
  if (!canWrite(auth.staff) || !has(auth.staff, 'business_locations.view')
    || !has(auth.staff, id ? 'business_locations.update' : 'business_locations.create')) {
    return new Response('You do not have permission to save this location.', { status: 403 });
  }
  const limit = 16_384;
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > limit) {
    return new Response('Invalid location request.', { status: 400 });
  }
  const body = await request.text();
  if (Buffer.byteLength(body) > limit) return new Response('The location details are too long.', { status: 413 });
  const unconfirmed = 'The location service did not confirm the save. Check the directory before trying again.';
  try {
    getRegion(region, auth.staff);
    const response = await requestApi(url(locationsEndpoint + (id ? '/' + id : ''), { region }), auth.token, {
      method: id ? 'PUT' : 'POST',
      body,
    });
    const result = obj(await response.json().catch(() => null));
    if (!response.ok) {
      const message = str(result.message).slice(0, 240);
      return new Response(response.status < 500 && message ? message : unconfirmed, { status: response.status });
    }
    const savedId = str(obj(result.data).id);
    if (result.success !== true || !mongoId(savedId)) return new Response(unconfirmed, { status: 502 });
    return Response.json({ id: savedId }, { status: response.status });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 503;
    return new Response(status === 403 ? 'You do not have access to this operating region.' : unconfirmed, { status });
  }
}
