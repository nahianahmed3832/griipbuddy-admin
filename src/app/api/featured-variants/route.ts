import { type NextRequest } from 'next/server';
import { api, ApiError, arr, canWrite, mongoId, obj, requestApi, sameOrigin, session, str, url } from '@/lib/api';
import { has } from '@/lib/sections';

const headers = { 'Cache-Control': 'private, no-store' };
const path = '/cms/admin/featured-variants';
const failure = (message: string, status: number) => Response.json({ message }, { status, headers });

export async function GET(request: NextRequest) {
  const auth = await session();
  if (!auth) return failure('Sign in required.', 401);
  if (!has(auth.staff, 'cms.view') || !has(auth.staff, 'product.view')) return failure('Access restricted.', 403);
  const search = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (search.length < 2 || search.length > 100) return failure('Enter a product name or SKU.', 400);
  try {
    const result = obj(await api(url('/product/admin/variants', {
      searchQuery: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), region: 'BD', page: '1', limit: '20',
    }), auth.token));
    const rows = arr(result.data).map(obj).flatMap(variant => {
      const product = obj(variant.product);
      const id = str(variant._id), owner = str(product._id);
      if (!mongoId(id) || !mongoId(owner) || str(product.region) && product.region !== 'BD') return [];
      return [{ product: owner, variant: id, name: str(product.name), sku: str(variant.sku) }];
    });
    return Response.json(rows, { headers });
  } catch (error) {
    return failure('Could not search product variants.', error instanceof ApiError ? error.status : 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return failure('Origin denied.', 403);
  const auth = await session();
  if (!auth) return failure('Sign in required.', 401);
  const remove = request.nextUrl.searchParams.get('remove');
  if (!canWrite(auth.staff) || !has(auth.staff, 'cms.view') || !has(auth.staff, remove ? 'cms.delete' : 'cms.create') ||
      (!remove && !has(auth.staff, 'product.view'))) return failure('Access restricted.', 403);
  if (remove && !mongoId(remove)) return failure('Choose a valid variant.', 400);
  try {
    let body: string | undefined;
    if (!remove) {
      if (Number(request.headers.get('content-length')) > 3000 || !request.headers.get('content-type')?.startsWith('application/json')) {
        return failure('Choose a valid variant.', 400);
      }
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 3000) return failure('Choose a valid variant.', 413);
      const payload = obj(JSON.parse(raw));
      const product = str(payload.product), variant = str(payload.variant);
      if (!mongoId(product) || !mongoId(variant)) return failure('Choose a valid variant.', 400);
      body = JSON.stringify({ product, variant });
    }
    const response = await requestApi(path + (remove ? '/' + remove : ''), auth.token, { method: remove ? 'DELETE' : 'POST', body });
    const result = obj(await response.json());
    if (!response.ok || result.success !== true) {
      return failure(response.status < 500 && str(result.message).slice(0, 250) || 'Could not change the featured products.', response.ok ? 502 : response.status);
    }
    return Response.json(result.data, { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return failure('Choose a valid variant.', 400);
    return failure('Could not change the featured products.', error instanceof ApiError ? error.status : 503);
  }
}
