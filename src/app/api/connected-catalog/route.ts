import { ApiError, obj, sameOrigin, session } from '@/lib/api';
import { connectedCatalog, connectedCatalogConfigured, connectedHomepageConfigured } from '@/lib/connected-catalog';
import { catalogAssetPath, catalogMediaLimit, catalogRequestLimit, isHomepageRequest, parseCatalogRequest } from '@/lib/connected-catalog-contract';

const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const fail = (message: string, status: number) => Response.json({ error: message }, { status, headers });

async function readPayload(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'Send an application/json catalog request.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'The catalog request is empty.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > catalogMediaLimit) {
        await reader.cancel();
        throw new ApiError(413, 'The catalog request exceeds its size limit.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const payload = obj(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
  if (size > catalogRequestLimit && !['media.upload', 'homepage.media'].includes(obj(payload.request).action as string)) {
    throw new ApiError(413, 'The catalog request exceeds its size limit.');
  }
  return payload;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('Open the catalog from this admin panel.', 403);
  try {
    const auth = await session();
    if (!auth) return fail('Sign in to manage the catalog.', 401);
    if (!connectedCatalogConfigured() && !connectedHomepageConfigured()) return fail('The connected catalog is unavailable.', 404);
    const payload = await readPayload(request);
    const catalog = parseCatalogRequest(payload.request);
    if (!catalog || ('read' in catalog && ['asset', 'homepage-asset'].includes(catalog.read)) || Object.keys(payload).some(key => !['region', 'request'].includes(key)) ||
        (payload.region !== 'BD' && payload.region !== 'INTERNATIONAL')) return fail('Choose a catalog command and region.', 400);
    if (!isHomepageRequest(catalog) && !connectedCatalogConfigured()) return fail('The connected catalog is unavailable.', 404);
    return Response.json({ data: await connectedCatalog(auth, payload.region, catalog) }, { headers });
  } catch (error) {
    if (error instanceof ApiError) return fail(error.message, error.status);
    if (error instanceof SyntaxError || error instanceof TypeError) return fail('The catalog request is invalid.', 400);
    return fail('The connected catalog is temporarily unavailable.', 503);
  }
}

export async function GET(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return fail('Open the image from this admin panel.', 403);
  const query = new URL(request.url).searchParams;
  const homepage = query.has('homepageAsset');
  const assetKey = homepage ? 'homepageAsset' : 'asset';
  const asset = query.get(assetKey);
  const region = query.get('region') ?? 'BD';
  if (!catalogAssetPath(asset) || !['BD', 'INTERNATIONAL'].includes(region) ||
      query.size !== new Set(query.keys()).size || [...query.keys()].some(key => ![assetKey, 'region'].includes(key))) {
    return fail('Choose a catalog image and region.', 400);
  }
  try {
    const auth = await session();
    if (!auth) return fail('Sign in to view catalog images.', 401);
    if (!(homepage ? connectedHomepageConfigured() : connectedCatalogConfigured())) return fail('The connected catalog is unavailable.', 404);
    const result = await connectedCatalog<{contentType: string; data: string}>(auth,
      region === 'INTERNATIONAL' ? region : 'BD', { read: homepage ? 'homepage-asset' : 'asset', id: asset });
    if (!['image/webp', 'image/jpeg', 'image/png'].includes(result.contentType) ||
        typeof result.data !== 'string' || result.data.length > catalogMediaLimit * 2) return fail('This image is unavailable.', 502);
    return new Response(Uint8Array.from(Buffer.from(result.data, 'base64')), { headers: { ...headers,
      'Content-Type': result.contentType, 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' } });
  } catch (error) {
    return error instanceof ApiError ? fail(error.message, error.status) : fail('This image is unavailable.', 503);
  }
}
