import { ApiError, getRegion, mongoId, obj, sameOrigin, session, str } from '@/lib/api';
import { catalogImage, productWrite, writeRegistry } from '@/lib/catalog-admin';
import { registryKind } from '@/lib/catalog-edit-fields';
import { connectedCatalogConfigured } from '@/lib/connected-catalog';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Use the catalog workspace to save changes.' }, { status: 403 });
  try {
    const auth = await session();
    if (!auth) throw new ApiError(401, 'Sign in to edit the catalog.');
    if (new URL(request.url).searchParams.get('upload') === '1') {
      if (connectedCatalogConfigured()) throw new ApiError(410, 'Upload product media from the connected product workspace.');
      return Response.json({ url: await catalogImage(request, auth) });
    }
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'Expected a catalog form.');
    const maxLength = 512000;
    if (Number(request.headers.get('content-length')) > maxLength) throw new ApiError(413, 'The catalog form exceeds its size limit.');
    const text = await request.text();
    if (text.length > maxLength) throw new ApiError(413, 'The catalog form exceeds its size limit.');
    const body = obj(JSON.parse(text));
    const kind = str(body.kind), action = str(body.action), id = str(body.id);
    if (body.region !== 'BD' && body.region !== 'INTERNATIONAL' || id && !mongoId(id)) throw new ApiError(400, 'Choose a valid region and record.');
    const region = getRegion(str(body.region), auth.staff);
    const values = obj(body.values);
    let result: unknown;
    if (kind === 'products') {
      if (connectedCatalogConfigured()) throw new ApiError(410, 'Save products from the connected product workspace.');
      result = await productWrite(action, id, values, auth, region);
    }
    else if (registryKind(kind)) result = await writeRegistry(kind, action, id, values, auth, region);
    else throw new ApiError(400, 'Unknown catalog workspace.');
    const record = obj(result);
    return Response.json({ saved: true, id: str(record._id) || str(record.id) || id });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : error instanceof SyntaxError ? 400 : 502;
    const message = error instanceof ApiError ? error.message : 'The catalog API could not confirm this change. Reload before retrying.';
    return Response.json({ error: message }, { status });
  }
}
